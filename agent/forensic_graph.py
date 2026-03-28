import os
import re
import json
import logging
from typing import Dict, List, TypedDict, Optional, Any
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
import pandas as pd
from agnet_rag import engine as global_engine

logger = logging.getLogger(__name__)

# ============================================
# 1. CONSTANTS
# ============================================

MAX_SQL_CALLS = 5  # Hard ceiling on total SQL executions across all Sleuth runs

# Regex that catches every mutating SQL keyword — applied before any query runs
FORBIDDEN_SQL_RE = re.compile(
    r'\b(DELETE|DROP|ALTER|UPDATE|INSERT|CREATE|TRUNCATE|REPLACE|RENAME|GRANT|REVOKE|EXEC|EXECUTE)\b',
    re.IGNORECASE
)

# ============================================
# 2. FORENSIC STATE
# ============================================

class ForensicState(TypedDict):
    """Shared state across all forensic agents"""
    # Inputs
    question: str
    anomaly_data: List[Dict[str, Any]]
    blueprint: Dict[str, Any]       # The Sentinel Map (tables + relationships)
    engine: Optional[Any]           # Active DB engine (SQLite for files, MySQL for DB)

    # Internal Reasoning
    suspicious_tables: List[str]    # Identified by Schema Scout
    investigation_steps: List[str]  # Audit trail of every action taken
    evidence_found: List[Dict]      # Accumulated results from all Sleuth runs
    sql_call_count: int             # Running total of SQL queries executed
    drill_down_hints: List[str]     # Targeted questions from Judge for next Sleuth run

    # Output
    verdict: str
    diagnostic_path: List[Dict]
    error: Optional[str]

# ============================================
# 3. INITIALIZE LLM
# ============================================

groq_api_key = os.getenv("GROQ_API_KEY")
model = ChatGroq(
    model="llama-3.3-70b-versatile",
    groq_api_key=groq_api_key,
    temperature=0.1
)

# ============================================
# 4. HELPER FUNCTIONS
# ============================================

def validate_sql_safety(query: str) -> bool:
    """
    Returns True if the query is safe (SELECT-only).
    Returns False and logs a warning if it contains any mutating commands.
    """
    if FORBIDDEN_SQL_RE.search(query):
        logger.warning(f"🚫 SQL Safety Blocked: Mutating command detected in query: {query[:120]}...")
        return False
    return True


def get_table_columns(blueprint: Dict, table_name: str) -> str:
    """
    Looks up the actual column names for a table from the blueprint.
    Always returns a string of columns — never lets the LLM guess.
    """
    table_info = next(
        (t for t in blueprint.get('tables', []) if t['name'] == table_name),
        None
    )
    if table_info and table_info.get('columns'):
        return ', '.join(table_info['columns'])
    return "unknown"


def clean_json(raw: str) -> str:
    """Strip code fences and remove raw control characters that break json.loads."""
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0]
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0]
    raw = re.sub(r'(?<!\\)[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', raw)
    return raw.strip()

# ============================================
# 5. AGENT NODES
# ============================================

def schema_scout(state: ForensicState) -> Dict:
    """Agent 1: Identifies which tables to investigate using the Sentinel Map."""
    logger.info("🕵️ Schema Scout: Scanning the Sentinel Map...")

    blueprint_str = json.dumps(state['blueprint'], indent=2, default=str)
    anomaly_str = json.dumps(state['anomaly_data'][:10], indent=2, default=str)

    prompt = f"""You are the 'Schema Scout' — a forensic database architect.
Identify which tables most likely contain the ROOT CAUSE of a reported data anomaly.

ANOMALY REPORT:
Question: "{state['question']}"
Sample Data: {anomaly_str}

THE SENTINEL MAP (all available tables and their relationships):
{blueprint_str}

INSTRUCTIONS:
1. Identify which tables are DIRECTLY involved in the anomaly.
2. Look for UPSTREAM or RELATED tables via Foreign Keys or Semantic Links.
   - If 'revenue' dropped → check 'orders', 'discounts', 'inventory'
   - If 'latency' spiked → check 'server_logs', 'deployments'
3. Return the 2-3 most suspicious table names.

Return ONLY a JSON list of strings, e.g., ["table1", "table2"].
"""

    response = model.invoke([HumanMessage(content=prompt)])
    try:
        content = clean_json(response.content)
        suspicious_tables = json.loads(content, strict=False)
        if not isinstance(suspicious_tables, list):
            suspicious_tables = []
    except Exception as e:
        logger.error(f"Schema Scout parse error: {e}")
        suspicious_tables = []

    # Validate: only include tables that actually exist in the blueprint
    known_tables = {t['name'] for t in state['blueprint'].get('tables', [])}
    suspicious_tables = [t for t in suspicious_tables if t in known_tables]

    step = f"Schema Scout identified {len(suspicious_tables)} table(s) to investigate: {', '.join(suspicious_tables) or 'none found'}"
    logger.info(f"🕵️ {step}")

    return {
        "suspicious_tables": suspicious_tables,
        "investigation_steps": state.get("investigation_steps", []) + [step],
        "sql_call_count": 0,
        "drill_down_hints": []
    }


