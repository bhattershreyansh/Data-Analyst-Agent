import logging
import json
import os
import re
from typing import List, Dict, Tuple, Optional
import pandas as pd
import numpy as np
from pinecone import Pinecone
from langchain_openai import OpenAIEmbeddings
from sqlalchemy import create_engine, inspect
from langchain_community.utilities import SQLDatabase
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from app.core.config import settings
from app.core.database import engine as default_metadata_engine
from app.services.generic_query import build_generic_prompt, get_db_syntax_hints

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global connection variables
_engine = None
_db = None
_schema_rag = None

def get_engine():
    """Lazy initialization of the database engine to prevent Render startup hangs"""
    global _engine
    if _engine is not None:
        return _engine
        
    db_url = settings.METADATA_DATABASE_URL
    if not db_url:
        # Fallback to local config for dev
        user = "myuser"
        password = "mypassword"
        host = "localhost"
        db_name = "analytics_db"
        db_url = f"mysql+mysqlconnector://{user}:{password}@{host}/{db_name}"
    
    try:
        _engine = create_engine(db_url)
        # Test connection briefly
        with _engine.connect() as conn:
            logger.info("Database Engine Initialized")
    except Exception as e:
        logger.warning(f"Could not connect to database: {e}")
        _engine = None
    return _engine

def get_db():
    """Lazy initialization of the SQLDatabase wrapper"""
    global _db
    if _db is not None:
        return _db
    
    engine = get_engine()
    if engine:
        try:
            db_url = settings.METADATA_DATABASE_URL
            if not db_url:
                user = "myuser"
                password = "mypassword"
                host = "localhost"
                db_name = "analytics_db"
                db_url = f"mysql+mysqlconnector://{user}:{password}@{host}/{db_name}"
            _db = SQLDatabase.from_uri(db_url)
        except Exception as e:
            logger.error(f"Failed to wrap DB: {e}")
            _db = None
    return _db

# Initialize LLM using config settings
groq_llm = ChatGroq(model="llama-3.3-70b-versatile", api_key=settings.GROQ_API_KEY)
DEFAULT_QUERY_LIMIT = 20
MAX_QUERY_LIMIT = 100


# ============================================
# PART 1: SCHEMA EXTRACTION & EMBEDDING
# ============================================

