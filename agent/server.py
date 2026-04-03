from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
from uuid import uuid4
from datetime import datetime
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
from pathlib import Path
import shutil
from sqlalchemy import inspect
import os   


# Import SQLAlchemy models & setup
from models import SessionLocal, init_db, User, SavedChart as DBCart, Dashboard as DBDashboard, DataSource as DBDataSource
from sqlalchemy.orm import Session
from dotenv import load_dotenv
load_dotenv()

# Import your RAG system
from agnet_rag import (
    default_sql_query_rag, 
    generic_sql_query_rag, 
    get_schema_rag, 
    get_engine, 
    get_db,
    rebuild_schema_index, 
    SchemaRAG,
    generate_sql_with_rag_lazy
)

# Import caching
from caching import cache_manager

# Import data source manager
from data_sources import DataSourceManager

# Import smart question generator
from smart_questions import analyze_schema, detect_business_domain, detect_key_metrics, generate_smart_questions

# Import insight engine
from insight_engine import insight_engine

# Import forensic intelligence graph (LangGraph)
from forensic_graph import forensic_engine

# Import auth dependency
try:
    from auth import get_current_user
except ImportError:
    # Use dummy for now if running without auth setup
    async def get_current_user():
        return {"user_id": "anonymous"}

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Enterprise Analytics API",
    description="Natural language to SQL with RAG",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# PYDANTIC MODELS
# ============================================

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500, description="Natural language question")
    limit: Optional[int] = Field(default=20, ge=1, le=100, description="Maximum rows to return")
    chart_type: Optional[str] = Field(default=None, description="Override chart type")
    generate_insights: Optional[bool] = Field(default=False, description="Run Lumina Insight Engine")
    
    @field_validator('question')
    @classmethod
    def validate_question(cls, v):
        if not v.strip():
            raise ValueError('Question cannot be empty')
        return v.strip()


class QueryResponse(BaseModel):
    success: bool
    query: Optional[str] = None
    result: Optional[List[Dict]] = None
    chart: Optional[Dict] = None
    chart_id: Optional[str] = None
    reasoning: Optional[str] = None
    insights: Optional[str] = None
    suggestions: Optional[List[str]] = None
    row_count: Optional[int] = None
    retrieved_tables: Optional[List[str]] = None
    execution_time_ms: Optional[float] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


class SavedChart(BaseModel):
    chart_id: str
    question: str
    chart_type: str
    title: str
    data: List[Dict]
    query: Optional[str] = None
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    timestamp: datetime
    user_id: Optional[str] = None


class DashboardCreateRequest(BaseModel):
    dashboard_name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    layout: Optional[str] = Field(default="grid", description="Layout type: grid, rows, columns")
    include_all: Optional[bool] = Field(default=True, description="Include all saved charts")
    selected_chart_ids: Optional[List[str]] = Field(default=None, description="Specific chart IDs to include")
    
    @field_validator('layout')
    @classmethod
    def validate_layout(cls, v):
        if v not in ['grid', 'rows', 'columns']:
            raise ValueError('Layout must be grid, rows, or columns')
        return v


class DashboardResponse(BaseModel):
    dashboard_id: str
    name: str
    description: Optional[str] = None
    charts: List[SavedChart]
    layout: str
    created_at: datetime
    total_charts: int
    user_id: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: datetime
    saved_charts_count: int
    saved_dashboards_count: int
    schema_index_count: int  # NEW: Show ChromaDB index size


class SchemaInfo(BaseModel):
    """NEW: Schema information endpoint"""
    total_tables: int
    indexed: bool
    collection_count: int
    persist_directory: str

class DiagnoseRequest(BaseModel):
    question: str
    anomaly_data: List[Dict]
    source_id: Optional[str] = None

class DiagnoseResponse(BaseModel):
    verdict: str
    diagnostic_path: List[Dict]
    investigation_steps: List[str]
    timestamp: datetime = Field(default_factory=datetime.now)


