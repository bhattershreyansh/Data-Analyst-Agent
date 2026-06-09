import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.db_models import Base

# Support both METADATA_DATABASE_URL and DATABASE_URL env var names
DATABASE_URL = os.getenv("METADATA_DATABASE_URL") or os.getenv("DATABASE_URL", "sqlite:///./metadata.db")

# For sqlite database path correction if we are in app folder
if DATABASE_URL.startswith("sqlite:///./") and not os.path.exists("metadata.db"):
    # If metadata.db is in the parent directory (agent/metadata.db), redirect to it
    if os.path.exists("../metadata.db"):
        DATABASE_URL = "sqlite:///../metadata.db"

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency for routers to get DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