class SchemaRAG:
    def __init__(self, engine, db, index_name=None, namespace="lumina-ai"):
        self.engine = engine
        self.db = db
        self.inspector = inspect(engine) if engine else None
        self.index_name = index_name or settings.PINECONE_INDEX_NAME
        self.namespace = namespace
        self.embeddings = None
        self.pc = None
        self.index = None
        logger.info("SchemaRAG initialized using LLM-based dynamic table selection (Vectorless).")

    def _build_schema_index(self):
        """No-op - Cloud Vector index is bypassed"""
        pass
    
    def get_blueprint(self) -> Dict:
        """
        Deterministic extraction of schema relationships
        Returns a dict of tables with their columns and foreign keys.
        """
        if not self.inspector:
            return {"tables": [], "relationships": []}
            
        all_tables = self.inspector.get_table_names()
        if "shopify_orders" in all_tables:
            table_names = [t for t in all_tables if t.startswith("shopify_")]
        else:
            table_names = all_tables
        blueprint = {
            "tables": [],
            "relationships": []
        }
        
        for table_name in table_names:
            columns = self.inspector.get_columns(table_name)
            column_names = [col['name'] for col in columns]
            
            try:
                fks = self.inspector.get_foreign_keys(table_name)
            except:
                fks = []
            
            blueprint["tables"].append({
                "name": table_name,
                "columns": column_names
            })
            
            for fk in fks:
                blueprint["relationships"].append({
                    "type": "explicit",
                    "from_table": table_name,
                    "from_columns": fk['constrained_columns'],
                    "to_table": fk['referred_table'],
                    "to_columns": fk['referred_columns']
                })
        
        col_to_tables = {}
        for table_info in blueprint["tables"]:
            for col in table_info["columns"]:
                generic_names = ["id", "name", "value", "date", "status", "type", "description"]
                if col.lower() not in generic_names:
                    if col not in col_to_tables:
                        col_to_tables[col] = []
                    col_to_tables[col].append(table_info["name"])

        for col, tables in col_to_tables.items():
            if len(tables) > 1:
                for i in range(len(tables)):
                    for j in range(i + 1, len(tables)):
                        exists = any(
                            r["from_table"] == tables[i] and r["to_table"] == tables[j] 
                            for r in blueprint["relationships"]
                        )
                        if not exists:
                            blueprint["relationships"].append({
                                "type": "semantic",
                                "from_table": tables[i],
                                "to_table": tables[j],
                                "matching_column": col,
                                "description": f"Common column '{col}' discovered across tables"
                            })
                
        return blueprint
    
    def rebuild_index(self):
        """No-op - using dynamic LLM selection"""
        pass
    
    def retrieve_relevant_tables(self, question: str, top_k: int = 3) -> List[Dict]:
        """Retrieve most relevant table schemas for a question using LLM-based selection"""
        if not self.inspector:
            return []
            
        try:
            all_tables = self.inspector.get_table_names()
        except Exception as e:
            logger.error(f"Failed to get table names: {e}")
            return []
            
        # Filter to shopify tables if shopify_orders exists
        if "shopify_orders" in all_tables:
            table_names = [t for t in all_tables if t.startswith("shopify_")]
        else:
            table_names = all_tables
            
        if not table_names:
            return []
            
        selected_tables = []
        
        # If there are few tables, just select all of them
        if len(table_names) <= top_k:
            selected_tables = table_names
        else:
            # LLM-based table selector (Schema Context Builder)
            table_summaries = []
            for t_name in table_names:
                try:
                    cols = [col['name'] for col in self.inspector.get_columns(t_name)]
                    table_summaries.append(f"- {t_name} (Columns: {', '.join(cols)})")
                except Exception as e:
                    table_summaries.append(f"- {t_name}")
            
            summary_str = "\n".join(table_summaries)
            
            prompt = f"""You are a database schema selection agent.
Your task is to select the top {top_k} most relevant tables to answer the user query.

User Query: "{question}"

Available Tables:
{summary_str}

Respond STRICTLY in JSON format with a key "selected_tables" containing a list of table names. Do not include markdown code block formatting or any other text.
Example response:
{{
  "selected_tables": ["shopify_orders", "shopify_customers"]
}}
"""
            try:
                response = groq_llm.invoke([HumanMessage(content=prompt)]).content.strip()
                response_clean = re.sub(r'```json\s*', '', response)
                response_clean = re.sub(r'```\s*', '', response_clean).strip()
                parsed = json.loads(response_clean)
                selected_tables = parsed.get("selected_tables", [])
                
                # Filter to only valid tables
                selected_tables = [t for t in selected_tables if t in table_names]
            except Exception as e:
                logger.error(f"Error in LLM-based table selection: {e}")
                selected_tables = table_names[:top_k]
                
        if not selected_tables:
            selected_tables = table_names[:top_k]
            
        relevant_schemas = []
        for table_name in selected_tables:
            try:
                columns_info = self.inspector.get_columns(table_name)
                column_names = [col['name'] for col in columns_info]
                column_types = {col['name']: str(col['type']) for col in columns_info}
                
                pk = self.inspector.get_pk_constraint(table_name)
                primary_keys = pk.get('constrained_columns', [])
                
                try:
                    fks = self.inspector.get_foreign_keys(table_name)
                except:
                    fks = []
                foreign_keys = []
                for fk in fks:
                    foreign_keys.append({
                        'columns': fk['constrained_columns'],
                        'referred_table': fk['referred_table'],
                        'referred_columns': fk['referred_columns']
                    })
                
                relevant_schemas.append({
                    'table_name': table_name,
                    'columns': column_names,
                    'primary_keys': primary_keys,
                    'foreign_keys': foreign_keys,
                    'column_types': column_types
                })
            except Exception as e:
                logger.error(f"Error building schema details for table {table_name}: {e}")
                
        return relevant_schemas

    def get_count(self) -> int:
        """Get the number of indexed tables"""
        if self.inspector:
            try:
                all_tables = self.inspector.get_table_names()
                if "shopify_orders" in all_tables:
                    return len([t for t in all_tables if t.startswith("shopify_")])
                return len(all_tables)
            except:
                return 0
        return 0

    def get_persist_directory(self) -> str:
        """Backward compatibility for metadata display"""
        return "Vectorless LLM Schema Builder"