def data_sleuth(state: ForensicState) -> Dict:
    """
    Agent 2: Executes targeted SQL queries on suspicious tables.
    - Always injects real schema (no column hallucination)
    - Blocks all mutating SQL commands
    - Respects MAX_SQL_CALLS budget
    - Uses drill_down_hints from Judge on retry runs
    """
    logger.info("🔬 Data Sleuth: Gathering forensic evidence...")
    investigation_steps = list(state.get("investigation_steps", []))
    evidence_found = list(state.get("evidence_found", []))
    sql_call_count = state.get("sql_call_count", 0)
    drill_down_hints = state.get("drill_down_hints", [])

    # Use the active engine from state, fall back to global engine
    active_engine = state.get("engine") or global_engine
    if active_engine is None:
        investigation_steps.append("⚠️ No active database engine — SQL investigation skipped.")
        return {"evidence_found": evidence_found, "investigation_steps": investigation_steps, "sql_call_count": sql_call_count}

    # Determine SQL dialect for the prompt
    dialect = "SQL"
    if hasattr(active_engine, "dialect") and hasattr(active_engine.dialect, "name"):
        dialect = str(active_engine.dialect.name).upper()

    # Build the hint block for drill-down runs
    hints_block = ""
    if drill_down_hints:
        hints_block = f"""
JUDGE'S DRILL-DOWN INSTRUCTIONS (you must investigate these specific questions):
{chr(10).join(f"- {h}" for h in drill_down_hints)}
"""

    suspicious = state.get('suspicious_tables', [])
    if not suspicious:
        investigation_steps.append("⚠️ No suspicious tables identified by Scout. Halting investigation loop.")
        # Force the loop to exit by exhausting the budget
        return {
            "evidence_found": evidence_found,
            "investigation_steps": investigation_steps,
            "sql_call_count": MAX_SQL_CALLS,
            "drill_down_hints": []
        }

    for table in suspicious:
        if sql_call_count >= MAX_SQL_CALLS:
            investigation_steps.append(f"⛔ SQL budget exhausted ({MAX_SQL_CALLS} calls). Stopping investigation.")
            break
            
        sql_call_count += 1 # Pay the cost upfront for attempting an investigation

        # Always get REAL columns from the blueprint — never let the LLM guess
        columns_str = get_table_columns(state['blueprint'], table)

        prompt = f"""You are the 'Data Sleuth' — a senior forensic SQL investigator.
Investigate table '{table}' to find evidence explaining the reported anomaly.

ORIGINAL QUESTION: {state['question']}
ANOMALY SAMPLE: {json.dumps(state['anomaly_data'][:5], default=str)}

CRITICAL — THE EXACT COLUMNS IN '{table}' ARE:
{columns_str}

YOU MUST ONLY USE COLUMNS FROM THE LIST ABOVE. Do NOT invent column names.
{hints_block}
STRICT RULES:
- Write ONE SELECT query targeting '{table}' using ONLY the columns listed above.
- Look for: outliers, nulls, high/low values, distribution skews, patterns.
- Use a LIMIT of 10.
- Use {dialect}-compatible syntax ONLY. Pay strict attention to {dialect} date and string functions.
- Do NOT use: DELETE, DROP, ALTER, UPDATE, INSERT, CREATE, TRUNCATE, or any mutating command.

Return ONLY the raw SQL query. No preamble, no backticks, no markdown.
"""
        response = model.invoke([HumanMessage(content=prompt)])
        sql_query = response.content.strip()

        # Strip any backticks if model wrapped it anyway
        if "```" in sql_query:
            sql_query = sql_query.split("```")[1].split("\n", 1)[-1].split("```")[0].strip()

        # Safety gate — block mutating SQL
        if not validate_sql_safety(sql_query):
            investigation_steps.append(f"🚫 Blocked unsafe SQL on {table}: mutating command detected. (Call #{sql_call_count})")
            continue

        logger.info(f"🔬 SQL call #{sql_call_count} on '{table}': {sql_query}")

        try:
            df = pd.read_sql(sql_query, active_engine)
            results = df.to_dict(orient="records")
            evidence_found.append({
                "table": table,
                "query": sql_query,
                "call_number": sql_call_count,
                "findings": results
            })
            investigation_steps.append(f"[Call #{sql_call_count}] Investigated '{table}' — {len(results)} record(s) found.")
        except Exception as e:
            logger.error(f"Data Sleuth SQL failed on '{table}': {e}")
            investigation_steps.append(f"[Call #{sql_call_count}] Failed on '{table}': {str(e)[:120]}")

    return {
        "evidence_found": evidence_found,
        "investigation_steps": investigation_steps,
        "sql_call_count": sql_call_count,
        "drill_down_hints": []   # Clear hints after consuming them
    }