class DatabaseConnectionRequest(BaseModel):
    """Request model for connecting to external database"""
    name: str = Field(..., min_length=1, max_length=100, description="User-friendly name")
    db_type: str = Field(..., description="Database type: postgresql, mysql, sqlserver")
    host: str = Field(..., description="Database host")
    port: int = Field(..., ge=1, le=65535, description="Database port")
    username: str = Field(..., description="Database username")
    password: str = Field(..., description="Database password")
    database: str = Field(..., description="Database name")
    
    @field_validator('db_type')
    @classmethod
    def validate_db_type(cls, v):
        allowed = ['postgresql', 'mysql', 'sqlserver']
        if v.lower() not in allowed:
            raise ValueError(f'Database type must be one of: {", ".join(allowed)}')
        return v.lower()


class DataSourceResponse(BaseModel):
    """Response model for data source operations"""
    source_id: str
    name: str
    type: str  # 'database' or 'file'
    status: str
    table_count: int
    tables: List[str]
    created_at: str



# ============================================
# DATA PERSISTENCE
# ============================================

CHARTS_FILE = Path("saved_charts.json")
DASHBOARDS_FILE = Path("saved_dashboards.json")

def load_charts() -> List[Dict]:
    """Load saved charts from file"""
    if CHARTS_FILE.exists():
        try:
            with open(CHARTS_FILE, 'r') as f:
                data = json.load(f)
                for chart in data:
                    chart['timestamp'] = datetime.fromisoformat(chart['timestamp'])
                return data
        except Exception as e:
            logger.error(f"Error loading charts: {e}")
            return []
    return []

