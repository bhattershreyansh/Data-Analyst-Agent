import os
import shutil
import logging
from uuid import uuid4
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, security_manager
from app.models.db_models import User, DataSource as DBDataSource
from app.schemas.api_schemas import DataSourceResponse, DatabaseConnectionRequest, AnomalyScanResponse
from app.services.data_sources import data_source_manager, active_sources
from app.services.rag_engine import SchemaRAG
from app.services.anomaly_scanner import scan_anomalies
from app.services.smart_questions import (
    analyze_schema,
    detect_business_domain,
    detect_key_metrics,
    generate_smart_questions
)
from app.services.caching import cache_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/data-sources", tags=["data-sources"])

DEMO_SOURCE_ID = settings.DEMO_SOURCE_ID

def restore_source(source_id: str, db_source: DBDataSource):
    """Attempt to restore a data source into memory from DB metadata"""
    try:
        if db_source.type == "database":
            conn = db_source.connection_info
            pwd = security_manager.decrypt(conn.get("encrypted_password"))
            data_source_manager.add_database(
                name=db_source.name,
                db_type=db_source.db_type,
                host=conn.get("host"),
                port=conn.get("port"),
                username=conn.get("username"),
                password=pwd,
                database=conn.get("database"),
                source_id=source_id
            )
        elif db_source.type == "file":
            conn = db_source.connection_info
            file_path = conn.get("file_path")
            file_type = conn.get("file_type")
            if os.path.exists(file_path):
                data_source_manager.add_file(
                    name=db_source.name,
                    file_path=file_path,
                    file_type=file_type,
                    source_id=source_id
                )
            else:
                logger.error(f"Cannot restore source {source_id}: file {file_path} missing")
                return None
        return data_source_manager.get_source(source_id)
    except Exception as e:
        logger.error(f"Failed to restore source {source_id}: {e}")
        return None


