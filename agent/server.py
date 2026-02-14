from fastapi import FastAPI, HTTPException, UploadFile, File
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

# Import your RAG system
from agnet_rag import hospital_sql_query_rag, generic_sql_query_rag, schema_rag, rebuild_schema_index

# Import data source manager
from data_sources import DataSourceManager

# Import smart question generator
from smart_questions import analyze_schema, detect_business_domain, detect_key_metrics, generate_smart_questions

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Hospital Analytics API",
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
    chart_type: Optional[str] = Field(default=None, description="Override chart type (bar, pie, line, table)")
    
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
        from agnet_rag import engine, db
        
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
        
        # Set as default active source
        active_sources["default"] = DEMO_SOURCE_ID
        
        logger.info(f"✅ Demo mode initialized with {len(tables)} tables")
        logger.info("💡 Demo database is active by default")
        
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
        schema_index_count=schema_rag.collection.count()  # Show ChromaDB size
    )


@app.get("/mode/status")
async def get_mode_status(session_id: str = "default"):
    """
    Get current mode status and active data source
    """
    active_source_id = active_sources.get(session_id)
    
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
    return SchemaInfo(
        total_tables=len(schema_rag.inspector.get_table_names()),
        indexed=schema_rag.collection.count() > 0,
        collection_count=schema_rag.collection.count(),
        persist_directory=schema_rag.persist_directory
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
                "collection_count": schema_rag.collection.count()
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
    name: Optional[str] = None
):
    """
    Upload Excel or CSV file and load into SQLite
    """
    try:
        # Validate file type
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ['.csv', '.xlsx', '.xls']:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file_ext}. Only CSV and Excel files are supported."
            )
        
        # Use filename as name if not provided
        if not name:
            name = Path(file.filename).stem
        
        # Save uploaded file temporarily
        upload_dir = Path("./uploads")
        upload_dir.mkdir(exist_ok=True)
        
        file_path = upload_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Add file to data source manager
        file_type = file_ext[1:]  # Remove the dot
        result = data_source_manager.add_file(
            name=name,
            file_path=str(file_path),
            file_type=file_type
        )
        
        logger.info(f"File uploaded successfully: {name}")
        
        return DataSourceResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@app.post("/data-sources/database", response_model=DataSourceResponse)
async def connect_database(request: DatabaseConnectionRequest):
    """
    Connect to external database (PostgreSQL, MySQL, SQL Server)
    """
    try:
        result = data_source_manager.add_database(
            name=request.name,
            db_type=request.db_type,
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            database=request.database
        )
        
        logger.info(f"Database connected successfully: {request.name}")
        
        return DataSourceResponse(**result)
        
    except Exception as e:
        logger.error(f"Database connection error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")


@app.get("/data-sources")
async def list_data_sources():
    """
    List all connected data sources
    """
    try:
        sources = data_source_manager.list_sources()
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
async def set_active_source(source_id: str, session_id: str = "default"):
    """
    Set active data source for a session
    """
    source = data_source_manager.get_source(source_id)
    
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source {source_id} not found")
    
    active_sources[session_id] = source_id
    
    return JSONResponse(
        content={
            "message": f"Active data source set to: {source['name']}",
            "source_id": source_id,
            "session_id": session_id
        },
        status_code=200
    )


# Global cache for smart questions
# Format: {source_id: {"questions": [], "domain": "", "timestamp": datetime}}
smart_questions_cache = {}

