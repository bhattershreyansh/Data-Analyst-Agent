"""
Smart Question Generator
Analyzes data source schemas and generates intelligent, business-relevant questions
"""

from typing import List, Dict, Optional
from sqlalchemy import inspect
import logging
from datetime import datetime
from llama_index.llms.groq import Groq

logger = logging.getLogger(__name__)

# Initialize LLM
groq_llm = Groq(model="llama-3.3-70b-versatile")


def analyze_schema(engine, db_type: str = "mysql") -> Dict:
    """
    Analyze database schema to extract metadata
    
    Args:
        engine: SQLAlchemy engine
        db_type: Database type
    
    Returns:
        Dict with schema metadata
    """
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    schema_info = {
        "db_type": db_type,
        "table_count": len(tables),
        "tables": []
    }
    
    for table in tables:
        columns = inspector.get_columns(table)
        
        table_info = {
            "name": table,
            "column_count": len(columns),
            "columns": []
        }
        
        for col in columns:
            col_info = {
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col.get("nullable", True)
            }
            table_info["columns"].append(col_info)
        
        schema_info["tables"].append(table_info)
    
    return schema_info


def detect_business_domain(schema_info: Dict) -> str:
    """
    Detect the business domain based on table and column names
    
    Args:
        schema_info: Schema metadata
    
    Returns:
        Detected domain (ecommerce, healthcare, hr, finance, general)
    """
    # Collect all table and column names
    all_names = []
    for table in schema_info["tables"]:
        all_names.append(table["name"].lower())
        for col in table["columns"]:
            all_names.append(col["name"].lower())
    
    names_str = " ".join(all_names)
    
    # Domain detection patterns
    if any(keyword in names_str for keyword in ["product", "order", "customer", "cart", "price", "sales", "revenue"]):
        return "ecommerce"
    elif any(keyword in names_str for keyword in ["patient", "doctor", "hospital", "medical", "diagnosis", "treatment"]):
        return "healthcare"
    elif any(keyword in names_str for keyword in ["employee", "salary", "department", "manager", "hire"]):
        return "hr"
    elif any(keyword in names_str for keyword in ["transaction", "account", "balance", "payment", "invoice"]):
        return "finance"
    else:
        return "general"


def detect_key_metrics(schema_info: Dict) -> Dict[str, List[str]]:
    """
    Detect key metric columns (dates, amounts, categories)
    
    Args:
        schema_info: Schema metadata
    
    Returns:
        Dict with categorized columns
    """
    metrics = {
        "date_columns": [],
        "numeric_columns": [],
        "category_columns": [],
        "id_columns": []
    }
    
    for table in schema_info["tables"]:
        for col in table["columns"]:
            col_name = col["name"].lower()
            col_type = col["type"].lower()
            full_name = f"{table['name']}.{col['name']}"
            
            # Date columns
            if "date" in col_type or "time" in col_type or "date" in col_name or "time" in col_name:
                metrics["date_columns"].append(full_name)
            
            # Numeric columns (potential metrics)
            elif any(t in col_type for t in ["int", "float", "decimal", "numeric", "double"]):
                if "id" not in col_name:
                    metrics["numeric_columns"].append(full_name)
                else:
                    metrics["id_columns"].append(full_name)
            
            # Category columns (for grouping)
            elif any(t in col_type for t in ["varchar", "char", "text", "string"]):
                if "id" not in col_name and "name" in col_name or "type" in col_name or "category" in col_name or "status" in col_name:
                    metrics["category_columns"].append(full_name)
    
    return metrics