def sync_user(db: Session, user_id: str):
    """Ensure user exists in metadata DB"""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        user = User(user_id=user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.post("/upload", response_model=DataSourceResponse)
async def upload_file(
    file: UploadFile = File(...), 
    name: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a CSV/Excel file and store metadata in SQLite"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
        # Ensure data folder exists
        os.makedirs("data", exist_ok=True)
        file_path = f"data/{uuid4()}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_type = file.filename.split(".")[-1].lower()
        source_name = name or file.filename
        
        # Add to runtime manager
        result = data_source_manager.add_file(
            name=source_name,
            file_path=file_path,
            file_type=file_type
        )
        
        # Persist in SQL
        db_source = DBDataSource(
            source_id=result["source_id"],
            user_id=user_id,
            name=source_name,
            type="file",
            connection_info={
                "file_path": file_path,
                "file_type": file_type,
                "tables": result.get("tables", [])
            },
            status="loaded",
            table_count=result.get("table_count", 1)
        )
        db.add(db_source)
        db.commit()
        
        return result
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/connect", response_model=DataSourceResponse)
async def connect_database(
    request: DatabaseConnectionRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Connect to external database and store connection details in SQLite"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
        # Add to runtime manager
        result = data_source_manager.add_database(
            name=request.name,
            db_type=request.db_type,
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            database=request.database
        )
        
        # Get encrypted password from manager
        runtime_source = data_source_manager.get_source(result["source_id"])
        
        # Persist in SQL
        db_source = DBDataSource(
            source_id=result["source_id"],
            user_id=user_id,
            name=request.name,
            type="database",
            db_type=request.db_type,
            connection_info={
                "host": request.host,
                "port": request.port,
                "username": request.username,
                "encrypted_password": runtime_source["encrypted_password"],
                "database": request.database
            },
            status="connected",
            table_count=result["table_count"]
        )
        db.add(db_source)
        db.commit()
        
        return result
    except Exception as e:
        logger.error(f"Connection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_data_sources(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all connected data sources for this user"""
    try:
        user_id = user["user_id"]
        db_sources = db.query(DBDataSource).filter(DBDataSource.user_id == user_id).all()
        
        sources = []
        for s in db_sources:
            runtime_info = data_source_manager.get_source(s.source_id)
            source_info = {
                "source_id": s.source_id,
                "name": s.name,
                "type": s.type,
                "status": runtime_info["status"] if runtime_info else "disconnected",
                "table_count": runtime_info["table_count"] if runtime_info else s.table_count,
                "created_at": s.created_at.isoformat()
            }
            if s.type == "database":
                source_info["db_type"] = s.db_type
            sources.append(source_info)
            
        return {
            "success": True,
            "count": len(sources),
            "sources": sources
        }
    except Exception as e:
        logger.error(f"Error listing data sources: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source_id}")
async def get_data_source(
    source_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get details of a specific data source"""
    user_id = user["user_id"]
    db_source = None
    if source_id != DEMO_SOURCE_ID and source_id != f"demo-shopify-{user_id}":
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access this data source")
            
    source = data_source_manager.get_source(source_id)
    if not source and db_source:
        source = restore_source(source_id, db_source)
        
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
    
    return {
        "source_id": source["source_id"],
        "name": source["name"],
        "type": source["type"],
        "tables": source["tables"],
        "table_count": source["table_count"],
        "status": source["status"],
        "created_at": source["created_at"]
    }


@router.get("/{source_id}/schema")
async def get_data_source_schema(
    source_id: str,
    enrich: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get Database Structure Map (Schema Blueprint) for a data source"""
    user_id = user["user_id"]
    
    # Verify ownership
    db_source = None
    if source_id != DEMO_SOURCE_ID and source_id != f"demo-shopify-{user_id}":
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access this schema")
            
    source = data_source_manager.get_source(source_id)
    if not source and db_source:
        source = restore_source(source_id, db_source)
        
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
        
    try:
        # Create temporary SchemaRAG for this engine
        engine = source["engine"]
        temp_schema_rag = SchemaRAG(
            engine, 
            None,
            index_name=settings.PINECONE_INDEX_NAME,
            namespace=f"source-{source_id}"
        )
        
        blueprint = temp_schema_rag.get_blueprint()
        blueprint["source_name"] = source["name"]
        blueprint["source_id"] = source_id
        blueprint["timestamp"] = datetime.now().isoformat()
        blueprint["ai_enriched"] = enrich
        
        return blueprint
        
    except Exception as e:
        logger.error(f"Error generating schema blueprint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{source_id}/schema/cache")
async def clear_schema_cache(source_id: str, user: dict = Depends(get_current_user)):
    """Clear the cached schema index for a data source (Stub)"""
    return {"message": "Schema cache cleared"}


@router.delete("/{source_id}")
async def remove_data_source(
    source_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a data source (auth required, ownership enforced)"""
    user_id = user["user_id"]

    # Verify ownership before deleting
    db_source = db.query(DBDataSource).filter(
        DBDataSource.source_id == source_id,
        DBDataSource.user_id == user_id
    ).first()
    if not db_source:
        raise HTTPException(status_code=403, detail="Not authorized to delete this data source")

    # Remove from runtime manager
    data_source_manager.remove_source(source_id)

    # Remove from persistent DB
    db.delete(db_source)
    db.commit()

    # Clear from active sources if it was active
    from app.services.data_sources import active_sources
    if active_sources.get(user_id) == source_id:
        active_sources[user_id] = None

    return JSONResponse(
        content={"message": f"Data source removed successfully"},
        status_code=200
    )


@router.post("/{source_id}/activate")
async def set_active_source(
    source_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Set active data source for the authenticated user (requires ownership)"""
    user_id = user["user_id"]
    
    # Verify source belongs to user (or is demo)
    db_source = None
    if source_id != DEMO_SOURCE_ID and source_id != f"demo-shopify-{user_id}":
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access this data source")
    
    source = data_source_manager.get_source(source_id)
    if not source and db_source:
        source = restore_source(source_id, db_source)
        
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
    
    active_sources[user_id] = source_id
    
    return JSONResponse(
        content={
            "message": f"Active data source set to: {source['name']}",
            "source_id": source_id,
            "user_id": user_id
        },
        status_code=200
    )


@router.post("/deactivate")
async def deactivate_source(user: dict = Depends(get_current_user)):
    """Clear the active data source for the authenticated user"""
    user_id = user["user_id"]
    if user_id in active_sources:
        active_sources[user_id] = None
    
    return JSONResponse(
        content={
            "message": "Data source deactivated",
            "user_id": user_id
        },
        status_code=200
    )


@router.get("/{source_id}/smart-questions")
async def get_smart_questions(
    source_id: str, 
    count: int = 6, 
    refresh: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate smart, business-relevant questions for a data source"""
    user_id = user["user_id"]
    
    db_source = None
    if source_id != DEMO_SOURCE_ID and source_id != f"demo-shopify-{user_id}":
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access these questions")
    try:
        # Check cache
        cached_data = cache_manager.get_smart_questions(source_id)
        if not refresh and cached_data:
            logger.info(f"Returning cached smart questions for {source_id}")
            return JSONResponse(
                content={
                    "questions": cached_data["questions"],
                    "domain": cached_data["domain"],
                    "source_id": source_id,
                    "source_name": cached_data["source_name"],
                    "generated_at": cached_data["timestamp"],
                    "cached": True
                },
                status_code=200
            )

        # Get the data source
        source = data_source_manager.get_source(source_id)
        if not source and db_source:
            source = restore_source(source_id, db_source)
            
        if not source:
            raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
        
        engine = source["engine"]
        db_type = source.get("db_type", "sqlite")
        
        if source["type"] == "file":
            db_type = "sqlite"
        
        logger.info(f"Generating smart questions for {source['name']} ({db_type})")
        
        schema_info = analyze_schema(engine, db_type)
        domain = detect_business_domain(schema_info)
        key_metrics = detect_key_metrics(schema_info)
        questions = generate_smart_questions(schema_info, domain, key_metrics, count)
        
        cache_data = {
            "questions": questions,
            "domain": domain,
            "source_name": source["name"],
            "timestamp": datetime.now().isoformat()
        }
        cache_manager.set_smart_questions(source_id, cache_data)
        
        return JSONResponse(
            content={
                "questions": questions,
                "domain": domain,
                "source_id": source_id,
                "source_name": source["name"],
                "generated_at": datetime.now().isoformat(),
                "cached": False
            },
            status_code=200
        )
        
    except Exception as e:
        logger.error(f"Error generating smart questions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate questions: {str(e)}")


@router.get("/{source_id}/scan-anomalies", response_model=AnomalyScanResponse)
async def scan_source_anomalies(
    source_id: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Run Proactive Diagnostic Scan on the active data source
    """
    user_id = user["user_id"]
    
    # Check permissions if not demo
    db_source = None
    if source_id != DEMO_SOURCE_ID and source_id != f"demo-shopify-{user_id}":
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access this data source anomalies")
            
    # Get active source metadata
    source = data_source_manager.get_source(source_id)
    if not source and db_source:
        source = restore_source(source_id, db_source)
        
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
        
    engine = source["engine"]
    
    try:
        anomalies = scan_anomalies(
            engine=engine,
            metadata_db=db,
            user_id=user_id,
            source_id=source_id
        )
        return AnomalyScanResponse(
            success=True,
            anomalies=anomalies
        )
    except Exception as e:
        logger.error(f"Error executing diagnostic anomaly scan: {e}")
        raise HTTPException(status_code=500, detail=f"Anomaly scan failed: {str(e)}")
