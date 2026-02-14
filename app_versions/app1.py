import getpass
import os
from typing_extensions import TypedDict, Annotated
from dotenv import load_dotenv

from langchain.agents import create_sql_agent
from langchain_community.utilities import SQLDatabase
from langchain.llms import OpenAI
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools.sql_database.tool import QuerySQLDatabaseTool

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

# Typed definitions
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

def write_query(state: State):
    """Generate SQL query to fetch information."""
    prompt = query_prompt_template.invoke(
        {
            "dialect": db.dialect,
            "top_k": 10,
            "table_info": db.get_table_info(),
            "input": state["question"],
        }
    )
    structured_llm = llm.with_structured_output(QueryOutput)
    result = structured_llm.invoke(prompt)
    return {"query": result["query"]}

def execute_query(state: State):
    """Execute SQL query."""
    execute_query_tool = QuerySQLDatabaseTool(db=db)
    return {"result": execute_query_tool.invoke(state["query"])}

def main():
    print(f"Database dialect: {db.dialect}")
    print(f"Available tables: {db.get_usable_table_names()}")
    
    while True:
        user_question = input("\nEnter your question about the hospital database (or 'quit' to exit): ")
        if user_question.lower() == 'quit':
            break
            
        try:
            # Generate the query
            query_state = write_query({"question": user_question})
            print(f"\nGenerated SQL Query: {query_state['query']}")
            
            # Execute the query
            result_state = execute_query(query_state)
            print(f"\nQuery Result: {result_state['result']}")
            
        except Exception as e:
            print(f"\nError processing your question: {str(e)}")

if __name__ == "__main__":
    main()