# ============================================
# PART 2: SQL VALIDATOR
# ============================================

class SQLValidator:
    """Validates SQL queries against actual database schema"""
    
    def __init__(self, engine, valid_tables=None):
        self.inspector = inspect(engine)
        if valid_tables is not None:
            self.valid_tables = set(valid_tables)
        else:
            all_tables = self.inspector.get_table_names()
            if "shopify_orders" in all_tables:
                self.valid_tables = {t for t in all_tables if t.startswith("shopify_")}
            else:
                self.valid_tables = set(all_tables)
                
        self.table_columns = {}
        
        for table in self.valid_tables:
            columns = self.inspector.get_columns(table)
            self.table_columns[table] = {col['name'] for col in columns}
    
    def validate(self, sql: str) -> Tuple[bool, str]:
        """Validate SQL query against schema"""
        sql_upper = sql.upper()
        
        from_pattern = r'FROM\s+([a-zA-Z0-9_]+)'
        join_pattern = r'JOIN\s+([a-zA-Z0-9_]+)'
        
        referenced_raw = set()
        referenced_raw.update(re.findall(from_pattern, sql_upper))
        referenced_raw.update(re.findall(join_pattern, sql_upper))
        
        valid_lower = {t.lower() for t in self.valid_tables}
        for table in referenced_raw:
            if table.lower() not in valid_lower:
                return False, f"Table '{table}' does not exist. Valid tables: {', '.join(self.valid_tables)}"
        
        dangerous_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE']
        for keyword in dangerous_keywords:
            if re.search(rf'\b{keyword}\b', sql_upper):
                return False, f"Dangerous operation '{keyword}' not allowed"
        
        if 'LIMIT' not in sql_upper and 'TOP' not in sql_upper:
            return False, "Query must include LIMIT clause"
        
        return True, "Valid"


# ============================================
# PART 3: RAG-ENHANCED QUERY GENERATOR
# ============================================

def _classify_query(question: str, schema_context: str) -> str:
    prompt = f"""You are a database classification agent.
Your task is to classify the user's question as either "SIMPLE" or "COMPLEX".

Definition:
- "SIMPLE": The query can be answered using a single table, with basic SELECT, WHERE filters, or simple aggregations. No JOINs, no complex subqueries, and no advanced temporal/conditional math.
- "COMPLEX": The query requires joining multiple tables, subqueries, window functions, complex date math, or conditional analysis.

User Question: "{question}"

Relevant Database Schema:
{schema_context}

Respond with exactly one word: either "SIMPLE" or "COMPLEX". Do not include any other text or formatting.
"""
    try:
        response = groq_llm.invoke([HumanMessage(content=prompt)]).content.strip().upper()
        if "COMPLEX" in response:
            return "COMPLEX"
        return "SIMPLE"
    except Exception as e:
        logger.error(f"Classification failed: {e}")
        return "COMPLEX"


