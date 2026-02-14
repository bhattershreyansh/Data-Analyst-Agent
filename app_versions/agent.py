import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
import pandas as pd
import json
from typing import List, Dict
from typing_extensions import Annotated
from llama_index.llms.groq import Groq
from llama_index.core.tools import FunctionTool
import re
from langchain_community.utilities import SQLDatabase
import asyncio
from concurrent.futures import ThreadPoolExecutor
import time
import numpy as np
import logging

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

# Initialize LLMs
groq_llm = Groq(model="openai/gpt-oss-120b")
DEFAULT_QUERY_LIMIT = 20
MAX_QUERY_LIMIT = 100

# Create a chatbot with database schema as system message - FIXED VERSION
def create_database_chatbot():
    """
    Create a chatbot that has the database schema as its system message - IMPROVED
    """
    system_message = f"""You are a MySQL expert and data visualization specialist for a hospital management system.

Database Schema:
{db.get_table_info()}

CRITICAL RULES - FOLLOW EXACTLY:
1. Use ONLY MySQL syntax (not PostgreSQL)
2. Use DATE_FORMAT() instead of DATE_TRUNC() for date grouping  
3. Use ONLY column names that exist in the schema above
4. Always include LIMIT clause (max {MAX_QUERY_LIMIT})
5. Return ONLY JSON - no explanations, no code blocks, no extra text

CHART TYPE RULES:
- For counts/quantities → use "bar"
- For categories/proportions → use "pie" 
- For time series/trends → use "line"
- For raw data listing → use "table"

REQUIRED JSON FORMAT (return exactly this structure):
{{"sql": "SELECT column FROM table WHERE condition LIMIT 20", "chart": {{"type": "bar", "x": "column_name", "y": "column_name", "title": "Chart Title"}}, "reasoning": "Brief explanation"}}

EXAMPLES:
Question: "How many patients?"
Response: {{"sql": "SELECT COUNT(*) as patient_count FROM patients LIMIT 20", "chart": {{"type": "bar", "x": "metric", "y": "patient_count", "title": "Total Patients"}}, "reasoning": "Count all patients"}}

Question: "Doctors by department"
Response: {{"sql": "SELECT dept_Name, COUNT(*) as doctor_count FROM doctor d JOIN department dept ON d.dept_Id = dept.dept_Id GROUP BY dept_Name LIMIT 20", "chart": {{"type": "bar", "x": "dept_Name", "y": "doctor_count", "title": "Doctors by Department"}}, "reasoning": "Group doctors by department"}}

Return ONLY the JSON response - nothing else."""
    
    return groq_llm, system_message

# Initialize the chatbot
database_chatbot, system_message = create_database_chatbot()

