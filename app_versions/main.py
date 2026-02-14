import os
from fastapi import FastAPI
from sqlalchemy import create_engine
from llama_index.llms.groq import Groq
from llama_index.protocols.ag_ui.agent import AGUIChatWorkflow
import os
from typing_extensions import TypedDict, Annotated
from dotenv import load_dotenv
from langchain.agents import create_sql_agent
from langchain_community.utilities import SQLDatabase
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool
import pandas as pd
from sqlalchemy import create_engine
from typing import Annotated, Dict, Any

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

llm = init_chat_model("openai/gpt-oss-120b", model_provider="groq")
os.environ["GROQ_API_KEY"] = os.environ.get("GROQ_API_KEY")
engine = create_engine("mysql+mysqlconnector://myuser:mypassword@localhost/hospitalmanagementsystem")

class State(TypedDict):
    question: str
    query: str
    result: str
    answer: str

class QueryOutput(TypedDict):
    query: Annotated[str, ..., "Syntactically valid SQL query."]

# Prompt templates
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
query_prompt_template = ChatPromptTemplate([("system", system_message), ("user", user_prompt)])

# Main tool function
def hospital_sql_tool(
    question: Annotated[str, "A question about the hospital database"]
) -> Dict[str, Any]:
    try:
        # Create prompt from template
        prompt = query_prompt_template.invoke(
            {
                "dialect": db.dialect,
                "top_k": 10,
                "table_info": db.get_table_info(),
                "input": question,
            }
        )

        # Generate query from LLM
        structured_llm = llm.with_structured_output(QueryOutput)
        query_result = structured_llm.invoke(prompt)
        sql_query = query_result["query"]

        # Execute the query
        execute_query_tool = QuerySQLDatabaseTool(db=db)
        sql_output = execute_query_tool.invoke(sql_query)

        return {
            "query": sql_query,
            "result": sql_output
        }

    except Exception as e:
        return {
            "error": str(e)
        }
# Create the AG-UI router
agentic_chat_router = AGUIChatWorkflow(
    llm=llm,
    frontend_tools=[],
    backend_tools=[hospital_sql_tool],
    system_prompt="You are a hospital analytics assistant. Answer questions using the hospital database.",
    initial_state=None,
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9000)