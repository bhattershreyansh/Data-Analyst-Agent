import json
import pandas as pd
from llama_index.llms.groq import Groq
from dotenv import load_dotenv
load_dotenv()
import re

# Initialize Groq LLM
groq_llm = Groq(model="llama-3.3-70b-versatile")

# Chart suggestion prompt (copy from your main code)
chart_suggestion_prompt = """
Given the following SQL result (as a list of dicts):

{sql_output}

And the user's question:
"{question}"

Suggest a chart specification in JSON with the following fields:
- type: (bar, line, pie, etc.)
- x: column name(s) for x-axis (for bar/line), or labels (for pie)
- y: column name(s) for y-axis (for bar/line), or values (for pie)
- title: (optional) chart title

If no chart is appropriate, return null.
Only use column names present in the SQL result.
"""

def suggest_chart_spec(question, df):
    if hasattr(df, "to_dict"):
        sql_output = df.to_dict(orient="records")
    else:
        sql_output = df
    sql_output_str = json.dumps(sql_output, indent=2)
    prompt = chart_suggestion_prompt.format(question=question, sql_output=sql_output_str)
    chart_spec_str = groq_llm.complete(prompt).text.strip()
    print("Raw chart spec string:", chart_spec_str)

    # Extract JSON from code block if present
    match = re.search(r'```json\\s*(.*?)```', chart_spec_str, re.DOTALL)
    if match:
        json_str = match.group(1)
    else:
        # Fallback: try to find the first {...} block
        match = re.search(r'({.*})', chart_spec_str, re.DOTALL)
        json_str = match.group(1) if match else chart_spec_str

    try:
        chart_spec = json.loads(json_str)
        return chart_spec
    except Exception as e:
        print("Failed to parse chart spec:", e)
        return None

# Example test data
data = [
    {"department": "Cardiology", "number_of_doctors": 7},
    {"department": "Neurology", "number_of_doctors": 5},
    {"department": "Gastroenterology", "number_of_doctors": 3},
]
df = pd.DataFrame(data)
question = "Show the number of doctors in each department as a chart"

# Test the function
chart = suggest_chart_spec(question, df)
print("Parsed chart spec:", chart)