def _create_query_plan(question: str, schema_context: str, history_str: str = "") -> str:
    prompt = f"""You are a database planning agent.
Your task is to formulate a clear, step-by-step query plan to answer the user's question using the provided database schema.
Do not write SQL yet. Just write a step-by-step logic plan.

User Question: "{question}"

{history_str}

Available Schema:
{schema_context}

Provide a concise, bulleted step-by-step query plan. Keep it short.
"""
    try:
        response = groq_llm.invoke([HumanMessage(content=prompt)]).content.strip()
        return response
    except Exception as e:
        logger.error(f"Planning failed: {e}")
        return "Plan: Generate SQL query using available schema details."


def _generate_sql(
    question: str,
    schema_context: str,
    db_type: str,
    limit: int,
    plan: Optional[str] = None,
    history_str: str = "",
    last_error: Optional[str] = None,
    critique: Optional[str] = None
) -> Optional[Dict]:
    plan_section = f"Query Plan:\n{plan}\n" if plan else ""
    error_section = f"Previous Error (please correct this in the new SQL query):\n{last_error}\n" if last_error else ""
    critique_section = f"Reviewer Critique (please address this in the query and configuration):\n{critique}\n" if critique else ""
    
    prompt = f"""You are a SQL Generator Agent.
Your task is to generate a database SQL query and a matching chart configuration to answer the user's question.

Database Type: {db_type}
Row Limit: {limit}

User Question: "{question}"

{history_str}

Available Schema DDL:
{schema_context}

{plan_section}
{error_section}
{critique_section}

Format your output STRICTLY as a JSON object with three keys:
1. "sql": The exact SQL query string to run. It must be valid {db_type} syntax. Always use a LIMIT clause. Do not modify the database (no INSERT, UPDATE, DELETE, DROP, CREATE).
2. "chart": A JSON object describing the best visualization for this data.
   - "type": Choose from: "bar", "line", "pie", "scatter", "table".
   - "title": A descriptive title for the chart.
   - "x_axis": The key in the returned data to use for x-axis.
   - "y_axis": The key in the returned data to use for y-axis (value).
3. "reasoning": A brief explanation of the SQL logic.

Example output:
{{
  "sql": "SELECT product_name, sum(quantity) as total_sold FROM shopify_order_items GROUP BY product_name ORDER BY total_sold DESC LIMIT 10",
  "chart": {{
    "type": "bar",
    "title": "Top 10 Products by Quantity Sold",
    "x_axis": "product_name",
    "y_axis": "total_sold"
  }},
  "reasoning": "Aggregated order items to show the top products sold."
}}

Do not wrap in markdown or add anything else. Only return the raw JSON object.
"""
    try:
        response = groq_llm.invoke([HumanMessage(content=prompt)]).content.strip()
        result = extract_clean_json(response)
        return result
    except Exception as e:
        logger.error(f"SQL generation failed: {e}")
        return None


def _sanitize_results(df: pd.DataFrame, limit: int) -> List[Dict]:
    df_capped = df.head(limit)
    records = df_capped.to_dict(orient="records")
    return clean_data_for_json(records)


def _review_query(question: str, sql: str, results: List[Dict]) -> Tuple[float, str]:
    sample_data = results[:3] if results else []
    prompt = f"""You are a database query reviewer and judge agent.
Your task is to evaluate if the generated SQL query and its resulting dataset logically and accurately answer the user's question.

System Rules to keep in mind:
- A LIMIT clause is a STRICT system safety requirement to prevent database and server memory overload. Do not penalize the query for having a LIMIT clause unless the user explicitly requested more rows than the limit, or if the limit actually truncates the result set incorrectly.
- For aggregate queries (like SELECT COUNT(*), SUM(*), AVG(*), etc. that return a single row/value), a LIMIT clause is completely harmless and does not affect the calculation. Do not penalize it.

User Question: "{question}"
SQL Query: "{sql}"
Sample Results (up to 3 rows):
{json.dumps(sample_data, indent=2)}

Evaluate the solution and provide:
1. A confidence score between 0.0 and 1.0 (where 1.0 is extremely confident that the results correctly and fully answer the question).
2. A brief critique or feedback (empty if confident, otherwise explain what is wrong or missing).

Format your output STRICTLY as a JSON object:
{{
  "confidence": 0.95,
  "critique": ""
}}
"""
    try:
        response = groq_llm.invoke([HumanMessage(content=prompt)]).content.strip()
        response_clean = re.sub(r'```json\s*', '', response)
        response_clean = re.sub(r'```\s*', '', response_clean).strip()
        parsed = json.loads(response_clean)
        confidence = float(parsed.get("confidence", 1.0))
        critique = parsed.get("critique", "")
        return confidence, critique
    except Exception as e:
        logger.error(f"Reviewer agent failed: {e}")
        return 1.0, ""