@app.get("/data-sources/{source_id}/smart-questions")
async def get_smart_questions(source_id: str, count: int = 6, refresh: bool = False):
    """
    Generate smart, business-relevant questions for a data source
    """
    try:
        # Check cache first
        if not refresh and source_id in smart_questions_cache:
            cache_entry = smart_questions_cache[source_id]
            logger.info(f"Returning cached smart questions for {source_id}")
            return JSONResponse(
                content={
                    "questions": cache_entry["questions"],
                    "domain": cache_entry["domain"],
                    "source_id": source_id,
                    "source_name": cache_entry["source_name"],
                    "generated_at": cache_entry["timestamp"],
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
        smart_questions_cache[source_id] = {
            "questions": questions,
            "domain": domain,
            "source_name": source["name"],
            "timestamp": datetime.now().isoformat()
        }
        
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
async def process_query(request: QueryRequest, session_id: str = "default"):
    """
    Execute natural language query against the active data source
    """
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
            logger.warning(f"No active source for session {session_id}, using demo hospital DB")
            result = hospital_sql_query_rag(
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
            
            logger.info(f"Querying {source['name']} ({db_type}) - {source['table_count']} tables")
            
            # Execute generic query with history
            result = generic_sql_query_rag(
                question=request.question,
                engine=engine,
                db_type=db_type,
                source_id=active_source_id,
                limit=request.limit,
                history=session_history  # Pass history
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
        
        return QueryResponse(
            success=True,
            query=result.get("query"),
            result=result.get("result"),
            chart=chart_config,
            chart_id=chart_id,
            reasoning=result.get("reasoning"),
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


@app.get("/saved-charts", response_model=List[SavedChart])
async def get_saved_charts(limit: Optional[int] = None):
    """Get all saved charts (optionally limited to recent N)"""
    if limit:
        return saved_charts[-limit:]
    return saved_charts


@app.post("/saved-charts", response_model=SavedChart)
async def create_saved_chart(chart: SavedChart):
    """Manually save a chart"""
    try:
        # Check if chart ID already exists
        for existing in saved_charts:
            if existing["chart_id"] == chart.chart_id:
                # Update existing
                existing.update(chart.model_dump())
                save_charts(saved_charts)
                return chart

        # Add new
        saved_charts.append(chart.model_dump())
        save_charts(saved_charts)
        logger.info(f"Manually saved chart: {chart.chart_id}")
        return chart
    except Exception as e:
        logger.error(f"Error saving chart: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/saved-charts/{chart_id}", response_model=SavedChart)
async def get_chart(chart_id: str):
    """Get a specific saved chart by ID"""
    for chart in saved_charts:
        if chart["chart_id"] == chart_id:
            return SavedChart(**chart)
    
    raise HTTPException(status_code=404, detail=f"Chart {chart_id} not found")


@app.delete("/saved-charts/{chart_id}")
async def delete_chart(chart_id: str):
    """Delete a saved chart"""
    global saved_charts
    
    for i, chart in enumerate(saved_charts):
        if chart["chart_id"] == chart_id:
            deleted_chart = saved_charts.pop(i)
            save_charts(saved_charts)
            return JSONResponse(
                content={"message": f"Chart '{deleted_chart['title']}' deleted successfully"},
                status_code=200
            )
    
    raise HTTPException(status_code=404, detail=f"Chart {chart_id} not found")


@app.delete("/saved-charts")
async def clear_all_charts():
    """Clear all saved charts"""
    global saved_charts
    count = len(saved_charts)
    saved_charts.clear()
    save_charts(saved_charts)
    
    return JSONResponse(
        content={"message": f"Cleared {count} saved charts"},
        status_code=200
    )


@app.post("/dashboard/create", response_model=DashboardResponse)
async def create_dashboard(request: DashboardCreateRequest):
    """Create a dashboard from saved charts"""
    try:
        # Select charts
        if request.include_all:
            selected_charts = saved_charts
        elif request.selected_chart_ids:
            selected_charts = [
                chart for chart in saved_charts 
                if chart["chart_id"] in request.selected_chart_ids
            ]
        else:
            raise HTTPException(status_code=400, detail="Must include_all or provide selected_chart_ids")
        
        if not selected_charts:
            raise HTTPException(status_code=400, detail="No charts available for dashboard")
        
        # Create dashboard
        dashboard_id = str(uuid4())
        dashboard = {
            "dashboard_id": dashboard_id,
            "name": request.dashboard_name,
            "description": request.description,
            "charts": selected_charts,
            "layout": request.layout,
            "created_at": datetime.now(),
            "total_charts": len(selected_charts)
        }
        
        # Save dashboard
        saved_dashboards.append(dashboard)
        save_dashboards(saved_dashboards)
        
        logger.info(f"Created dashboard: {dashboard_id} with {len(selected_charts)} charts")
        
        return DashboardResponse(**dashboard)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dashboard creation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Dashboard creation failed: {str(e)}")


@app.get("/dashboards", response_model=List[DashboardResponse])
async def get_dashboards():
    """Get all saved dashboards"""
    return [DashboardResponse(**dash) for dash in saved_dashboards]


@app.get("/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(dashboard_id: str):
    """Get a specific dashboard by ID"""
    for dashboard in saved_dashboards:
        if dashboard["dashboard_id"] == dashboard_id:
            return DashboardResponse(**dashboard)
    
    raise HTTPException(status_code=404, detail=f"Dashboard {dashboard_id} not found")


@app.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(dashboard_id: str):
    """Delete a dashboard"""
    global saved_dashboards
    
    for i, dashboard in enumerate(saved_dashboards):
        if dashboard["dashboard_id"] == dashboard_id:
            deleted_dashboard = saved_dashboards.pop(i)
            save_dashboards(saved_dashboards)
            return JSONResponse(
                content={"message": f"Dashboard '{deleted_dashboard['name']}' deleted successfully"},
                status_code=200
            )
    
    raise HTTPException(status_code=404, detail=f"Dashboard {dashboard_id} not found")


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
    """Startup event"""
    logger.info("🚀 Hospital Analytics API Started")
    logger.info(f"📊 Loaded {len(saved_charts)} saved charts")
    logger.info(f"📈 Loaded {len(saved_dashboards)} saved dashboards")
    logger.info(f"🗂️  ChromaDB Index: {schema_rag.collection.count()} tables indexed")
    logger.info(f"💾 Persist Directory: {schema_rag.persist_directory}")
    
    # Initialize demo mode
    initialize_demo_mode()



@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event"""
    logger.info("💾 Saving data before shutdown...")
    save_charts(saved_charts)
    save_dashboards(saved_dashboards)
    logger.info("👋 Hospital Analytics API Shutdown")


# ============================================
# RUN SERVER
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )