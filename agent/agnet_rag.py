import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect
import pandas as pd
import json
from typing import List, Dict, Tuple
from typing_extensions import Annotated
from llama_index.llms.groq import Groq
import re
from langchain_community.utilities import SQLDatabase
import numpy as np
import logging
import chromadb
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Database configuration
user = "myuser"
password = "mypassword"
host = "localhost"
db_name = "analytics_db"

# Connect to the database (Optional for demo)
db = None
engine = None

try:
    db_uri = f"mysql+mysqlconnector://{user}:{password}@{host}/{db_name}"
    engine = create_engine(db_uri)
    # Test connection
    with engine.connect() as conn:
        logger.info("✅ Successfully connected to MySQL database")
    db = SQLDatabase.from_uri(db_uri)
except Exception as e:
    logger.warning(f"⚠️  Could not connect to MySQL database: {e}")
    logger.warning("Agent will run in 'File-Only' mode for now.")
    engine = None
    db = None

# Initialize LLM
groq_llm = Groq(model="llama-3.3-70b-versatile")
DEFAULT_QUERY_LIMIT = 20
MAX_QUERY_LIMIT = 100


# ============================================
# PART 1: SCHEMA EXTRACTION & EMBEDDING (FIXED)
# ============================================

class SchemaRAG:
    def __init__(self, engine, db, persist_directory="./chroma_db", collection_name="data_schema"):
        self.engine = engine
        self.db = db
        self.inspector = inspect(engine)
        self.persist_directory = persist_directory
        self.collection_name = collection_name  # NEW: Dynamic collection name
        
        # Create persist directory if it doesn't exist
        Path(persist_directory).mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB with persistence
        self.chroma_client = chromadb.PersistentClient(path=persist_directory)
        
        # Try to get existing collection
        try:
            self.collection = self.chroma_client.get_collection(collection_name)
            
            # Check if collection has data
            if self.collection.count() == 0:
                logger.info(f"Collection '{collection_name}' exists but is empty, building schema index...")
                self._build_schema_index()
            else:
                logger.info(f"✅ Using existing collection '{collection_name}' with {self.collection.count()} items")
                
        except Exception as e:
            # Collection doesn't exist, create it
            logger.info(f"Creating new collection '{collection_name}' and building schema index...")
            self.collection = self.chroma_client.create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            self._build_schema_index()
    
    def _build_schema_index(self):
        """Extract schema and create embeddings"""
        logger.info("🔨 Building schema index...")
        
        table_names = self.inspector.get_table_names()
        
        documents = []
        metadatas = []
        ids = []
        
        for idx, table_name in enumerate(table_names):
            # Get columns
            columns = self.inspector.get_columns(table_name)
            column_names = [col['name'] for col in columns]
            column_types = {col['name']: str(col['type']) for col in columns}
            
            # Get primary keys
            pk = self.inspector.get_pk_constraint(table_name)
            primary_keys = pk.get('constrained_columns', [])
            
            # Get foreign keys
            fks = self.inspector.get_foreign_keys(table_name)
            foreign_keys = []
            for fk in fks:
                foreign_keys.append({
                    'columns': fk['constrained_columns'],
                    'referred_table': fk['referred_table'],
                    'referred_columns': fk['referred_columns']
                })
            
            # Create searchable document
            doc = f"""Table: {table_name}
Columns: {', '.join(column_names)}
Primary Keys: {', '.join(primary_keys) if primary_keys else 'None'}
Foreign Keys: {json.dumps(foreign_keys) if foreign_keys else 'None'}

Column Details:
{chr(10).join([f"  - {name}: {column_types[name]}" for name in column_names])}

Common queries: SELECT from {table_name}, JOIN {table_name}, COUNT {table_name}, GROUP BY {table_name}
"""
            
            documents.append(doc)
            metadatas.append({
                'table_name': table_name,
                'columns': json.dumps(column_names),
                'primary_keys': json.dumps(primary_keys),
                'foreign_keys': json.dumps(foreign_keys),
                'column_types': json.dumps(column_types)
            })
            ids.append(f"table_{idx}")
        
        # Add to ChromaDB
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        
        logger.info(f"✅ Indexed {len(table_names)} tables successfully!")
    
    def get_blueprint(self) -> Dict:
        """
        Deterministic extraction of schema relationships (The Sentinel Map)
        Returns a dict of tables with their columns and foreign keys.
        """
        table_names = self.inspector.get_table_names()
        blueprint = {
            "tables": [],
            "relationships": []
        }
        
        for table_name in table_names:
            # Get columns
            columns = self.inspector.get_columns(table_name)
            column_names = [col['name'] for col in columns]
            
            # Get foreign keys
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

        # ============================================
        # NEW: THE SEMANTIC LINKER (The "Spreadsheet Magic")
        # ============================================
        # If explicit relationships are missing (common in Excel), 
        # we discover 'Semantic Links' based on matching column names.
        
        # 1. Map columns to tables
        col_to_tables = {}
        for table_info in blueprint["tables"]:
            for col in table_info["columns"]:
                # Exclude generic names to prevent false positives
                # We want specifically 'named' IDs or Category keys
                generic_names = ["id", "name", "value", "date", "status", "type", "description"]
                if col.lower() not in generic_names:
                    if col not in col_to_tables:
                        col_to_tables[col] = []
                    col_to_tables[col].append(table_info["name"])

        # 2. Identify intersections
        for col, tables in col_to_tables.items():
            if len(tables) > 1:
                # We have a matching column across multiple tables!
                # Link every pair in this set
                for i in range(len(tables)):
                    for j in range(i + 1, len(tables)):
                        # Check if this relationship already exists explicitly
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
        """Force rebuild the index (useful if schema changes)"""
        logger.info("🔄 Force rebuilding schema index...")
        
        # Delete existing collection
        try:
            self.chroma_client.delete_collection("data_schema")
            logger.info("Deleted old collection")
        except:
            pass
        
        # Create new collection
        self.collection = self.chroma_client.create_collection(
            name="data_schema",
            metadata={"hnsw:space": "cosine"}
        )
        
        # Build index
        self._build_schema_index()
    
    def retrieve_relevant_tables(self, question: str, top_k: int = 3) -> List[Dict]:
        """Retrieve most relevant table schemas for a question"""
        
        results = self.collection.query(
            query_texts=[question],
            n_results=min(top_k, self.collection.count())
        )
        
        relevant_schemas = []
        
        for metadata in results['metadatas'][0]:
            relevant_schemas.append({
                'table_name': metadata['table_name'],
                'columns': json.loads(metadata['columns']),
                'primary_keys': json.loads(metadata['primary_keys']),
                'foreign_keys': json.loads(metadata['foreign_keys']),
                'column_types': json.loads(metadata['column_types'])
            })
        
        return relevant_schemas


