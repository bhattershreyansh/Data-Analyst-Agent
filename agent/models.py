from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy import create_engine
from datetime import datetime
import os

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    user_id = Column(String(255), primary_key=True)
    email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    
    charts = relationship("SavedChart", back_populates="user")
    dashboards = relationship("Dashboard", back_populates="user")
    data_sources = relationship("DataSource", back_populates="user")

class SavedChart(Base):
    __tablename__ = "saved_charts"
    
    chart_id = Column(String(255), primary_key=True)
    user_id = Column(String(255), ForeignKey("users.user_id"), nullable=False)
    question = Column(String(1000), nullable=False)
    chart_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    data = Column(JSON, nullable=False)
    query = Column(String(2000), nullable=True)
    x_axis = Column(String(100), nullable=True)
    y_axis = Column(String(100), nullable=True)
    timestamp = Column(DateTime, default=datetime.now)
    
    user = relationship("User", back_populates="charts")

class Dashboard(Base):
    __tablename__ = "dashboards"
    
    dashboard_id = Column(String(255), primary_key=True)
    user_id = Column(String(255), ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    layout = Column(String(50), default="grid")
    charts = Column(JSON, nullable=False)  # List of chart IDs or full chart objects for demo simplicity
    created_at = Column(DateTime, default=datetime.now)
    total_charts = Column(Integer, default=0)
    
    user = relationship("User", back_populates="dashboards")

class DataSource(Base):
    __tablename__ = "data_sources"
    
    source_id = Column(String(255), primary_key=True)
    user_id = Column(String(255), ForeignKey("users.user_id"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # 'file' or 'database'
    db_type = Column(String(50), nullable=True)
    connection_info = Column(JSON, nullable=True)  # Encrypted connection details
    status = Column(String(50), default="disconnected")
    table_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)
    
    user = relationship("User", back_populates="data_sources")

# Database setup
# Support both METADATA_DATABASE_URL and DATABASE_URL env var names
DATABASE_URL = os.getenv("METADATA_DATABASE_URL") or os.getenv("DATABASE_URL", "sqlite:///./metadata.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