def evidence_judge(state: ForensicState) -> Dict:
    """
    Judge Node: Evaluates whether the collected evidence is sufficient to
    identify a root cause. If not, provides targeted drill-down questions
    for the next Sleuth run. Hard-stops at MAX_SQL_CALLS.
    """
    sql_call_count = state.get("sql_call_count", 0)
    evidence = state.get("evidence_found", [])
    investigation_steps = list(state.get("investigation_steps", []))

    logger.info(f"⚖️ Judge: Evaluating evidence sufficiency ({sql_call_count}/{MAX_SQL_CALLS} SQL calls used)...")

    # Hard budget stop — always go to Narrator
    if sql_call_count >= MAX_SQL_CALLS:
        step = f"⚖️ Judge: SQL budget reached ({MAX_SQL_CALLS} calls). Proceeding to Narrator."
        investigation_steps.append(step)
        logger.info(f"⚖️ Judge: Budget exhausted → Narrator")
        return {
            "drill_down_hints": [],   # Empty = route to narrator
            "investigation_steps": investigation_steps
        }

    # No evidence at all → need a broader sweep
    if not evidence:
        step = "⚖️ Judge: No evidence yet. Requesting broader Sleuth sweep."
        investigation_steps.append(step)
        logger.info("⚖️ Judge: No evidence → drilling deeper")
        return {
            "drill_down_hints": ["Perform a broad scan of all available columns to find any unusual patterns, distributions, or outliers"],
            "investigation_steps": investigation_steps
        }

    # Ask the LLM to evaluate evidence quality
    evidence_str = json.dumps(evidence, indent=2, default=str)
    anomaly_str = json.dumps(state['anomaly_data'][:5], indent=2, default=str)

    prompt = f"""You are a forensic evidence evaluator. Decide if the evidence gathered is sufficient to clearly identify the ROOT CAUSE of the anomaly.

QUESTION: {state['question']}
ANOMALY: {anomaly_str}

EVIDENCE COLLECTED SO FAR ({len(evidence)} query result(s)):
{evidence_str}

SQL BUDGET REMAINING: {MAX_SQL_CALLS - sql_call_count} more call(s) allowed.

Evaluate honestly:
- Is the evidence specific enough to name a single root cause with confidence?  
- Or is the evidence too broad / inconclusive?

Return ONLY valid JSON:
{{
  "sufficient": true or false,
  "reason": "One sentence explaining why evidence is or isn't sufficient",
  "drill_down_questions": ["If insufficient: 1-2 SPECIFIC questions to dig deeper, e.g. 'Compare average TotalPrice grouped by Salesperson to find if one seller drives the North premium'"]
}}
"""

    response = model.invoke([HumanMessage(content=prompt)])
    try:
        result = json.loads(clean_json(response.content), strict=False)
        is_sufficient = result.get("sufficient", True)
        reason = result.get("reason", "")
        drill_down_hints = result.get("drill_down_questions", [])
    except Exception as e:
        logger.error(f"Judge parse error: {e}")
        is_sufficient = True
        reason = "Evaluation failed — proceeding with available evidence."
        drill_down_hints = []

    if is_sufficient:
        verdict_str = "✅ Sufficient evidence"
        hints_to_return = []          # Empty → router sends to Narrator
    else:
        verdict_str = "🔄 Needs more — drilling deeper"
        hints_to_return = drill_down_hints or ["Dig deeper into the data distribution"]

    step = f"⚖️ Judge [{sql_call_count}/{MAX_SQL_CALLS} calls]: {verdict_str}. {reason}"
    investigation_steps.append(step)
    logger.info(f"⚖️ Judge verdict: {verdict_str}")

    return {
        "drill_down_hints": hints_to_return,
        "investigation_steps": investigation_steps
    }


