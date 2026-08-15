from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
from datetime import datetime

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500, description="Natural language question")
    limit: Optional[int] = Field(default=20, ge=1, le=100, description="Maximum rows to return")
    chart_type: Optional[str] = Field(default=None, description="Override chart type")
    generate_insights: Optional[bool] = Field(default=False, description="Run Insight Engine")
    
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
    thought_logs: Optional[List[Dict]] = None
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
    insight: Optional[str] = None

    class Config:
        from_attributes = True


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
    schema_index_count: int  # Show index size


class SchemaInfo(BaseModel):
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
    source_id: str
    name: str
    type: str  # 'database' or 'file'
    status: str
    table_count: int
    tables: List[str]
    created_at: str

class AnomalyItem(BaseModel):
    anomaly_key: str
    metric: str
    severity: str
    state: str
    duration: str
    description: str
    financial_impact_dollars: int
    suggested_query: str

class AnomalyScanResponse(BaseModel):
    success: bool
    anomalies: List[AnomalyItem]
    timestamp: datetime = Field(default_factory=datetime.now)