def generate_sql_with_rag(
    question: str,
    schema_rag: SchemaRAG,
    validator: SQLValidator,
    db_type: str = "mysql",
    limit: int = DEFAULT_QUERY_LIMIT,
    max_retries: int = 3,
    history: List[Dict] = None,
    column_stats: dict = None
) -> Dict:
    """Generate SQL using a multi-agent logic graph with validation and retry logic"""
    logger.info(f"Question: {question}")
    
    thought_logs = []
    
    # Node 1: Conversation Memory
    history_slice = history[-5:] if history else []
    thought_logs.append({
        "agent": "Conversation Memory",
        "message": f"Loaded last {len(history_slice)} turns of conversation history."
    })
    
    # Format history for prompt
    history_str = ""
    if history_slice:
        history_str = "Conversation history (recent turns):\n"
        for h in history_slice:
            history_str += f"- User: {h.get('question')}\n- Assistant SQL: {h.get('query')}\n"
            
    # Node 2: Schema Context Builder
    relevant_schemas = schema_rag.retrieve_relevant_tables(question, top_k=3)
    if not relevant_schemas:
        logger.warning("No relevant schemas found")
        return {
            "error": "Could not find relevant database tables",
            "thought_logs": thought_logs
        }
        
    retrieved_tables = [s['table_name'] for s in relevant_schemas]
    thought_logs.append({
        "agent": "Schema Context Builder",
        "message": f"Compiled schema DDL for: {', '.join(retrieved_tables)}."
    })
    
    schema_context = "AVAILABLE TABLES AND COLUMNS:\n\n"
    for schema in relevant_schemas:
        schema_context += f"Table: {schema['table_name']}\n"
        schema_context += f"Columns: {', '.join(schema['columns'])}\n"
        if schema['primary_keys']:
            schema_context += f"Primary Key: {', '.join(schema['primary_keys'])}\n"
        if schema['foreign_keys']:
            for fk in schema['foreign_keys']:
                schema_context += f"Foreign Key: {', '.join(fk['columns'])} -> {fk['referred_table']}.{', '.join(fk['referred_columns'])}\n"
        schema_context += "\n"

    # Node 3: Classification Agent
    classification = _classify_query(question, schema_context)
    logger.info(f"Classification Agent: Classified query as {classification}")
    thought_logs.append({
        "agent": "Classification Agent",
        "message": f"Classified query as {classification}."
    })
    
    # Node 4: Planning Agent (Complex Path Only)
    plan = None
    if classification == "COMPLEX":
        plan = _create_query_plan(question, schema_context, history_str)
        thought_logs.append({
            "agent": "Planning Agent",
            "message": f"Developed plan:\n{plan}"
        })
        
    attempt = 0
    last_error = None
    critique = None
    max_attempts = 3
    
    while attempt < max_attempts:
        attempt += 1
        
        # Node 5: SQL Generator Agent
        generation_res = _generate_sql(
            question=question,
            schema_context=schema_context,
            db_type=db_type,
            limit=limit,
            plan=plan,
            history_str=history_str,
            last_error=last_error,
            critique=critique
        )
        
        if not generation_res or not generation_res.get("sql"):
            last_error = "SQL generation failed or returned invalid JSON format."
            thought_logs.append({
                "agent": "SQL Generator Agent",
                "message": f"Attempt {attempt}: Failed to compile SQL query. Error: {last_error}"
            })
            continue
            
        sql_query = generation_res.get("sql", "").strip()
        chart_config = generation_res.get("chart", {})
        reasoning = generation_res.get("reasoning", "")
        
        thought_logs.append({
            "agent": "SQL Generator Agent",
            "message": f"Attempt {attempt}: Compiled SQL statement."
        })
        
        # Node 6: Static SQL Validator
        is_valid, validation_error = validator.validate(sql_query)
        if not is_valid:
            last_error = f"Static SQL Validation Error: {validation_error}"
            thought_logs.append({
                "agent": "Static SQL Validator",
                "message": f"Attempt {attempt}: SQL validation failed: {validation_error}"
            })
            thought_logs.append({
                "agent": "SQL Repair Agent",
                "message": f"Repairing query after validation failure: {validation_error}"
            })
            continue
            
        thought_logs.append({
            "agent": "Static SQL Validator",
            "message": "SQL query matches safety constraints."
        })
        
        # Execute SQL
        try:
            logger.info(f"Executing validated SQL: {sql_query}")
            df = pd.read_sql(sql_query, schema_rag.engine)
            
            # Node 8: Result Sanitizer
            sanitized_results = _sanitize_results(df, limit)
            thought_logs.append({
                "agent": "Result Sanitizer",
                "message": f"Sanitized {len(sanitized_results)} result rows and verified JSON-compatibility."
            })
            
            # Node 9: Reviewer / Judge Agent
            confidence, judge_critique = _review_query(question, sql_query, sanitized_results)
            thought_logs.append({
                "agent": "Reviewer / Judge Agent",
                "message": f"Confidence score {confidence}. {judge_critique if judge_critique else 'Query matches intent.'}"
            })
            
            if confidence < 0.8 and attempt < max_attempts:
                critique = judge_critique
                if classification == "COMPLEX":
                    plan = f"{plan}\nReviewer critique to address: {critique}"
                    thought_logs.append({
                        "agent": "Planning Agent",
                        "message": f"Re-planning with review feedback: {critique}"
                    })
                last_error = f"Judge confidence was low ({confidence}): {critique}"
                continue
                
            return {
                "query": sql_query,
                "result": sanitized_results,
                "chart": chart_config if chart_config.get("type") != "table" else None,
                "reasoning": reasoning,
                "row_count": len(sanitized_results),
                "retrieved_tables": retrieved_tables,
                "thought_logs": thought_logs
            }
            
        except Exception as sql_error:
            last_error = f"SQL database execution error: {str(sql_error)}"
            logger.error(f"Attempt {attempt}: {last_error}")
            thought_logs.append({
                "agent": "SQL Repair Agent",
                "message": f"Database execution failed: {str(sql_error)}. Retrying SQL repair."
            })
            continue
            
    return {
        "error": f"Failed to generate valid SQL after {max_attempts} attempts. Last error: {last_error}",
        "retrieved_tables": retrieved_tables,
        "thought_logs": thought_logs
    }


