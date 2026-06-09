import time
import logging
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.schemas.api_schemas import QueryRequest, QueryResponse
from app.services.data_sources import data_source_manager, active_sources
from app.services.rag_engine import default_sql_query_rag, generic_sql_query_rag
from app.services.insights import insight_engine
from app.services.caching import cache_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/query", tags=["query"])

# Global session history cache
# Format: {session_id: [{"question": "...", "query": "..."}]}
conversation_history = {}


@router.post("", response_model=QueryResponse)
async def process_query(
    request: QueryRequest, 
    user: dict = Depends(get_current_user)
):
    """Execute natural language query against the active data source"""
    session_id = user["user_id"]
        
    try:
        start_time = time.time()
        
        # Initialize history for session if not exists
        if session_id not in conversation_history:
            conversation_history[session_id] = []
            
        # Get active data source for this session
        active_source_id = active_sources.get(session_id)
        
        # Get history for this session
        session_history = conversation_history[session_id]
        
        result = {}
        
        if not active_source_id:
            # No active source - use demo database as fallback
            logger.warning(f"No active source for session {session_id}, using demo DB")
            result = default_sql_query_rag(
                question=request.question,
                limit=request.limit
            )
        else:
            # Get the active data source
            source = data_source_manager.get_source(active_source_id)
            if not source:
                raise HTTPException(
                    status_code=404,
                    detail=f"Active data source {active_source_id} not found"
                )
            
            engine = source["engine"]
            db_type = source.get("db_type", "sqlite")
            
            if source["type"] == "file":
                db_type = "sqlite"
            
            column_stats = source.get("column_stats") if source["type"] == "file" else None
            
            logger.info(f"Querying {source['name']} ({db_type}) - {source['table_count']} tables")
            
            # Execute query with history and column stats
            result = generic_sql_query_rag(
                question=request.question,
                engine=engine,
                db_type=db_type,
                source_id=active_source_id,
                limit=request.limit,
                history=session_history,
                column_stats=column_stats
            )

        # Store interaction in history (if successful SQL generation)
        if "query" in result and result["query"]:
            conversation_history[session_id].append({
                "question": request.question,
                "query": result["query"]
            })
            
            # Keep history limited to last 10 interactions
            if len(conversation_history[session_id]) > 10:
                conversation_history[session_id] = conversation_history[session_id][-10:]
        
        execution_time = (time.time() - start_time) * 1000
        
        # Check for errors
        if result.get("error"):
            return QueryResponse(
                success=False,
                error=result["error"],
                execution_time_ms=execution_time,
                thought_logs=result.get("thought_logs")
            )
        
        # Override chart type if requested
        chart_config = result.get("chart")
        if request.chart_type and chart_config:
            chart_config["type"] = request.chart_type
        
        chart_id = None
        
        # Generate Insights (only when requested)
        insights = None
        suggestions = []
        
        if request.generate_insights and result.get("result") and len(result["result"]) > 0:
            cached_intel = cache_manager.get_insights(active_source_id or "demo", request.question)
            if cached_intel:
                logger.info(f"Returning cached insights for: {request.question}")
                insights = cached_intel.get("insights")
                suggestions = cached_intel.get("suggestions", [])
            else:
                cols = list(result["result"][0].keys())
                insights = insight_engine.generate_narrative(request.question, result["result"], cols)
                suggestions = insight_engine.generate_suggestions(request.question, result["result"], cols)
                
                cache_manager.set_insights(active_source_id or "demo", request.question, {
                    "insights": insights,
                    "suggestions": suggestions
                })
        
        return QueryResponse(
            success=True,
            query=result.get("query"),
            result=result.get("result"),
            chart=chart_config,
            chart_id=chart_id,
            reasoning=result.get("reasoning"),
            insights=insights,
            suggestions=suggestions,
            row_count=result.get("row_count"),
            retrieved_tables=result.get("retrieved_tables"),
            execution_time_ms=execution_time,
            thought_logs=result.get("thought_logs")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query processing error: {e}", exc_info=True)
        return QueryResponse(
            success=False,
            error=f"Internal server error: {str(e)}"
        )