# ============================================
# PART 2: SQL VALIDATOR
# ============================================

class SQLValidator:
    """Validates SQL queries against actual database schema"""
    
    def __init__(self, engine):
        self.inspector = inspect(engine)
        self.valid_tables = set(self.inspector.get_table_names())
        self.table_columns = {}
        
        # Build column map
        for table in self.valid_tables:
            columns = self.inspector.get_columns(table)
            self.table_columns[table] = {col['name'] for col in columns}
    
    def validate(self, sql: str) -> Tuple[bool, str]:
        """
        Validate SQL query against schema
        Returns: (is_valid, error_message)
        """
        sql_upper = sql.upper()
        sql_lower = sql.lower()
        
        # Extract table names from SQL (improved to ignore common aliases)
        # Match FROM/JOIN followed by table name, but ignore if it's already in our set of valid tables in a case-insensitive way
        from_pattern = r'FROM\s+([a-zA-Z0-9_]+)'
        join_pattern = r'JOIN\s+([a-zA-Z0-9_]+)'
        
        referenced_raw = set()
        referenced_raw.update(re.findall(from_pattern, sql_upper))
        referenced_raw.update(re.findall(join_pattern, sql_upper))
        
        # Filter out aliases by checking against valid_tables
        # If a word is NOT in valid_tables, it might be an alias or a non-existent table
        valid_lower = {t.lower() for t in self.valid_tables}
        for table in referenced_raw:
            if table.lower() not in valid_lower:
                # If it's not a valid table, ensure no other part of the query used it as a table
                # (Simple check: if it's an alias, the actual table should be somewhere else)
                return False, f"Table '{table}' does not exist. Valid tables: {', '.join(self.valid_tables)}"
        
        # Check for dangerous operations using word boundaries to avoid false positives like 'created_at'
        dangerous_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE']
        for keyword in dangerous_keywords:
            if re.search(rf'\b{keyword}\b', sql_upper):
                return False, f"Dangerous operation '{keyword}' not allowed"
        
        # Check for LIMIT clause
        if 'LIMIT' not in sql_upper:
            return False, "Query must include LIMIT clause"
        
        return True, "Valid"


# ============================================
# PART 3: RAG-ENHANCED QUERY GENERATOR
# ============================================

# Import generic query utilities
from generic_query import build_generic_prompt, get_db_syntax_hints

