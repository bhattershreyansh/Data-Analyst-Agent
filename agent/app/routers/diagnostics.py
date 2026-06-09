import logging
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.security import get_current_user
from app.schemas.api_schemas import DiagnoseRequest, DiagnoseResponse
from app.services.data_sources import data_source_manager, active_sources
from app.services.rag_engine import SchemaRAG, get_schema_rag
from app.services.diagnostics import forensic_engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/diagnose", tags=["diagnostics"])

DEMO_SOURCE_ID = settings.DEMO_SOURCE_ID


@router.post("", response_model=DiagnoseResponse)
async def diagnose_anomaly(
    request: DiagnoseRequest,
    user: dict = Depends(get_current_user)
):
    """
    Forensic Root Cause Analysis using LangGraph Multi-Agent Engine (Deep Diagnostics)
    """
    session_id = user["user_id"]
    logger.info(f"🔍 Starting 'Root Cause Analysis' Forensic Diagnosis for session {session_id}: {request.question}")
    
    try:
        # Get the current Database Structure Map (Blueprint) for the ACTIVE source
        active_source_id = active_sources.get(session_id)
        blueprint = None
        active_engine = None
        
        if active_source_id:
            source = data_source_manager.get_source(active_source_id)
            if source:
                active_engine = source["engine"]
                temp_schema_rag = SchemaRAG(
                    active_engine, 
                    None,
                    index_name=settings.PINECONE_INDEX_NAME,
                    namespace=f"source-{active_source_id}"
                )
                blueprint = temp_schema_rag.get_blueprint()
                
                # Pre-Filter using Pinecone to prevent LLM Token Limit
                if blueprint and len(blueprint.get("tables", [])) > 5:
                    logger.info(f"Schema is large ({len(blueprint['tables'])} tables). Filtering top 5 relevant tables for Diagnostics...")
                    relevant_schemas = temp_schema_rag.retrieve_relevant_tables(request.question, top_k=5)
                    relevant_table_names = set(s["table_name"] for s in relevant_schemas)
                    
                    if relevant_table_names:
                        blueprint["tables"] = [t for t in blueprint["tables"] if t["name"] in relevant_table_names]
                        blueprint["relationships"] = [
                            r for r in blueprint["relationships"]
                            if r["from_table"] in relevant_table_names and r["to_table"] in relevant_table_names
                        ]
                        logger.info(f"Filtered blueprint to: {relevant_table_names}")
        
        # Fallback to default schema_rag if no active source or blueprint failed
        if not blueprint:
            rag = get_schema_rag()
            if rag:
                blueprint = rag.get_blueprint()
                
                if blueprint and len(blueprint.get("tables", [])) > 5:
                    relevant_schemas = rag.retrieve_relevant_tables(request.question, top_k=5)
                    relevant_table_names = set(s["table_name"] for s in relevant_schemas)
                    if relevant_table_names:
                        blueprint["tables"] = [t for t in blueprint["tables"] if t["name"] in relevant_table_names]
                        blueprint["relationships"] = [
                            r for r in blueprint["relationships"]
                            if r["from_table"] in relevant_table_names and r["to_table"] in relevant_table_names
                        ]
            else:
                logger.warning("No blueprint available (Database offline and no active file source)")
                blueprint = {"tables": [], "relationships": []}
        
        # Invoke the Forensic Engine (LangGraph)
        inputs = {
            "question": request.question,
            "anomaly_data": request.anomaly_data,
            "blueprint": blueprint,
            "engine": active_engine,
            "investigation_steps": [],
            "evidence_found": [],
            "sql_call_count": 0,
            "drill_down_hints": []
        }
        
        result = forensic_engine.invoke(inputs)
        
        return DiagnoseResponse(
            verdict=result.get("verdict", "No conclusive verdict reached."),
            diagnostic_path=result.get("diagnostic_path", []),
            investigation_steps=result.get("investigation_steps", [])
        )
        
    except Exception as e:
        logger.error(f"❌ Forensic Analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Forensic Engine error: {str(e)}")