def save_charts(charts: List[Dict]):
    """Save charts to file"""
    try:
        serializable_charts = []
        for chart in charts:
            chart_copy = chart.copy()
            chart_copy['timestamp'] = chart['timestamp'].isoformat()
            serializable_charts.append(chart_copy)
        
        with open(CHARTS_FILE, 'w') as f:
            json.dump(serializable_charts, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving charts: {e}")

def load_dashboards() -> List[Dict]:
    """Load saved dashboards from file"""
    if DASHBOARDS_FILE.exists():
        try:
            with open(DASHBOARDS_FILE, 'r') as f:
                data = json.load(f)
                for dashboard in data:
                    dashboard['created_at'] = datetime.fromisoformat(dashboard['created_at'])
                    for chart in dashboard['charts']:
                        chart['timestamp'] = datetime.fromisoformat(chart['timestamp'])
                return data
        except Exception as e:
            logger.error(f"Error loading dashboards: {e}")
            return []
    return []

def save_dashboards(dashboards: List[Dict]):
    """Save dashboards to file"""
    try:
        serializable_dashboards = []
        for dashboard in dashboards:
            dash_copy = dashboard.copy()
            dash_copy['created_at'] = dashboard['created_at'].isoformat()
            
            dash_copy['charts'] = []
            for chart in dashboard['charts']:
                chart_copy = chart.copy()
                chart_copy['timestamp'] = chart['timestamp'].isoformat()
                dash_copy['charts'].append(chart_copy)
            
            serializable_dashboards.append(dash_copy)
        
        with open(DASHBOARDS_FILE, 'w') as f:
            json.dump(serializable_dashboards, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving dashboards: {e}")

# Load data on startup
saved_charts = load_charts()
saved_dashboards = load_dashboards()

# Initialize data source manager
data_source_manager = DataSourceManager()
active_sources = {}  # {session_id: source_id} - track active source per session

# Helper to sync user in DB
def sync_user(db: Session, user_id: str):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        user = User(user_id=user_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

# Helper to sync data sources from DB to runtime manager
def sync_data_sources_from_db():
    db = SessionLocal()
    try:
        sources = db.query(DBDataSource).all()
        for s in sources:
            try:
                if s.type == "file":
                    info = s.connection_info
                    data_source_manager.add_file(
                        name=s.name,
                        file_path=info.get("file_path"),
                        file_type=info.get("file_type"),
                        source_id=s.source_id
                    )
                elif s.type == "database":
                    info = s.connection_info
                    # Decrypt password if needed
                    from security import security_manager
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

# ============================================
# DEMO MODE: Auto-load hospital database
# ============================================
DEMO_SOURCE_ID = "demo-hospital-db"

def initialize_demo_mode():
    """
    Initialize demo mode by adding the hardcoded hospital database
    as a pre-configured data source
    """
    try:
        # Check if demo source already exists
        if data_source_manager.get_source(DEMO_SOURCE_ID):
            logger.info("✅ Demo database already loaded")
            return
        
        # Add the hardcoded hospital database as a demo source
        from agnet_rag import get_engine, get_db
        engine = get_engine()
        db = get_db()
        
        # Manually add to data source manager with fixed ID
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        data_source_manager.sources[DEMO_SOURCE_ID] = {
            "source_id": DEMO_SOURCE_ID,
            "name": "🏥 Demo Hospital Database",
            "type": "database",
            "db_type": "mysql",
            "engine": engine,
            "tables": tables,
            "table_count": len(tables),
            "created_at": datetime.now().isoformat(),
            "status": "connected",
            "is_demo": True  # Flag to identify demo source
        }
        
        # Demo mode is available for all users to activate manually
        logger.info(f"✅ Demo mode initialized with {len(tables)} tables")
        
    except Exception as e:
        logger.error(f"Failed to initialize demo mode: {e}")
        logger.warning("⚠️  Demo mode unavailable - users can still upload their own data")



# ============================================
# ENDPOINTS
# ============================================

@app.get("/", response_model=HealthResponse)
async def health():
    """Health check endpoint with schema index info"""
    return HealthResponse(
        status="healthy",
        service="hospital_analytics_service",
        timestamp=datetime.now(),
        saved_charts_count=len(saved_charts),
        saved_dashboards_count=len(saved_dashboards),
        schema_index_count=get_schema_rag().get_count()  # Show ChromaDB size
    )


@app.get("/mode/status")
async def get_mode_status(
    user: dict = Depends(get_current_user)
):
    """
    Get current mode status and active data source for the authenticated user
    """
    user_id = user["user_id"]
    active_source_id = active_sources.get(user_id)
    
    if not active_source_id:
        return {
            "mode": "no_source",
            "message": "No active data source. Upload a file or connect a database.",
            "active_source": None,
            "demo_available": data_source_manager.get_source(DEMO_SOURCE_ID) is not None
        }
    
    source = data_source_manager.get_source(active_source_id)
    
    if not source:
        return {
            "mode": "error",
            "message": "Active source not found",
            "active_source": None
        }
    
    is_demo = source.get("is_demo", False)
    
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
    """NEW: Get schema indexing information"""
    # Use lazy loading for health check
    rag = get_schema_rag()
    engine = get_engine()
    
    return SchemaInfo(
        total_tables=len(rag.inspector.get_table_names()) if rag.inspector else 0,
        indexed=rag.get_count() > 0,
        collection_count=rag.get_count(),
        persist_directory=rag.get_persist_directory()
    )


@app.post("/schema/rebuild")
async def rebuild_schema():
    """NEW: Force rebuild the schema index (use if database schema changes)"""
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


# ============================================
# DATA SOURCE MANAGEMENT ENDPOINTS
# ============================================

@app.post("/data-sources/upload", response_model=DataSourceResponse)
async def upload_file(
    file: UploadFile = File(...), 
    name: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a file and store metadata in SQL"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
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
        
        # Persist in SQL with correct multi-sheet metadata
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
            table_count=result.get("table_count", 1)  # Correct count for multi-sheet Excel
        )
        db.add(db_source)
        db.commit()
        
        return result
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/data-sources/connect", response_model=DataSourceResponse)
async def connect_database(
    request: DatabaseConnectionRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Connect to database and store metadata in SQL"""
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
        
        # Get encrypted password from manager (it handles security)
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


@app.get("/data-sources")
async def list_data_sources(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all connected data sources for this user"""
    try:
        user_id = user["user_id"]
        # Get from DB for isolation
        db_sources = db.query(DBDataSource).filter(DBDataSource.user_id == user_id).all()
        
        # Match with runtime manager for current status
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


@app.get("/data-sources/{source_id}")
async def get_data_source(source_id: str):
    """
    Get details of a specific data source
    """
    source = data_source_manager.get_source(source_id)
    
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
    
    # Return without engine object
    return {
        "source_id": source["source_id"],
        "name": source["name"],
        "type": source["type"],
        "tables": source["tables"],
        "table_count": source["table_count"],
        "status": source["status"],
        "created_at": source["created_at"]
    }


@app.get("/data-sources/{source_id}/schema")
async def get_data_source_schema(
    source_id: str,
    enrich: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the Sentinel Map (Schema Blueprint) for a data source.
    Deterministic relationship mapping (Foreign Keys).
    """
    user_id = user["user_id"]
    
    # Verify ownership
    if source_id != DEMO_SOURCE_ID:
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access this schema")
            
    source = data_source_manager.get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
        
    try:
        # Create temporary SchemaRAG for this engine
        engine = source["engine"]
        temp_schema_rag = SchemaRAG(
            engine, 
            None,
            index_name=os.getenv("PINECONE_INDEX_NAME", "lumina-ai"),
            namespace=f"source-{source_id}"
        )
        
        blueprint = temp_schema_rag.get_blueprint()
        
        # Add metadata
        blueprint["source_name"] = source["name"]
        blueprint["source_id"] = source_id
        blueprint["timestamp"] = datetime.now().isoformat()
        
        # Optional AI Enrichment (Hybrid Mode)
        # Note: We can implement this later to keep initial cost zero
        blueprint["ai_enriched"] = enrich
        
        return blueprint
        
    except Exception as e:
        logger.error(f"Error generating schema blueprint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/data-sources/{source_id}/schema/cache")
async def clear_schema_cache(source_id: str, user: dict = Depends(get_current_user)):
    """Clear the cached schema index for a data source"""
    # ... logic to clear ChromaDB collection ...
    return {"message": "Schema cache cleared"}


@app.delete("/data-sources/{source_id}")
async def remove_data_source(source_id: str):
    """
    Remove a data source
    """
    success = data_source_manager.remove_source(source_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
    
    return JSONResponse(
        content={"message": f"Data source removed successfully"},
        status_code=200
    )


@app.post("/data-sources/{source_id}/activate")
async def set_active_source(
    source_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Set active data source for the authenticated user (requires ownership)
    """
    user_id = user["user_id"]
    
    # Verify source belongs to user (or is demo)
    if source_id != DEMO_SOURCE_ID:
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access this data source")
    
    source = data_source_manager.get_source(source_id)
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


@app.post("/data-sources/deactivate")
async def deactivate_source(
    user: dict = Depends(get_current_user)
):
    """
    Clear the active data source for the authenticated user
    """
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


# Use persistent cache_manager from caching.py

@app.get("/data-sources/{source_id}/smart-questions")
async def get_smart_questions(
    source_id: str, 
    count: int = 6, 
    refresh: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate smart, business-relevant questions for a data source (requires ownership)
    """
    user_id = user["user_id"]
    
    # Verify ownership
    if source_id != DEMO_SOURCE_ID:
        db_source = db.query(DBDataSource).filter(
            DBDataSource.source_id == source_id,
            DBDataSource.user_id == user_id
        ).first()
        
        if not db_source:
            raise HTTPException(status_code=403, detail="Not authorized to access these questions")
    try:
        # Check cache first
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
        
        if not source:
            raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
        
        # Get engine and database type
        engine = source["engine"]
        db_type = source.get("db_type", "sqlite")
        
        if source["type"] == "file":
            db_type = "sqlite"
        
        logger.info(f"Generating smart questions for {source['name']} ({db_type})")
        
        # Analyze schema
        schema_info = analyze_schema(engine, db_type)
        
        # Detect business domain
        domain = detect_business_domain(schema_info)
        
        # Detect key metrics
        key_metrics = detect_key_metrics(schema_info)
        
        # Generate smart questions
        questions = generate_smart_questions(schema_info, domain, key_metrics, count)
        
        # Update cache
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



# Global session history cache
# Format: {session_id: [{"question": "...", "query": "..."}]}
conversation_history = {}

@app.post("/query", response_model=QueryResponse)
async def process_query(
    request: QueryRequest, 
    user: dict = Depends(get_current_user)
):
    """
    Execute natural language query against the active data source
    """
    # Strictly use clerk user_id as session_id
    session_id = user["user_id"]
        
    try:
        import time
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
            # No active source - use demo hospital DB as fallback
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
            
            # Get engine and database type
            engine = source["engine"]
            db_type = source.get("db_type", "sqlite")  # Default to sqlite for files
            
            # If it's a file source, db_type is sqlite
            if source["type"] == "file":
                db_type = "sqlite"
            
            # Pull column stats for value-aware SQL (files only)
            column_stats = source.get("column_stats") if source["type"] == "file" else None
            
            logger.info(f"Querying {source['name']} ({db_type}) - {source['table_count']} tables")
            
            # Execute generic query with history and value-aware stats
            result = generic_sql_query_rag(
                question=request.question,
                engine=engine,
                db_type=db_type,
                source_id=active_source_id,
                limit=request.limit,
                history=session_history,
                column_stats=column_stats  # Value-aware indexing
            )

        # Store interaction in history (if successful SQL generation)
        if "query" in result and result["query"]:
            conversation_history[session_id].append({
                "question": request.question,
                "query": result["query"]
            })
            
            # Keep history limited to last 10 interactions to prevent context bloat
            if len(conversation_history[session_id]) > 10:
                conversation_history[session_id] = conversation_history[session_id][-10:]
        
        execution_time = (time.time() - start_time) * 1000
        
        # Check for errors
        if result.get("error"):
            return QueryResponse(
                success=False,
                error=result["error"],
                execution_time_ms=execution_time
            )
        
        # Override chart type if requested
        chart_config = result.get("chart")
        if request.chart_type and chart_config:
            chart_config["type"] = request.chart_type
        
        # No auto-save. User must manually save.
        chart_id = None
        # if chart_config and result.get("result"):
        #     chart_id = str(uuid4())
        #     saved_chart = {
        #         "chart_id": chart_id,
        #         "question": request.question,
        #         "query": result.get("query"),
        #         "chart_type": chart_config.get("type", "table"),
        #         "title": chart_config.get("title", request.question),
        #         "data": result["result"],
        #         "x_axis": chart_config.get("x"),
        #         "y_axis": chart_config.get("y"),
        #         "timestamp": datetime.now()
        #     }
        #     saved_charts.append(saved_chart)
        #     save_charts(saved_charts)
        #     logger.info(f"Auto-saved chart: {chart_id}")
        
        # Generate Insights (only when explicitly requested)
        insights = None
        suggestions = []
        
        if request.generate_insights and result.get("result") and len(result["result"]) > 0:
            # Check cache for insights
            cached_intel = cache_manager.get_insights(active_source_id or "demo", request.question)
            if cached_intel:
                logger.info(f"Returning cached insights for: {request.question}")
                insights = cached_intel.get("insights")
                suggestions = cached_intel.get("suggestions", [])
            else:
                cols = list(result["result"][0].keys())
                insights = insight_engine.generate_narrative(request.question, result["result"], cols)
                suggestions = insight_engine.generate_suggestions(request.question, result["result"], cols)
                
                # Save to cache
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
            execution_time_ms=execution_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query processing error: {e}", exc_info=True)
        return QueryResponse(
            success=False,
            error=f"Internal server error: {str(e)}"
        )


@app.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose_anomaly(
    request: DiagnoseRequest,
    user: dict = Depends(get_current_user)
):
    """
    Forensic Root Cause Analysis using LangGraph Multi-Agent Engine (Causal Nexus)
    """
    session_id = user["user_id"]
    logger.info(f"🔍 Starting 'Causal Nexus' Forensic Analysis for session {session_id}: {request.question}")
    
    try:
        # 1. Get the current Sentinel Map (Blueprint) for the ACTIVE source
        active_source_id = active_sources.get(session_id)
        blueprint = None
        active_engine = None
        
        if active_source_id:
            source = data_source_manager.get_source(active_source_id)
            if source:
                active_engine = source["engine"]  # Capture active engine for agents
                # Create a temporary SchemaRAG for this specific source
                collection_name = f"schema-{active_source_id}"
                temp_schema_rag = SchemaRAG(
                    active_engine, 
                    None,
                    index_name=os.getenv("PINECONE_INDEX_NAME", "lumina-ai"),
                    namespace=f"source-{active_source_id}"
                )
                blueprint = temp_schema_rag.get_blueprint()
                
                # 🎯 Pre-Filter using Chroma to prevent Groq Token Limit (413 Payload Too Large)
                if blueprint and len(blueprint.get("tables", [])) > 5:
                    logger.info(f"Schema is large ({len(blueprint['tables'])} tables). Using Chroma to filter top 5 relevant tables for Nexus...")
                    relevant_schemas = temp_schema_rag.retrieve_relevant_tables(request.question, top_k=5)
                    relevant_table_names = set(s["table_name"] for s in relevant_schemas)
                    
                    if relevant_table_names:
                        blueprint["tables"] = [t for t in blueprint["tables"] if t["name"] in relevant_table_names]
                        blueprint["relationships"] = [
                            r for r in blueprint["relationships"]
                            if r["from_table"] in relevant_table_names and r["to_table"] in relevant_table_names
                        ]
                        logger.info(f"Filtered Nexus blueprint to: {relevant_table_names}")
        
        # Fallback to global schema_rag if no active source or blueprint failed
        if not blueprint:
            rag = get_schema_rag()
            if rag:
                blueprint = rag.get_blueprint()
                
                # Pre-filter fallback blueprint too
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
                logger.warning("No blueprint available (MySQL offline and no active file source)")
                blueprint = {"tables": [], "relationships": []}
        
        # 2. Invoke the Forensic Engine (LangGraph)
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
        
        # Run the graph
        result = forensic_engine.invoke(inputs)
        
        return DiagnoseResponse(
            verdict=result.get("verdict", "No conclusive verdict reached."),
            diagnostic_path=result.get("diagnostic_path", []),
            investigation_steps=result.get("investigation_steps", [])
        )
        
    except Exception as e:
        logger.error(f"❌ Forensic Analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Forensic Engine error: {str(e)}")


@app.post("/saved-charts", response_model=SavedChart)
async def create_saved_chart(
    chart: SavedChart, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a chart to SQL database"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
        # Check if chart exists for this user
        existing = db.query(DBCart).filter(DBCart.chart_id == chart.chart_id, DBCart.user_id == user_id).first()
        if existing:
            for key, value in chart.model_dump().items():
                setattr(existing, key, value)
            existing.user_id = user_id
            db.commit()
            return existing
        
        # Create new
        db_chart = DBCart(**chart.model_dump())
        db_chart.user_id = user_id
        db.add(db_chart)
        db.commit()
        db.refresh(db_chart)
        return db_chart
    except Exception as e:
        logger.error(f"Error saving chart to DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/saved-charts", response_model=List[SavedChart])
async def get_charts(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all saved charts for current user"""
    user_id = user["user_id"]
    return db.query(DBCart).filter(DBCart.user_id == user_id).all()


@app.get("/saved-charts/{chart_id}", response_model=SavedChart)
async def get_chart(
    chart_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific saved chart for current user"""
    user_id = user["user_id"]
    chart = db.query(DBCart).filter(DBCart.chart_id == chart_id, DBCart.user_id == user_id).first()
    if chart:
        return chart
    raise HTTPException(status_code=404, detail=f"Chart {chart_id} not found")


@app.delete("/saved-charts/{chart_id}")
async def delete_chart(
    chart_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a saved chart for current user"""
    user_id = user["user_id"]
    chart = db.query(DBCart).filter(DBCart.chart_id == chart_id, DBCart.user_id == user_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail=f"Chart {chart_id} not found")
    
    db.delete(chart)
    db.commit()
    return {"success": True, "message": f"Chart {chart_id} deleted"}


@app.delete("/saved-charts")
async def clear_all_charts(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear all saved charts for current user"""
    user_id = user["user_id"]
    count = db.query(DBCart).filter(DBCart.user_id == user_id).delete()
    db.commit()
    return {"success": True, "message": f"Cleared {count} charts"}


@app.post("/dashboard/create", response_model=DashboardResponse)
async def create_dashboard(
    request: DashboardCreateRequest, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a dashboard in SQL database"""
    try:
        user_id = user["user_id"]
        sync_user(db, user_id)
        
        # Get charts for this user
        if request.include_all:
            user_charts = db.query(DBCart).filter(DBCart.user_id == user_id).all()
        else:
            user_charts = db.query(DBCart).filter(
                DBCart.user_id == user_id, 
                DBCart.chart_id.in_(request.selected_chart_ids or [])
            ).all()
            
        if not user_charts:
            raise HTTPException(status_code=400, detail="No charts available for dashboard")
        
        dashboard_id = str(uuid4())
        db_dashboard = DBDashboard(
            dashboard_id=dashboard_id,
            user_id=user_id,
            name=request.dashboard_name,
            description=request.description,
            charts=[c.chart_id for c in user_charts], # Store IDs in SQL JSON
            layout=request.layout,
            created_at=datetime.now(),
            total_charts=len(user_charts)
        )
        
        db.add(db_dashboard)
        db.commit()
        db.refresh(db_dashboard)
        
        # Return with full chart objects for frontend
        response = db_dashboard.__dict__.copy()
        response['charts'] = user_charts
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dashboard creation error: {e}")
        raise HTTPException(status_code=500, detail=f"Dashboard creation failed: {str(e)}")

@app.get("/dashboards", response_model=List[DashboardResponse])
async def get_dashboards(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all dashboards for current user with full chart details"""
    user_id = user["user_id"]
    dashboards = db.query(DBDashboard).filter(DBDashboard.user_id == user_id).all()
    
    results = []
    for dash in dashboards:
        # Fetch charts for this dashboard
        chart_ids = dash.charts if isinstance(dash.charts, list) else []
        charts = db.query(DBCart).filter(DBCart.chart_id.in_(chart_ids)).all()
        
        dash_dict = {c.name: getattr(dash, c.name) for c in dash.__table__.columns}
        dash_dict['charts'] = charts
        results.append(dash_dict)
        
    return results


@app.get("/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
    dashboard_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific dashboard with full chart details for current user"""
    user_id = user["user_id"]
    dash = db.query(DBDashboard).filter(DBDashboard.dashboard_id == dashboard_id, DBDashboard.user_id == user_id).first()
    if not dash:
        raise HTTPException(status_code=404, detail=f"Dashboard {dashboard_id} not found")
    
    # Fetch charts
    chart_ids = dash.charts if isinstance(dash.charts, list) else []
    charts = db.query(DBCart).filter(DBCart.chart_id.in_(chart_ids)).all()
    
    response = {c.name: getattr(dash, c.name) for c in dash.__table__.columns}
    response['charts'] = charts
    return response

@app.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str, 
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a dashboard for current user"""
    user_id = user["user_id"]
    dash = db.query(DBDashboard).filter(DBDashboard.dashboard_id == dashboard_id, DBDashboard.user_id == user_id).first()
    if not dash:
        raise HTTPException(status_code=404, detail=f"Dashboard {dashboard_id} not found")
    
    db.delete(dash)
    db.commit()
    return {"success": True, "message": f"Dashboard {dashboard_id} deleted"}


# ============================================
# ERROR HANDLERS
# ============================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom HTTP exception handler"""
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
    """General exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "timestamp": datetime.now().isoformat()
        }
    )


# ============================================
# STARTUP/SHUTDOWN EVENTS
# ============================================

@app.on_event("startup")
async def startup_event():
    """Startup event - kept lightweight for Render"""
    # Initialize JSON to SQL database (metadata)
    init_db()
    logger.info("🗄️  Metadata Database Initialized")
    
    # We DON'T initialize the RAG engine here to avoid blocking port binding
    logger.info("🚀 Enterprise Analytics API Started (Lazy Mode)")
    
    # Sync data sources (this is lightweight)
    sync_data_sources_from_db()
    
    # Initialize demo mode
    initialize_demo_mode()



@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event"""
    logger.info("💾 Saving data before shutdown...")
    save_charts(saved_charts)
    save_dashboards(saved_dashboards)
    logger.info("👋 Enterprise Analytics API Shutdown")


# ============================================
# RUN SERVER
# ============================================

# if __name__ == "__main__":
#     import uvicorn
#     port = int(os.getenv("PORT", 8000))
#     uvicorn.run(
#         "server:app",
#         host="0.0.0.0",
#         port=port,
#         reload=True,
#         log_level="info"
#     )