def generate_sql_with_rag(
    question: str,
    schema_rag: SchemaRAG,
    validator: SQLValidator,
    db_type: str = "mysql",
    limit: int = DEFAULT_QUERY_LIMIT,
    max_retries: int = 2,
    history: List[Dict] = None,
    column_stats: dict = None  # NEW: per-table column statistics
) -> Dict:
    """
    Generate SQL using RAG-retrieved schema with validation and retry logic
    Now supports multiple database types dynamically
    """
    
    # Step 1: Retrieve relevant schemas
    logger.info(f"Question: {question}")
    relevant_schemas = schema_rag.retrieve_relevant_tables(question, top_k=3)
    
    if not relevant_schemas:
        logger.warning("No relevant schemas found")
        return {"error": "Could not find relevant database tables"}
    
    logger.info(f"Retrieved {len(relevant_schemas)} relevant tables: {[s['table_name'] for s in relevant_schemas]}")
    
    # Step 2: Build focused schema context
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
    
    # Step 3: Generate SQL with retries
    attempt = 0
    last_error = None
    
    while attempt < max_retries:
        attempt += 1
        
        # Build generic prompt based on database type
        prompt = build_generic_prompt(
            schema_context=schema_context,
            question=question,
            db_type=db_type,
            limit=limit,
            last_error=last_error if attempt > 1 else None,
            history=history,
            column_stats=column_stats  # Pass value-aware stats
        )
        
        # Get LLM response
        response = groq_llm.complete(prompt).text.strip()
        logger.info(f"Attempt {attempt} - LLM Response: {response[:200]}...")
        
        # Extract JSON
        result = extract_clean_json(response)
        
        if not result:
            last_error = "Invalid JSON format"
            logger.warning(f"Attempt {attempt}: Failed to extract JSON")
            continue
        
        sql_query = result.get("sql", "").strip()
        
        if not sql_query:
            last_error = "No SQL query generated"
            logger.warning(f"Attempt {attempt}: No SQL in response")
            continue
        
        # Step 4: Validate SQL
        is_valid, validation_error = validator.validate(sql_query)
        
        if not is_valid:
            last_error = validation_error
            logger.warning(f"Attempt {attempt}: Validation failed - {validation_error}")
            continue
        
        # Step 5: Execute SQL
        try:
            logger.info(f"Executing validated SQL: {sql_query}")
            # Use the engine from schema_rag, not the global engine!
            df = pd.read_sql(sql_query, schema_rag.engine)
            
            table_data = df.to_dict(orient="records")
            table_data = clean_data_for_json(table_data)
            
            chart_config = result.get("chart", {})
            
            return {
                "query": sql_query,
                "result": table_data,
                "chart": chart_config if chart_config.get("type") != "table" else None,
                "reasoning": result.get("reasoning", ""),
                "row_count": len(table_data),
                "retrieved_tables": [s['table_name'] for s in relevant_schemas]
            }
        
        except Exception as sql_error:
            last_error = f"SQL execution error: {str(sql_error)}"
            logger.error(f"Attempt {attempt}: {last_error}")
            continue
    
    # All retries failed
    return {
        "error": f"Failed after {max_retries} attempts. Last error: {last_error}",
        "retrieved_tables": [s['table_name'] for s in relevant_schemas]
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


# ============================================
# PART 5: MAIN INTERFACE
# ============================================

# Initialize RAG system and validator (do this only if engine is available)
schema_rag = None
sql_validator = None

if engine:
    try:
        schema_rag = SchemaRAG(engine, db)
        sql_validator = SQLValidator(engine)
    except Exception as e:
        logger.error(f"Failed to initialize RAG system: {e}")


def default_sql_query_rag(
    question: Annotated[str, "A question about the database"],
    limit: int = DEFAULT_QUERY_LIMIT
) -> Dict:
    """
    Main function: Generate and execute SQL using RAG + Validation
    (Legacy function for default database - kept for backwards compatibility)
    """
    if not schema_rag or not sql_validator:
        return {"error": "Database not connected. Please connect a data source or upload a file."}
        
    limit = min(limit, MAX_QUERY_LIMIT)
    
    return generate_sql_with_rag(
        question=question,
        schema_rag=schema_rag,
        validator=sql_validator,
        db_type="mysql",  # Default DB is MySQL
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
    column_stats: dict = None  # NEW: value-aware column statistics
) -> Dict:
    """
    Generic function: Generate and execute SQL for ANY data source
    
    Args:
        question: Natural language question
        engine: SQLAlchemy engine for the target database
        db_type: Database type ('mysql', 'postgresql', 'sqlite', 'sqlserver')
        source_id: Unique identifier for this data source (for schema caching)
        limit: Maximum rows to return
        history: List of previous Q&A pairs
        column_stats: Per-table column statistics for value-aware SQL generation
    """
    limit = min(limit, MAX_QUERY_LIMIT)
    
    # Create unique collection name for this data source
    # This ensures each data source has its own schema index
    collection_name = f"schema-{source_id}"
    
    # Create temporary SchemaRAG and Validator for this engine
    # Note: db parameter is not used in SchemaRAG, so we pass None
    temp_schema_rag = SchemaRAG(
        engine, 
        None, 
        persist_directory="./chroma_db",
        collection_name=collection_name  # Unique collection per source
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
        column_stats=column_stats  # Pass through value-aware stats
    )



# ============================================
# UTILITY: Force Rebuild Index
# ============================================

def rebuild_schema_index():
    """Utility function to force rebuild the schema index"""
    schema_rag.rebuild_index()
    print("✅ Schema index rebuilt successfully!")


if __name__ == "__main__":
    if engine:
        print("✅ Analytics Engine: Online")
    else:
        print("⚠️  Analytics Engine: File-Only Mode")