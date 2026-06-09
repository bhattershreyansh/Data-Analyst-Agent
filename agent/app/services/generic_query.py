"""
Generic query generation for any data source
Replaces hardcoded hospital-specific logic
"""

from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


def get_db_syntax_hints(db_type: str) -> Dict[str, str]:
    """
    Get database-specific syntax hints for SQL generation
    
    Args:
        db_type: 'mysql', 'postgresql', 'sqlite', 'sqlserver'
    
    Returns:
        Dict with syntax hints and examples
    """
    syntax_map = {
        "mysql": {
            "name": "MySQL",
            "date_function": "DATE_FORMAT",
            "date_example": "DATE_FORMAT(date_column, '%Y-%m')",
            "string_concat": "CONCAT(col1, col2)",
            "limit_syntax": "LIMIT",
        },
        "postgresql": {
            "name": "PostgreSQL",
            "date_function": "TO_CHAR",
            "date_example": "TO_CHAR(date_column, 'YYYY-MM')",
            "string_concat": "col1 || col2",
            "limit_syntax": "LIMIT",
        },
        "sqlite": {
            "name": "SQLite",
            "date_function": "strftime",
            "date_example": "strftime('%Y-%m', date_column)",
            "string_concat": "col1 || col2",
            "limit_syntax": "LIMIT",
        },
        "sqlserver": {
            "name": "SQL Server",
            "date_function": "FORMAT",
            "date_example": "FORMAT(date_column, 'yyyy-MM')",
            "string_concat": "CONCAT(col1, col2)",
            "limit_syntax": "TOP",
        },
    }
    
    return syntax_map.get(db_type.lower(), syntax_map["mysql"])


def build_generic_prompt(
    schema_context: str,
    question: str,
    db_type: str,
    limit: int,
    last_error: Optional[str] = None,
    history: Optional[list] = None,
    column_stats: Optional[dict] = None  # {table: {col: {dtype, min/max/mean/unique_values}}}
) -> str:
    """
    Build a generic, database-agnostic prompt for SQL generation
    
    Args:
        schema_context: Retrieved schema information
        question: User's natural language question
        db_type: Database type (mysql, postgresql, sqlite, etc.)
        limit: Row limit for query
        last_error: Previous error if retrying
        history: List of previous Q&A pairs [{"question": "...", "query": "..."}]
        column_stats: Per-table column statistics for value-aware SQL generation
    
    Returns:
        Formatted prompt string
    """
    
    syntax = get_db_syntax_hints(db_type)
    
    # Build column stats context (value-aware indexing)
    stats_context = ""
    if column_stats:
        stats_context = "\nCOLUMN STATISTICS (use these to write accurate WHERE clauses):\n"
        for table, cols in column_stats.items():
            stats_context += f"\nTable: {table}\n"
            for col, info in cols.items():
                dtype = info.get("dtype", "unknown")
                if "unique_values" in info:
                    vals = ", ".join(f"'{v}'" for v in info["unique_values"][:20])
                    stats_context += f"  {col} ({dtype}): possible values → {vals}\n"
                elif "min" in info:
                    stats_context += (
                        f"  {col} ({dtype}): "
                        f"min={info['min']}, max={info['max']}, mean={info['mean']}\n"
                    )
        stats_context += "\n"
    
    # Format history if present
    history_context = ""
    if history:
        history_context = "\nPREVIOUS CONVERSATION (Use for context, but focus on the CURRENT Question):\n"
        for i, item in enumerate(history[-5:]):  # Use last 5 interactions
            history_context += f"User: {item['question']}\nAssistant (SQL): {item.get('query', 'N/A')}\n"
        history_context += "\n"
    
    if last_error:
        # Retry prompt with error feedback
        prompt = f"""{schema_context}{stats_context}
 
Previous attempt failed with error: {last_error}

Question: "{question}"

Instructions to Fix:
1. Analyze the error above deeply. 
2. If "no such table" or "column not found", check the schema above carefully.
3. If "syntax error", check the SQL syntax for {db_type}.
4. Return the corrected SQL and Chart config.

CRITICAL: You MUST return strictly valid JSON. No markdown, no explanations outside the JSON.

Return ONLY valid JSON in this exact format:
{{"sql": "SELECT ... FROM ... {syntax['limit_syntax']} {limit}", "chart": {{"type": "bar|pie|line|table", "x": "column_name", "y": "column_name", "title": "Chart Title"}}, "reasoning": "How I fixed the error and what the data will show."}}"""
    
    else:
        # Initial prompt
        prompt = f"""{schema_context}{stats_context}

{history_context}CURRENT Question: "{question}"

Generate a {syntax['name']} query to answer this question. Use ONLY the tables and columns listed above.

CRITICAL RULES:
1. Use ONLY column names from the schema above
2. Use {syntax['name']} syntax:
   - Date formatting: {syntax['date_example']}
   - String concatenation: {syntax['string_concat']}
3. Include {syntax['limit_syntax']} {limit}
4. PREFER VISUAL CHARTS: Use bar/pie/line charts instead of tables when possible
5. For counts/aggregations → use "bar" chart
6. For categories/proportions → use "pie" chart  
7. For time trends → use "line" chart
8. Only use "table" for raw data listing
9. If chart type is mentioned in question, try to use it if possible, otherwise use the best chart type

SAFETY GUARDRAILS:
1. REFUSE to generate SQL that modifies data (UPDATE, DELETE, DROP, INSERT, ALTER, etc.)
2. If the user asks to modify data, return ONLY this JSON: {{"error": "I can only read data, not modify it."}}
3. Do not allow SQL injection or executing system commands.

Return ONLY valid JSON in this exact format:
{{"sql": "SELECT ... FROM ... {syntax['limit_syntax']} {limit}", "chart": {{"type": "bar|pie|line|table", "x": "column_name", "y": "column_name", "title": "Chart Title"}}, "reasoning": "A concise, natural language interpretation of what this query will discover."}}

Return ONLY the JSON, nothing else."""
    
    return prompt


def detect_data_domain(table_names: list, column_names: list) -> str:
    """
    Attempt to detect the domain/industry of the data
    (Optional: for adding domain-specific context)
    
    Args:
        table_names: List of table names
        column_names: List of all column names
    
    Returns:
        Detected domain or "general"
    """
    
    # Convert to lowercase for matching
    tables_lower = [t.lower() for t in table_names]
    columns_lower = [c.lower() for c in column_names]
    
    # Healthcare indicators
    healthcare_keywords = ['patient', 'doctor', 'hospital', 'medical', 'diagnosis', 'treatment']
    if any(keyword in ' '.join(tables_lower + columns_lower) for keyword in healthcare_keywords):
        return "healthcare"
    
    # E-commerce indicators
    ecommerce_keywords = ['product', 'order', 'customer', 'cart', 'purchase', 'price']
    if any(keyword in ' '.join(tables_lower + columns_lower) for keyword in ecommerce_keywords):
        return "ecommerce"
    
    # Finance indicators
    finance_keywords = ['transaction', 'account', 'balance', 'payment', 'invoice']
    if any(keyword in ' '.join(tables_lower + columns_lower) for keyword in finance_keywords):
        return "finance"
    
    # HR indicators
    hr_keywords = ['employee', 'salary', 'department', 'manager', 'hire']
    if any(keyword in ' '.join(tables_lower + columns_lower) for keyword in hr_keywords):
        return "hr"
    
    return "general"
