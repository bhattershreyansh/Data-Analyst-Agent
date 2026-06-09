import sys
import os
sys.path.append(os.path.abspath("agent"))

from sqlalchemy import create_engine
from app.services.rag_engine import SchemaRAG, SQLValidator, generate_sql_with_rag
from app.core.shopify_seeder import seed_shopify_tables

# Set up a test SQLite DB in memory
engine = create_engine("sqlite:///:memory:")
seed_shopify_tables(engine)

# Initialize RAG and Validator
schema_rag = SchemaRAG(engine, None)
validator = SQLValidator(engine)

# Run direct tests
questions = [
    "How many orders do we have?",
    "What is our average order value per city for customers who spent more than $100 total?"
]

for question in questions:
    print(f"\n========================================\nQuestion: {question}\n========================================")
    result = generate_sql_with_rag(
        question=question,
        schema_rag=schema_rag,
        validator=validator,
        db_type="sqlite",
        limit=5
    )
    print("Result query:", result.get("query"))
    print("Result rows count:", result.get("row_count"))
    print("Result chart:", result.get("chart"))
    print("Thought logs:")
    for log in result.get("thought_logs", []):
        print(f"[{log.get('agent')}]: {log.get('message')}")