def generate_smart_questions(
    schema_info: Dict,
    domain: str,
    key_metrics: Dict[str, List[str]],
    count: int = 6
) -> List[Dict]:
    """
    Generate smart, business-relevant questions using LLM
    
    Args:
        schema_info: Schema metadata
        domain: Business domain
        key_metrics: Detected key metrics
        count: Number of questions to generate
    
    Returns:
        List of question objects
    """
    # Build schema summary for LLM
    schema_summary = f"Database Type: {schema_info['db_type']}\n"
    schema_summary += f"Domain: {domain}\n"
    schema_summary += f"Tables ({schema_info['table_count']}):\n"
    
    for table in schema_info["tables"][:10]:  # Limit to first 10 tables
        schema_summary += f"\n- {table['name']} ({table['column_count']} columns):\n"
        for col in table["columns"][:15]:  # Limit columns
            schema_summary += f"  - {col['name']} ({col['type']})\n"
    
    # Add key metrics
    schema_summary += f"\nKey Metrics Detected:\n"
    schema_summary += f"- Date columns: {', '.join(key_metrics['date_columns'][:5])}\n"
    schema_summary += f"- Numeric columns: {', '.join(key_metrics['numeric_columns'][:5])}\n"
    schema_summary += f"- Category columns: {', '.join(key_metrics['category_columns'][:5])}\n"
    
    # Build LLM prompt
    prompt = f"""{schema_summary}

Generate {count} SMART, business-relevant questions for this database. 

CRITICAL REQUIREMENTS:
1. Questions MUST be answerable by a SINGLE SQL query (Data Retrieval focused)
2. Avoid open-ended "Why" or "How to improve" questions (e.g., "How can we optimize spend?")
3. Instead, ask "What is...", "Show me...", "Compare...", "List top..."
4. Focus on Aggregations, Comparisons, and Trends (e.g., "Show revenue by region vs last year")
5. The question should imply the specific columns to use (e.g., "Show average sales by category")

Examples of GOOD Data Questions:
- "What are the top 5 products by total revenue in the West region?"
- "Compare average monthly sales between 2023 and 2024"
- "Show the distribution of customer ratings by product category"
- "Which salespeople have the highest average order value?"
- "List the top 10 customers with the most cancelled orders"

Examples of BAD Questions (Do NOT generate):
- "How can we improve sales?" (Not answerable by SQL)
- "Why are sales dropping?" (Requires external context)
- "What is the best strategy for..." (Opinion-based)

Return ONLY a valid JSON array with this exact format:
[
  {{
    "question": "Your smart question here",
    "category": "Trends|Performance|Comparison|Patterns|Optimization",
    "chart_type": "bar|pie|line|table",
    "reasoning": "Why this question is valuable"
  }}
]

Return ONLY the JSON array, nothing else."""

    try:
        response = groq_llm.complete(prompt).text.strip()
        
        # Extract JSON from response
        import json
        import re
        
        # Remove markdown code blocks if present
        response = re.sub(r'```json\s*', '', response)
        response = re.sub(r'```\s*', '', response)
        response = response.strip()
        
        questions = json.loads(response)
        
        # Add IDs and validate
        for i, q in enumerate(questions):
            q["id"] = f"q{i+1}"
            q["generated_at"] = datetime.now().isoformat()
        
        logger.info(f"Generated {len(questions)} smart questions for {domain} domain")
        return questions[:count]  # Ensure we return exactly 'count' questions
        
    except Exception as e:
        logger.error(f"Failed to generate smart questions: {e}")
        # Return fallback questions
        return get_fallback_questions(domain, key_metrics)


def get_fallback_questions(domain: str, key_metrics: Dict[str, List[str]]) -> List[Dict]:
    """
    Generate fallback questions if LLM fails
    
    Args:
        domain: Business domain
        key_metrics: Detected key metrics
    
    Returns:
        List of fallback questions
    """
    fallback = []
    
    # Generic smart questions based on available metrics
    if key_metrics["date_columns"] and key_metrics["numeric_columns"]:
        fallback.append({
            "id": "q1",
            "question": "What are the trends over time in key metrics?",
            "category": "Trends",
            "chart_type": "line",
            "reasoning": "Time-series analysis reveals patterns",
            "generated_at": datetime.now().isoformat()
        })
    
    if key_metrics["category_columns"] and key_metrics["numeric_columns"]:
        fallback.append({
            "id": "q2",
            "question": "Which categories contribute most to overall performance?",
            "category": "Performance",
            "chart_type": "bar",
            "reasoning": "Identify top performers",
            "generated_at": datetime.now().isoformat()
        })
    
    if key_metrics["numeric_columns"]:
        fallback.append({
            "id": "q3",
            "question": "What are the statistical outliers in the data?",
            "category": "Patterns",
            "chart_type": "table",
            "reasoning": "Detect anomalies and unusual patterns",
            "generated_at": datetime.now().isoformat()
        })
    
    return fallback[:6]