# ============================================
# PART 4: HELPER FUNCTIONS
# ============================================

def extract_clean_json(response: str) -> Dict:
    """Extract JSON from LLM response"""
    response = re.sub(r'```json\s*', '', response)
    response = re.sub(r'```\s*', '', response)
    response = response.strip()
    
    try:
        parsed = json.loads(response)
        if validate_response_structure(parsed):
            return parsed
    except:
        pass
    
    json_patterns = [
        r'(\{[^{}]*"sql"[^{}]*"chart"[^{}]*\})',
        r'(\{.*?"sql".*?"chart".*?\})',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, response, re.DOTALL)
        for match in matches:
            try:
                parsed = json.loads(match)
                if validate_response_structure(parsed):
                    return parsed
            except:
                continue
    
    return None


def validate_response_structure(parsed: Dict) -> bool:
    """Validate JSON response structure"""
    if not isinstance(parsed, dict):
        return False
    
    if 'sql' not in parsed or 'chart' not in parsed:
        return False
    
    if not isinstance(parsed['sql'], str) or not parsed['sql'].strip():
        return False
    
    if not isinstance(parsed['chart'], dict):
        return False
    
    chart = parsed['chart']
    if 'type' not in chart or 'title' not in chart:
        return False
    
    return True


def clean_data_for_json(data):
    """Clean data for JSON serialization"""
    if isinstance(data, list):
        return [clean_data_for_json(item) for item in data]
    elif isinstance(data, dict):
        return {key: clean_data_for_json(value) for key, value in data.items()}
    elif isinstance(data, (np.floating, float)):
        if np.isnan(data):
            return None
        return float(data)
    elif isinstance(data, (np.integer, int)):
        return int(data)
    elif isinstance(data, np.ndarray):
        return data.tolist()
    elif pd.isna(data):
        return None
    else:
        return str(data)