def extract_clean_json(response: str) -> Dict:
    """
    Extract JSON from LLM response with multiple fallback strategies
    """
    # Remove any markdown code blocks first
    response = re.sub(r'```json\s*', '', response)
    response = re.sub(r'```\s*', '', response)
    response = response.strip()
    
    # Strategy 1: Try to parse the whole response as JSON
    try:
        parsed = json.loads(response)
        if validate_response_structure(parsed):
            return parsed
    except:
        pass
    
    # Strategy 2: Find JSON between braces
    json_patterns = [
        r'(\{[^{}]*"sql"[^{}]*"chart"[^{}]*\})',  # Look for sql + chart
        r'(\{.*?"sql".*?"chart".*?\})',  # More flexible
        r'(\{.*?\})',  # Any JSON object
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
    
    # Strategy 3: Try to reconstruct JSON from parts
    try:
        sql_match = re.search(r'"sql":\s*"([^"]+)"', response)
        chart_match = re.search(r'"chart":\s*(\{[^}]+\})', response)
        reasoning_match = re.search(r'"reasoning":\s*"([^"]+)"', response)
        
        if sql_match:
            reconstructed = {
                "sql": sql_match.group(1),
                "chart": {"type": "table", "title": "Data Results"},
                "reasoning": reasoning_match.group(1) if reasoning_match else "Generated query"
            }
            
            if chart_match:
                try:
                    reconstructed["chart"] = json.loads(chart_match.group(1))
                except:
                    pass
                    
            return reconstructed
    except:
        pass
    
    return None

def validate_response_structure(parsed: Dict) -> bool:
    """Validate the JSON response has required fields"""
    if not isinstance(parsed, dict):
        return False
    
    # Must have sql and chart
    if 'sql' not in parsed or 'chart' not in parsed:
        return False
    
    # SQL must be a string
    if not isinstance(parsed['sql'], str) or not parsed['sql'].strip():
        return False
    
    # Chart must be a dict
    if not isinstance(parsed['chart'], dict):
        return False
    
    # Chart must have type and title
    chart = parsed['chart']
    if 'type' not in chart or 'title' not in chart:
        return False
    
    return True

def create_fallback_response(question: str, limit: int) -> Dict:
    """Create a safe fallback when LLM completely fails"""
    question_lower = question.lower()
    
    # Simple pattern matching for fallbacks
    if any(word in question_lower for word in ['patient', 'patients']):
        return {
            "sql": f"SELECT * FROM patients LIMIT {limit}",
            "chart": {"type": "table", "x": "", "y": "", "title": "Patient Data"},
            "reasoning": "Fallback: Show patient data"
        }
    elif any(word in question_lower for word in ['doctor', 'doctors', 'physician']):
        return {
            "sql": f"SELECT * FROM doctor LIMIT {limit}",
            "chart": {"type": "table", "x": "", "y": "", "title": "Doctor Data"},
            "reasoning": "Fallback: Show doctor data"
        }
    elif any(word in question_lower for word in ['appointment', 'appointments']):
        return {
            "sql": f"SELECT * FROM appointment LIMIT {limit}",
            "chart": {"type": "table", "x": "", "y": "", "title": "Appointment Data"},
            "reasoning": "Fallback: Show appointment data"
        }
    elif any(word in question_lower for word in ['department', 'departments']):
        return {
            "sql": f"SELECT * FROM department LIMIT {limit}",
            "chart": {"type": "table", "x": "", "y": "", "title": "Department Data"},
            "reasoning": "Fallback: Show department data"
        }
    else:
        # Ultimate fallback
        return {
            "sql": f"SELECT 'System Status' as status, COUNT(*) as total_patients FROM patients LIMIT {limit}",
            "chart": {"type": "bar", "x": "status", "y": "total_patients", "title": "System Overview"},
            "reasoning": "Fallback: Basic system status"
        }

def clean_data_for_json(data):
    """Clean data to make it JSON serializable"""
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

def hospital_sql_tool_chatbot_fixed(
    question: Annotated[str, "A question about the hospital database"],
    limit: int = DEFAULT_QUERY_LIMIT
) -> Dict:
    """
    FIXED version with better error handling and JSON extraction
    """
    try:
        # Ensure limit is within bounds
        limit = min(limit, MAX_QUERY_LIMIT)
        
        # Create a very focused prompt - the system message already has the schema
        prompt = f"""Question: "{question}"

Generate MySQL query and chart config. Limit: {limit}

Return ONLY this JSON format:
{{"sql": "SELECT ... FROM ... LIMIT {limit}", "chart": {{"type": "bar|pie|line|table", "x": "column", "y": "column", "title": "Title"}}, "reasoning": "explanation"}}"""

        logger.info(f"Processing question: {question}")
        logger.info(f"Prompt: {prompt}")
        
        # Call the LLM - system message is already set with schema
        response = database_chatbot.complete(prompt).text.strip()
        logger.info(f"Raw LLM response: {response}")
        
        # Extract JSON with improved logic
        result = extract_clean_json(response)
        
        if not result:
            logger.warning("Failed to extract JSON from LLM response, using fallback")
            result = create_fallback_response(question, limit)
        
        sql_query = result.get("sql", "").strip()
        chart_config = result.get("chart", {})
        
        if not sql_query:
            logger.error("No SQL query in result")
            return {"error": "No valid SQL query generated"}
        
        # Execute the SQL
        logger.info(f"Executing SQL: {sql_query}")
        try:
            df = pd.read_sql(sql_query, engine)
            logger.info(f"Query executed successfully, got {len(df)} rows")
            
            table_data = df.to_dict(orient="records")
            table_data = clean_data_for_json(table_data)
            
            # Return result with chart config
            return {
                "query": sql_query,
                "result": table_data,
                "chart": chart_config if chart_config.get("type") != "table" else None,
                "reasoning": result.get("reasoning", ""),
                "row_count": len(table_data)
            }
            
        except Exception as sql_error:
            logger.error(f"SQL execution error: {sql_error}")
            return {"error": f"SQL execution failed: {str(sql_error)}"}
        
    except Exception as e:
        logger.error(f"Error in chatbot SQL tool: {e}")
        return {"error": f"Error: {str(e)}"}

# Enhanced dashboard functions using the same fixed approach
def create_dashboard_chatbot_fixed():
    """Fixed dashboard chatbot"""
    system_message = f"""You are a dashboard expert for a hospital management system.

Database Schema:
{db.get_table_info()}

Generate 4 MySQL queries for comprehensive dashboard:
1. Overview query - High-level summary
2. Trend query - Time-based analysis  
3. Comparison query - Category breakdown
4. Detail query - Specific metrics

Return ONLY a JSON array of query strings:
["SELECT ...", "SELECT ...", "SELECT ...", "SELECT ..."]

Use ONLY MySQL syntax and existing column names from schema above."""
    
    return groq_llm, system_message

dashboard_chatbot_fixed, dashboard_system_fixed = create_dashboard_chatbot_fixed()

def generate_dashboard_queries_fixed(prompt: str, analysis: Dict) -> List[str]:
    """Fixed dashboard query generation"""
    query_prompt = f"""Dashboard request: "{prompt}"
Analysis: {analysis}

Generate 4 MySQL queries for: overview, trends, comparisons, details.
Return JSON array: ["query1", "query2", "query3", "query4"]"""
    
    try:
        response = dashboard_chatbot_fixed.complete(query_prompt).text.strip()
        logger.info(f"Dashboard response: {response}")
        
        # Extract JSON array
        array_match = re.search(r'(\[.*?\])', response, re.DOTALL)
        if array_match:
            queries = json.loads(array_match.group(1))
            if isinstance(queries, list) and len(queries) >= 2:
                return queries[:4]  # Take first 4
    
    except Exception as e:
        logger.error(f"Error generating dashboard queries: {e}")
    
    # Fallback queries
    return [
        "SELECT COUNT(*) as total_patients FROM patients LIMIT 20",
        "SELECT dept_Name, COUNT(*) as doctor_count FROM doctor d JOIN department dept ON d.dept_Id = dept.dept_Id GROUP BY dept_Name LIMIT 20",
        "SELECT * FROM patients ORDER BY patient_Id DESC LIMIT 10",
        "SELECT * FROM appointment ORDER BY appointment_date DESC LIMIT 10"
    ]

# Test the fixed system
def test_fixed_system():
    """Test the fixed chatbot system"""
    test_questions = [
        "How many patients do we have?",
        "Show me doctors by department",
        "What are the recent appointments?", 
        "Give me patient age distribution",
        "Count of appointments by status"
    ]
    
    print("=== Testing Fixed Hospital Chatbot System ===\n")
    
    for i, question in enumerate(test_questions, 1):
        print(f"Test {i}: {question}")
        print("-" * 50)
        
        result = hospital_sql_tool_chatbot_fixed(question)
        
        if result.get("error"):
            print(f"❌ FAILED: {result['error']}")
        else:
            print(f"✅ SUCCESS")
            print(f"SQL: {result['query']}")
            print(f"Rows: {result.get('row_count', 0)}")
            print(f"Chart: {result.get('chart', {}).get('type', 'none')}")
            
        print("\n")

if __name__ == "__main__":
    test_fixed_system()