def forensic_narrator(state: ForensicState) -> Dict:
    """Agent 3: Synthesizes all evidence into a sharp, quantified causal verdict."""
    logger.info("⚖️ Forensic Narrator: Building the final verdict...")

    evidence_str = json.dumps(state.get('evidence_found', []), indent=2, default=str)
    anomaly_str = json.dumps(state['anomaly_data'][:10], indent=2, default=str)
    sql_calls = state.get('sql_call_count', 0)

    prompt = f"""You are the 'Chief Forensic Analyst' at Lumina AI — a world-class data detective.
Your job is ROOT CAUSE ANALYSIS, not data summarization.

TRIGGER DATA (what the user originally saw):
Question: "{state['question']}"
Data: {anomaly_str}

EVIDENCE GATHERED ({sql_calls} SQL queries executed across {len(state.get('evidence_found', []))} table(s)):
{evidence_str}

═══════════════════════════════════════════════
CRITICAL RULES — VIOLATING THESE IS UNACCEPTABLE:
═══════════════════════════════════════════════
BANNED phrases (these are instant failures):
- "the data shows differences" — just describing the data
- "sales vary by region" — user already knows this  
- "further investigation may be needed" — commit to a conclusion
- Any vague or hedging language

YOU MUST:
- Cite specific numbers. Compare them. e.g. "North ATV $3,132 vs South $2,805 — 12% gap"
- Distinguish WHAT the data SHOWS vs WHAT CAUSED it
- Eliminate the obvious before naming the root cause
- Be bold and specific — this is a detective report, not a summary

FORENSIC REASONING FRAMEWORK (follow this exact structure in "verdict"):
1. PATTERN: Specific anomaly in exact numbers
2. ELIMINATION: What the obvious explanation is NOT and why
3. ROOT CAUSE: The single most likely driver — bold and specific
4. BUSINESS IMPACT: Concrete business consequence
5. ACTION: One specific, actionable recommendation

Return ONLY valid JSON:
{{
  "verdict": "Sharp 4-6 sentence analysis following the 5-step framework. Numbers only. Detective tone.",
  "diagnostic_path": [
    {{"title": "Pattern Identified", "finding": "Quantified finding with exact numbers", "status": "info"}},
    {{"title": "Ruled Out: [X]", "finding": "Why the obvious explanation is NOT the cause", "status": "info"}},
    {{"title": "Root Cause: [Y]", "finding": "The actual causal driver with evidence", "status": "critical"}},
    {{"title": "Business Impact", "finding": "Concrete business consequence in measurable terms", "status": "critical"}},
    {{"title": "Recommended Action", "finding": "One specific action to take", "status": "success"}}
  ]
}}
"""

    response = model.invoke([HumanMessage(content=prompt)])

    try:
        result = json.loads(clean_json(response.content), strict=False)
        verdict = result.get("verdict", "Unable to synthesize a conclusive verdict.")
        diagnostic_path = result.get("diagnostic_path", [])
    except Exception as e:
        logger.error(f"Forensic Narrator synthesis failed: {e}")
        verdict = "Investigation complete. Evidence was gathered but synthesis failed during formatting."
        diagnostic_path = [{"title": "Investigation Complete", "finding": "Analysis failed to synthesize results.", "status": "error"}]

    return {
        "verdict": verdict,
        "diagnostic_path": diagnostic_path
    }

# ============================================
# 6. ROUTING FUNCTION
# ============================================

def judge_routing(state: ForensicState) -> str:
    """
    Conditional edge: if Judge left drill_down_hints, route back to Sleuth.
    Empty hints (or budget exhausted) routes to Narrator.
    Using drill_down_hints as the signal avoids LangGraph boolean default collision.
    """
    hints = state.get("drill_down_hints", [])
    sql_count = state.get("sql_call_count", 0)
    if hints and sql_count < MAX_SQL_CALLS:
        logger.info(f"⚖️ Router: drill-down hints present → Sleuth (call {sql_count + 1})")
        return "sleuth"
    logger.info("⚖️ Router: no hints or budget exhausted → Narrator")
    return "narrator"

# ============================================
# 7. CONSTRUCT THE GRAPH
# ============================================

workflow = StateGraph(ForensicState)

# Register nodes
workflow.add_node("scout", schema_scout)
workflow.add_node("sleuth", data_sleuth)
workflow.add_node("judge", evidence_judge)
workflow.add_node("narrator", forensic_narrator)

# Linear entry: scout → sleuth
workflow.set_entry_point("scout")
workflow.add_edge("scout", "sleuth")

# After Sleuth → always go to Judge
workflow.add_edge("sleuth", "judge")

# After Judge → either loop back to Sleuth or proceed to Narrator
workflow.add_conditional_edges(
    "judge",
    judge_routing,
    {
        "sleuth": "sleuth",
        "narrator": "narrator"
    }
)

workflow.add_edge("narrator", END)

# Compile
forensic_engine = workflow.compile()

logger.info("📡 Forensic Intelligence Graph compiled — Judge node active, max 5 SQL calls enforced.")