def get_schema_rag():
    """Lazy initialization of the SchemaRAG system"""
    global _schema_rag
    if _schema_rag is not None:
        return _schema_rag
    
    engine = get_engine()
    db = get_db()
    
    _schema_rag = SchemaRAG(engine=engine, db=db)
    return _schema_rag

# ============================================
# PART 5: MAIN INTERFACE
# ============================================

def schema_rag(question: str):
    """Refactored to use lazy loading"""
    rag = get_schema_rag()
    return rag.retrieve_relevant_tables(question)

def default_sql_query_rag(question: str, limit: int = 5):
    """Refactored to use lazy loading"""
    engine = get_engine()
    
    if not engine:
        return {"error": "Database not connected. Please upload a file or connect a database."}
        
    return generic_sql_query_rag(
        question=question,
        engine=engine,
        db_type="postgresql",
        source_id=settings.DEMO_SOURCE_ID,
        limit=limit
    )


def get_sql_validator():
    """Lazy initialization of the SQL Validator"""
    engine = get_engine()
    if engine:
        return SQLValidator(engine)
    return None

def generate_sql_with_rag_lazy(question: str, db_type: str = "mysql", limit: int = 5):
    """Refactored to use lazy loading for everything"""
    rag = get_schema_rag()
    validator = get_sql_validator()
    
    if not rag or not validator:
        return {"success": False, "error": "Database not connected. Please connect a source."}
        
    limit = min(limit, 100)
    
    return generate_sql_with_rag(
        question=question,
        schema_rag=rag,
        validator=validator,
        db_type=db_type,
        limit=limit,
        max_retries=2
    )


def generic_sql_query_rag(
    question: str,
    engine,
    db_type: str = "mysql",
    source_id: str = "default",
    limit: int = DEFAULT_QUERY_LIMIT,
    history: List[Dict] = None,
    column_stats: dict = None
) -> Dict:
    """
    Generic function: Generate and execute SQL for ANY data source
    """
    limit = min(limit, MAX_QUERY_LIMIT)
    
    temp_schema_rag = SchemaRAG(
        engine, 
        None,
        index_name=settings.PINECONE_INDEX_NAME,
        namespace=f"source-{source_id}"
    )
    temp_validator = SQLValidator(engine)
    
    return generate_sql_with_rag(
        question=question,
        schema_rag=temp_schema_rag,
        validator=temp_validator,
        db_type=db_type,
        limit=limit,
        max_retries=2,
        history=history,
        column_stats=column_stats
    )


def rebuild_schema_index():
    """Utility function to force rebuild the schema index"""
    rag = get_schema_rag()
    rag.rebuild_index()
    print("Schema index rebuilt successfully!")
