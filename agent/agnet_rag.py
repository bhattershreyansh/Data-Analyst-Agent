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
db_name = "hospitalmanagementsystem"

# Connect to the database
db = SQLDatabase.from_uri(
    f"mysql+mysqlconnector://{user}:{password}@{host}/{db_name}"
)
engine = create_engine(f"mysql+mysqlconnector://{user}:{password}@{host}/{db_name}")

# Initialize LLM
groq_llm = Groq(model="llama-3.3-70b-versatile")
DEFAULT_QUERY_LIMIT = 20
MAX_QUERY_LIMIT = 100


# ============================================
# PART 1: SCHEMA EXTRACTION & EMBEDDING (FIXED)
# ============================================

class SchemaRAG:
    def __init__(self, engine, db, persist_directory="./chroma_db", collection_name="hospital_schema"):
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
    
    def rebuild_index(self):
        """Force rebuild the index (useful if schema changes)"""
        logger.info("🔄 Force rebuilding schema index...")
        
        # Delete existing collection
        try:
            self.chroma_client.delete_collection("hospital_schema")
            logger.info("Deleted old collection")
        except:
            pass
        
        # Create new collection
        self.collection = self.chroma_client.create_collection(
            name="hospital_schema",
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
        
        if results and results['metadatas']:
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
        
        # Extract table names from SQL
        from_pattern = r'FROM\s+(\w+)'
        join_pattern = r'JOIN\s+(\w+)'
        
        referenced_tables = set()
        referenced_tables.update(re.findall(from_pattern, sql_upper))
        referenced_tables.update(re.findall(join_pattern, sql_upper))
        
        # Check if tables exist
        for table in referenced_tables:
            if table.lower() not in [t.lower() for t in self.valid_tables]:
                return False, f"Table '{table}' does not exist. Valid tables: {', '.join(self.valid_tables)}"
        
        # Extract column references
        column_pattern = r'(\w+)\.(\w+)'
        table_column_refs = re.findall(column_pattern, sql_lower)
        
        for table, column in table_column_refs:
            if table in [t.lower() for t in self.valid_tables]:
                actual_table = next(t for t in self.valid_tables if t.lower() == table.lower())
                
                if column not in [c.lower() for c in self.table_columns[actual_table]]:
                    return False, f"Column '{column}' does not exist in table '{actual_table}'. Valid columns: {', '.join(self.table_columns[actual_table])}"
        
        # Check for dangerous operations
        dangerous_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE']
        for keyword in dangerous_keywords:
            if keyword in sql_upper:
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
    db_type: str = "mysql",  # NEW: Database type parameter
    limit: int = DEFAULT_QUERY_LIMIT,
    max_retries: int = 2,
    history: List[Dict] = None  # NEW: History parameter
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
            history=history  # Pass history to prompt builder
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

# Initialize RAG system and validator (do this once at startup)
schema_rag = SchemaRAG(engine, db)
sql_validator = SQLValidator(engine)


def hospital_sql_query_rag(
    question: Annotated[str, "A question about the hospital database"],
    limit: int = DEFAULT_QUERY_LIMIT
) -> Dict:
    """
    Main function: Generate and execute SQL using RAG + Validation
    (Legacy function for hospital database - kept for backwards compatibility)
    """
    limit = min(limit, MAX_QUERY_LIMIT)
    
    return generate_sql_with_rag(
        question=question,
        schema_rag=schema_rag,
        validator=sql_validator,
        db_type="mysql",  # Hospital DB is MySQL
        limit=limit,
        max_retries=2
    )


def generic_sql_query_rag(
    question: str,
    engine,
    db_type: str = "mysql",
    source_id: str = "default",  # NEW: Source ID for unique collections
    limit: int = DEFAULT_QUERY_LIMIT,
    history: List[Dict] = None  # NEW: History parameter
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
    """
    limit = min(limit, MAX_QUERY_LIMIT)
    
    # Create unique collection name for this data source
    # This ensures each data source has its own schema index
    collection_name = f"schema_{source_id.replace('-', '_')}"
    
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
        history=history  # Pass history
    )



# ============================================
# UTILITY: Force Rebuild Index
# ============================================

def rebuild_schema_index():
    """Utility function to force rebuild the schema index"""
    schema_rag.rebuild_index()
    print("✅ Schema index rebuilt successfully!")


# ============================================
# PART 6: TESTING
# ============================================

def test_rag_system():
    """Test the RAG-enhanced system"""
    test_questions = [
        "How many patients do we have?"
    ]
    
    print("=" * 60)
    print("Testing RAG + Validation System")
    print("=" * 60)
    print()
    
    for i, question in enumerate(test_questions, 1):
        print(f"\n{'='*60}")
        print(f"Test {i}: {question}")
        print(f"{'='*60}")
        
        result = hospital_sql_query_rag(question)
        
        if result.get("error"):
            print(f"❌ FAILED: {result['error']}")
        else:
            print(f"✅ SUCCESS")
            print(f"\n📊 Retrieved Tables: {', '.join(result.get('retrieved_tables', []))}")
            print(f"\n🔍 SQL Query:")
            print(f"   {result['query']}")
            print(f"\n📈 Results: {result.get('row_count', 0)} rows")
            chart = result.get('chart', {})
            if chart:
                print(f"📉 Chart Type: {chart.get('type', 'none')}")
            else:
                print(f"📉 Chart Type: none")
            print(f"\n💡 Reasoning: {result.get('reasoning', 'N/A')}")
            
            if result.get('result'):
                print(f"\n📋 Sample Data (first 3 rows):")
                for row in result['result'][:3]:
                    print(f"   {row}")
        
        print()


if __name__ == "__main__":
    test_rag_system()