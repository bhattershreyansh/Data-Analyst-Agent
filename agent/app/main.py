import logging
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect

from app.core.config import settings
from app.core.database import SessionLocal, init_db, get_db, engine as metadata_engine
from app.core.security import get_current_user, security_manager
from app.models.db_models import DataSource as DBDataSource, SavedChart as DBCart, Dashboard as DBDashboard
from app.schemas.api_schemas import HealthResponse, SchemaInfo

# Import services
from app.services.data_sources import data_source_manager, active_sources
from app.services.rag_engine import get_schema_rag, get_engine, get_db as get_rag_db, rebuild_schema_index

# Import routers
from app.routers.data_sources import router as data_sources_router
from app.routers.query import router as query_router
from app.routers.diagnostics import router as diagnostics_router
from app.routers.dashboards import router as dashboards_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Shopify Data Analyst Agent API",
    description="Autonomous Agentic RAG analytics server",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(data_sources_router)
app.include_router(query_router)
app.include_router(diagnostics_router)
app.include_router(dashboards_router)

DEMO_SOURCE_ID = settings.DEMO_SOURCE_ID


# ─── SYNC HELPERS ──────────────────────────────────────────────────────

def sync_data_sources_from_db():
    """Re-hydrate connected data sources from metadata database on startup"""
    db = SessionLocal()
    try:
        sources = db.query(DBDataSource).all()
        for s in sources:
            try:
                if s.type == "file":
                    info = s.connection_info
                    file_path = info.get("file_path")
                    file_type = info.get("file_type")
                    if file_type == "db" or (file_path and file_path.endswith(".db")):
                        from sqlalchemy import create_engine
                        engine = create_engine(f"sqlite:///{file_path}")
                        inspector = inspect(engine)
                        tables = inspector.get_table_names()
                        data_source_manager.sources[s.source_id] = {
                            "source_id": s.source_id,
                            "name": s.name,
                            "type": "file",
                            "engine": engine,
                            "tables": tables,
                            "table_count": len(tables),
                            "created_at": s.created_at.isoformat(),
                            "status": "loaded"
                        }
                    else:
                        data_source_manager.add_file(
                            name=s.name,
                            file_path=file_path,
                            file_type=file_type,
                            source_id=s.source_id
                        )
                elif s.type == "database":
                    info = s.connection_info
                    password = security_manager.decrypt(info.get("encrypted_password"))
                    
                    data_source_manager.add_database(
                        name=s.name,
                        db_type=s.db_type,
                        host=info.get("host"),
                        port=info.get("port"),
                        username=info.get("username"),
                        password=password,
                        database=info.get("database"),
                        source_id=s.source_id
                    )
            except Exception as e:
                logger.error(f"Failed to re-hydrate data source {s.source_id}: {e}")
    finally:
        db.close()


def initialize_demo_mode():
    """No-op: Demo database is auto-provisioned on demand per user account"""
    logger.info("Per-user demo database provisioning is active")



# ─── CORE SYSTEM ENDPOINTS ──────────────────────────────────────────────

@app.get("/", response_model=HealthResponse)
async def health(db: Session = Depends(get_db)):
    """Health check and index statistics"""
    # Count database items
    charts_count = db.query(DBCart).count()
    dashboards_count = db.query(DBDashboard).count()
    
    return HealthResponse(
        status="healthy",
        service="shopify_data_analyst_service",
        timestamp=datetime.now(),
        saved_charts_count=charts_count,
        saved_dashboards_count=dashboards_count,
        schema_index_count=get_schema_rag().get_count()
    )


