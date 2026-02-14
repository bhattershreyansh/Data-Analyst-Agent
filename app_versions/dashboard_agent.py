from ag_ui.encoder import EventEncoder
from ag_ui.core import (
    EventType, 
    TextMessageContentEvent,
    TextMessageStartEvent,
    TextMessageEndEvent,
    RunStartedEvent,
    RunFinishedEvent
)
import getpass
import os
from typing_extensions import TypedDict, Annotated
from dotenv import load_dotenv
from langchain.agents import create_sql_agent
from langchain_community.utilities import SQLDatabase
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool
import pandas as pd
import json
import re
import ast
from sqlalchemy import create_engine

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

# Initialize LLM
if not os.environ.get("GROQ_API_KEY"):
    os.environ["GROQ_API_KEY"] = getpass.getpass("Enter API key for Groq: ")

llm = init_chat_model("deepseek-r1-distill-llama-70b", model_provider="groq")

class State(TypedDict):
    question: str
    query: str
    result: str
    answer: str

class QueryOutput(TypedDict):
    """Generated SQL query."""
    query: Annotated[str, ..., "Syntactically valid SQL query."]

# Prompt template
system_message = """
Given an input question, create a syntactically correct {dialect} query to
run to help find the answer. Unless the user specifies in his question a
specific number of examples they wish to obtain, always limit your query to
at most {top_k} results. You can order the results by a relevant column to
return the most interesting examples in the database.

Never query for all the columns from a specific table, only ask for a the
few relevant columns given the question.

Pay attention to use only the column names that you can see in the schema
description. Be careful to not query for columns that do not exist. Also,
pay attention to which column is in which table.

Only use the following tables:
{table_info}
"""

user_prompt = "Question: {input}"

query_prompt_template = ChatPromptTemplate(
    [("system", system_message), ("user", user_prompt)]
)

encoder = EventEncoder()

def extract_sql_from_llm_output(llm_output: str) -> str:
    """
    Extracts clean SQL query from LLM output.
    - Prefer code blocks.
    - Else find first SELECT statement.
    - Else fallback to raw text.
    - Remove newlines and excess spaces.
    """
    # Try code block
    match = re.search(r"```sql\s*(.*?)```", llm_output, re.DOTALL | re.IGNORECASE)
    if match:
        sql = match.group(1).strip()
    else:
        # Try SELECT ... ;
        match = re.search(r"(SELECT[\s\S]+?;)", llm_output, re.IGNORECASE)
        if match:
            sql = match.group(1).strip()
        else:
            sql = llm_output.strip()
    
    # Normalize whitespace: replace all newlines and multiple spaces
    sql = re.sub(r"\s+", " ", sql)
    return sql

def extract_summary_text(llm_output: str) -> str:
    # Remove <think>...</think> block if present
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", llm_output, flags=re.IGNORECASE)
    # Remove leading/trailing whitespace and newlines
    return cleaned.strip()

class DashboardAgent:
    def run(self, input: dict):
        user_question = input.get('question', '')
        message_id = input.get('message_id', 'msg_default')
        print(f"=== DASHBOARD AGENT DEBUG ===")
        print(f"Question received: {user_question}")
        
        # Check if this is a greeting or help request
        greeting_keywords = ['hello', 'hi', 'hey', 'help', 'please ask']
        if any(keyword in user_question.lower() for keyword in greeting_keywords):
            print("Greeting/help branch taken. Yielding greeting message.")
            yield TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=message_id,
                delta="Hello! I'm your hospital analytics assistant. I can help you with:\n\n• Patient data analysis\n• Bed availability\n• Doctor information\n• Appointment statistics\n• Department insights\n\nTry asking questions like:\n• 'How many patients are there?'\n• 'Show me bed availability'\n• 'List doctors by department'\n• 'Patient appointment statistics'"
            )
            print("Greeting message yielded.")
            return
        
        try:
            print("[DEBUG] Step 1: Generating SQL query...")
            prompt = query_prompt_template.invoke({
                "dialect": db.dialect,
                "top_k": 5,
                "table_info": db.get_table_info(),
                "input": user_question,
            })
            print("[DEBUG] LLM prompt generated.")
            llm_result = llm.invoke(prompt)
            print("[DEBUG] LLM invoked for SQL.")
            llm_output = getattr(llm_result, "content", llm_result)
            query = extract_sql_from_llm_output(llm_output)
            print(f"[DEBUG] SQL extracted: {query}")
            
            print("[DEBUG] Yielding SQL event...")
            yield TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=message_id,
                delta=f"Generated SQL query: {query}"
            )
            print("[DEBUG] SQL event yielded.")
            
            print("[DEBUG] Step 2: Executing SQL query...")
            engine = create_engine(f"mysql+mysqlconnector://{user}:{password}@{host}/{db_name}")
            df = pd.read_sql(query, engine)
            print(f"[DEBUG] Query returned {len(df)} rows.")
            
            columns = df.columns.tolist()
            rows = df.values.tolist()
            table_data = {"columns": columns, "rows": rows}
            print(f"[DEBUG] Table data prepared: {table_data}")
            
            print("[DEBUG] Yielding table data event...")
            yield TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=message_id,
                delta=json.dumps(table_data)
            )
            print("[DEBUG] Table data event yielded.")

            print("[DEBUG] Step 3: Generating summary...")
            summary_prompt = f"""
            Given the following table columns: {columns}
            and the following data (first 5 rows): {rows[:5]}
            Write a concise summary of the main insights from this data, as if explaining to a business user.
            """
            summary_result = llm.invoke(summary_prompt)
            print("[DEBUG] LLM invoked for summary.")
            raw_summary = getattr(summary_result, "content", summary_result)
            summary_text = extract_summary_text(raw_summary)
            print(f"[DEBUG] Summary extracted: {summary_text}")
            
            print("[DEBUG] Yielding summary event...")
            yield TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=message_id,
                delta=summary_text
            )
            print("[DEBUG] Summary event yielded.")

            print("[DEBUG] Step 4: Generating chart suggestion...")
            chart_prompt = f"""
            Given the following table columns: {columns}
            and the following data (first 5 rows): {rows[:5]}
            Suggest the best chart type (bar, pie, line, etc.) and which columns to use for x and y axes. 
            Respond in JSON with keys: chart_type, x, y, title.
            """
            chart_suggestion_result = llm.invoke(chart_prompt)
            print("[DEBUG] LLM invoked for chart suggestion.")
            chart_suggestion = getattr(chart_suggestion_result, "content", chart_suggestion_result)
            try:
                chart_suggestion_json = json.loads(chart_suggestion)
                print(f"[DEBUG] Chart suggestion JSON loaded: {chart_suggestion_json}")
            except Exception as ex:
                print(f"[DEBUG] Chart suggestion JSON load failed: {ex}")
                chart_suggestion_json = {
                    "chart_type": "bar",
                    "x": columns[0] if columns else "",
                    "y": columns[1] if len(columns) > 1 else "",
                    "title": f"{columns[1]} by {columns[0]}" if len(columns) > 1 else "Chart"
                }
            print("[DEBUG] Yielding chart suggestion event...")
            yield TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=message_id,
                delta=json.dumps(chart_suggestion_json)
            )
            print("[DEBUG] Chart suggestion event yielded.")

        except Exception as e:
            print(f"[DEBUG] Error in DashboardAgent: {e}")
            yield TextMessageContentEvent(
                type=EventType.TEXT_MESSAGE_CONTENT,
                message_id=message_id,
                delta=f"Error: {str(e)}"
            )

