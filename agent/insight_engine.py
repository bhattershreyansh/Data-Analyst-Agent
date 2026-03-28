import logging
import json
import re
from typing import List, Dict, Any, Optional
from llama_index.llms.groq import Groq
import os

logger = logging.getLogger(__name__)

# Initialize LLM for insights
insight_llm = Groq(model="llama-3.3-70b-versatile")

class InsightEngine:
    def __init__(self):
        self.domain_markers = {
            "healthcare": ["patient", "doctor", "diagnosis", "hospital", "clinic", "treatment", "encounter"],
            "ecommerce": ["order", "product", "sales", "customer", "price", "revenue", "cart", "purchase"],
            "finance": ["transaction", "account", "balance", "payment", "invoice", "investment", "credit"],
            "hr": ["employee", "salary", "department", "manager", "hiring", "leave", "performance"],
            "education": ["student", "teacher", "course", "grade", "enrollment", "class", "school"]
        }

    def detect_domain(self, columns: List[str], table_names: List[str]) -> str:
        """Detect the domain of the data for better persona targeting"""
        combined = " ".join([c.lower() for c in columns] + [t.lower() for t in table_names])
        
        scores = {}
        for domain, markers in self.domain_markers.items():
            score = sum(1 for marker in markers if marker in combined)
            scores[domain] = score
            
        top_domain = max(scores, key=scores.get)
        if scores[top_domain] > 0:
            return top_domain
        return "general enterprise"

    def generate_narrative(self, question: str, results: List[Dict[str, Any]], columns: List[str]) -> str:
        """Generate a data story/narrative from results"""
        if not results:
            return "I couldn't find any data matching your request to analyze."
            
        # Sample data if too large for context
        sample_data = results[:20]
        domain = self.detect_domain(columns, [])
        
        prompt = f"""You are a world-class Strategic Consultant and Senior Data Scientist.
Analyze the following query results and provide high-level executive insights.

DOMAIN: {domain}
USER QUESTION: "{question}"
DATA RESULTS (JSON):
{json.dumps(sample_data, indent=2)}

INSTRUCTIONS:
1. Provide "Strategic Intelligence" - 3-4 bullet points that go BEYOND describing the data.
2. FOCUS ON SIGNIFICANCE: Why does this matter for the business? What are the hidden implications?
3. PROVIDE RECOMMENDATIONS: What specific action should be taken based on this data?
4. Identify outliers, surprising patterns, or risks that might not be obvious.
5. Use professional, clinical language. Do NOT repeat the raw numbers unless comparing them.
6. AVOID describing the SQL or the logic; focus ONLY on business value.

Return ONLY the bullet points, no preamble."""

        try:
            response = insight_llm.complete(prompt).text.strip()
            return response
        except Exception as e:
            logger.error(f"Error generating narrative: {e}")
            return "Analysis currently processing. Review raw data below for primary insights."

    def generate_suggestions(self, question: str, results: List[Dict[str, Any]], columns: List[str]) -> List[str]:
        """Generate 3 smart follow-up questions based on the results"""
        if not results:
            return ["Try a different date range", "Check for related categories", "List available tables"]
            
        columns_str = ", ".join(columns)
        
        prompt = f"""You are a Proactive Analytics Agent. 
Based on the user's current question and the results found in the {columns_str} columns, suggest exactly 3 relevant follow-up questions the user should ask to explore deeper.

CURRENT QUESTION: "{question}"
DATA COLUMNS: {columns_str}

RULES:
1. Suggestions must be natural language questions.
2. They should be "Drill-downs" or "Cross-comparisons" related to the current data.
3. Make them interesting and high-value.
4. Return ONLY a JSON list of 3 strings.

Example: ["What is the regional breakdown for these sales?", "Are there any seasonal trends in this data?", "Which products have the lowest margin in this set?"]"""

        try:
            response = insight_llm.complete(prompt).text.strip()
            # Extract JSON list using regex if needed
            match = re.search(r'\[.*\]', response, re.DOTALL)
            if match:
                return json.loads(match.group())
            return ["Analyze the top-performing segment", "Compare with historical trends", "Forecast next month performance"]
        except Exception as e:
            logger.error(f"Error generating suggestions: {e}")
            return ["Analyze the top-performing segment", "Compare with historical trends", "Forecast next month performance"]

# Singleton instance
insight_engine = InsightEngine()