@app.get("/mode/status")
async def get_mode_status(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get active data source and mode for the authenticated user"""
    import os
    user_id = user["user_id"]
    
    # Check if this user has any database sources registered
    db_sources = db.query(DBDataSource).filter(DBDataSource.user_id == user_id).all()
    
    if not db_sources:
        # Create user-isolated Shopify demo database
        logger.info(f"Auto-provisioning private Shopify demo database for user: {user_id}")
        source_id = f"demo-shopify-{user_id}"
        
        # Ensure user exists in metadata DB
        from app.routers.data_sources import sync_user
        sync_user(db, user_id)
        
        # 1. Create SQLite DB file path
        os.makedirs("data", exist_ok=True)
        sqlite_path = f"data/{source_id}.db"
        
        # 2. Build connection & seed
        from sqlalchemy import create_engine
        demo_engine = create_engine(f"sqlite:///{sqlite_path}")
        
        from app.core.shopify_seeder import seed_shopify_tables
        try:
            seed_shopify_tables(demo_engine)
        except Exception as seed_err:
            logger.error(f"Error seeding user private shopify database: {seed_err}", exc_info=True)
        
        # 3. Inspect tables
        inspector = inspect(demo_engine)
        tables = inspector.get_table_names()
        
        # 4. Save metadata to DB
        db_source = DBDataSource(
            source_id=source_id,
            user_id=user_id,
            name="Demo Shopify Store",
            type="file",
            connection_info={
                "file_path": sqlite_path,
                "file_type": "db",
                "tables": tables
            },
            status="loaded",
            table_count=len(tables)
        )
        db.add(db_source)
        db.commit()
        
        # 5. Load in-memory
        data_source_manager.sources[source_id] = {
            "source_id": source_id,
            "name": "Demo Shopify Store",
            "type": "file",
            "engine": demo_engine,
            "tables": tables,
            "table_count": len(tables),
            "created_at": datetime.now().isoformat(),
            "status": "loaded",
            "is_demo": True
        }
        
        # 6. Set active
        active_sources[user_id] = source_id
        
        # Refresh lists
        db_sources = [db_source]
        
    active_source_id = active_sources.get(user_id)
    if not active_source_id and db_sources:
        # Default to their first data source if none is active in memory
        active_source_id = db_sources[0].source_id
        active_sources[user_id] = active_source_id
        
        # Make sure the engine is active in data_source_manager
        if active_source_id not in data_source_manager.sources:
            s = db_sources[0]
            if s.type == "file":
                info = s.connection_info
                file_path = info.get("file_path")
                from sqlalchemy import create_engine
                engine = create_engine(f"sqlite:///{file_path}")
                inspector = inspect(engine)
                tables = inspector.get_table_names()
                data_source_manager.sources[active_source_id] = {
                    "source_id": active_source_id,
                    "name": s.name,
                    "type": "file",
                    "engine": engine,
                    "tables": tables,
                    "table_count": len(tables),
                    "created_at": s.created_at.isoformat(),
                    "status": "loaded",
                    "is_demo": "demo-shopify-" in active_source_id
                }

    if not active_source_id:
        return {
            "mode": "no_source",
            "message": "No active data source. Upload a file or connect a database.",
            "active_source": None,
            "demo_available": True
        }
    
    source = data_source_manager.get_source(active_source_id)
    if not source:
        return {
            "mode": "error",
            "message": "Active source not found",
            "active_source": None
        }
    
    is_demo = "demo-shopify-" in active_source_id or source.get("is_demo", False)
    
    return {
        "mode": "demo" if is_demo else "custom",
        "message": f"Using {'demo database' if is_demo else 'custom data source'}: {source['name']}",
        "active_source": {
            "source_id": source["source_id"],
            "name": source["name"],
            "type": source["type"],
            "table_count": source["table_count"],
            "is_demo": is_demo
        },
        "demo_available": True
    }


@app.get("/schema/info", response_model=SchemaInfo)
async def get_schema_info():
    """Get schema indexing details"""
    rag = get_schema_rag()
    return SchemaInfo(
        total_tables=len(rag.inspector.get_table_names()) if rag.inspector else 0,
        indexed=rag.get_count() > 0,
        collection_count=rag.get_count(),
        persist_directory=rag.get_persist_directory()
    )


@app.post("/schema/rebuild")
async def rebuild_schema():
    """Force rebuild database schema blueprint indexes"""
    try:
        logger.info("Manual schema rebuild requested")
        rebuild_schema_index()
        return JSONResponse(
            content={
                "success": True,
                "message": "Schema index rebuilt successfully",
                "collection_count": get_schema_rag().get_count()
            },
            status_code=200
        )
    except Exception as e:
        logger.error(f"Schema rebuild error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Rebuild failed: {str(e)}")


# ─── SYSTEM EVENT HANDLERS ──────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "timestamp": datetime.now().isoformat()
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "timestamp": datetime.now().isoformat()
        }
    )


@app.on_event("startup")
async def startup_event():
    """Initialize system on startup"""
    init_db()
    logger.info("Metadata Database (SQLite) Initialized")
    
    # Pre-populate and connect databases
    sync_data_sources_from_db()
    initialize_demo_mode()
    
    logger.info("Shopify Data Analyst Agent API Started")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shopify Data Analyst Agent API Shutdown")
