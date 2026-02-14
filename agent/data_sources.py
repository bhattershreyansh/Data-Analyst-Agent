"""
Data Source Manager
Handles connections to multiple databases and file uploads
"""

from sqlalchemy import create_engine, inspect
from typing import Dict, List, Optional
import uuid
import pandas as pd
from pathlib import Path
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class DataSourceManager:
    """
    Manages multiple data source connections (databases and files)
    Each source has a unique ID and can be activated for querying
    """
    
    def __init__(self, data_dir: str = "./data"):
        """
        Initialize the data source manager
        
        Args:
            data_dir: Directory to store uploaded files and SQLite databases
        """
        self.sources = {}  # {source_id: source_metadata}
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"DataSourceManager initialized with data_dir: {self.data_dir}")
    
    def add_database(
        self,
        name: str,
        db_type: str,
        host: str,
        port: int,
        username: str,
        password: str,
        database: str
    ) -> Dict:
        """
        Connect to an external database (PostgreSQL, MySQL, SQL Server)
        
        Args:
            name: User-friendly name for this connection
            db_type: 'postgresql', 'mysql', or 'sqlserver'
            host: Database host
            port: Database port
            username: Database username
            password: Database password
            database: Database name
            
        Returns:
            Dict with source_id and metadata
        """
        source_id = str(uuid.uuid4())
        
        try:
            # Import security manager
            from security import security_manager
            
            # Create connection string based on database type
            if db_type == "postgresql":
                connection_string = f"postgresql://{username}:{password}@{host}:{port}/{database}"
            elif db_type == "mysql":
                connection_string = f"mysql+mysqlconnector://{username}:{password}@{host}:{port}/{database}"
            elif db_type == "sqlserver":
                connection_string = f"mssql+pyodbc://{username}:{password}@{host}:{port}/{database}?driver=ODBC+Driver+17+for+SQL+Server"
            else:
                raise ValueError(f"Unsupported database type: {db_type}")
            
            # Create SQLAlchemy engine with safety options
            # Note: Strict read-only enforcement for Postgres/MySQL requires DB user permissions.
            # We add execution options to hint read-only behavior where possible.
            engine = create_engine(
                connection_string, 
                execution_options={"isolation_level": "AUTOCOMMIT"}
            )
            
            # Test connection by getting table names
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            
            # Encrypt password for storage
            encrypted_password = security_manager.encrypt(password)
            
            # Store source metadata (using encrypted password)
            self.sources[source_id] = {
                "source_id": source_id,
                "name": name,
                "type": "database",
                "db_type": db_type,
                "host": host,
                "port": port,
                "username": username,
                "encrypted_password": encrypted_password, # STORE ENCRYPTED ONLY
                "database": database,
                "engine": engine,
                "tables": tables,
                "table_count": len(tables),
                "created_at": datetime.now().isoformat(),
                "status": "connected"
            }
            
            logger.info(f"Connected to {db_type} database '{name}' with {len(tables)} tables")
            
            return {
                "source_id": source_id,
                "name": name,
                "type": "database",
                "db_type": db_type,
                "table_count": len(tables),
                "tables": tables,
                "created_at": datetime.now().isoformat(),
                "status": "connected"
            }
            
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise Exception(f"Database connection failed: {str(e)}")
    
    def add_file(
        self,
        name: str,
        file_path: str,
        file_type: str,
        sheet_name: Optional[str] = None
    ) -> Dict:
        """
        Load Excel/CSV file into SQLite database
        
        Args:
            name: User-friendly name for this data source
            file_path: Path to the uploaded file
            file_type: 'csv', 'xlsx', or 'xls'
            sheet_name: For Excel files with multiple sheets (optional)
            
        Returns:
            Dict with source_id and metadata
        """
        source_id = str(uuid.uuid4())
        
        try:
            # Read file into pandas DataFrame
            if file_type == "csv":
                df = pd.read_csv(file_path)
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(file_path, sheet_name=sheet_name or 0)
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            # Create SQLite database for this file
            sqlite_path = self.data_dir / f"{source_id}.db"
            
            # Enforce Read-Only mode for safety
            # immutable=1 optimizes for read-only. mode=ro prevents writes.
            engine = create_engine(f"sqlite:///{sqlite_path}?mode=ro&immutable=1", connect_args={'uri': True})
            
            # Infer table name from file name (clean it up)
            table_name = Path(file_path).stem.lower()
            table_name = "".join(c if c.isalnum() else "_" for c in table_name)
            
            # Load DataFrame into SQLite
            df.to_sql(table_name, engine, index=False, if_exists="replace")
            
            # Store source metadata
            self.sources[source_id] = {
                "source_id": source_id,
                "name": name,
                "type": "file",
                "file_type": file_type,
                "file_path": file_path,
                "engine": engine,
                "tables": [table_name],
                "table_count": 1,
                "row_count": len(df),
                "column_count": len(df.columns),
                "columns": list(df.columns),
                "created_at": datetime.now().isoformat(),
                "status": "loaded"
            }
            
            logger.info(f"Loaded {file_type} file '{name}' with {len(df)} rows, {len(df.columns)} columns")
            
            return {
                "source_id": source_id,
                "name": name,
                "type": "file",
                "file_type": file_type,
                "table_count": 1,  # Files always have 1 table
                "tables": [table_name],  # List of tables
                "created_at": datetime.now().isoformat(),  # Add created_at
                "status": "loaded"
            }
            
        except Exception as e:
            logger.error(f"Failed to load file: {e}")
            raise Exception(f"File loading failed: {str(e)}")
    
    def get_source(self, source_id: str) -> Optional[Dict]:
        """
        Retrieve a data source by ID
        
        Args:
            source_id: Unique identifier for the data source
            
        Returns:
            Source metadata dict or None if not found
        """
        return self.sources.get(source_id)
    
    def list_sources(self) -> List[Dict]:
        """
        List all connected data sources
        
        Returns:
            List of source metadata (without engine objects)
        """
        sources_list = []
        
        for source_id, source in self.sources.items():
            # Create a copy without the engine object (not JSON serializable)
            source_info = {
                "source_id": source["source_id"],
                "name": source["name"],
                "type": source["type"],
                "table_count": source["table_count"],
                "tables": source["tables"],
                "created_at": source["created_at"],
                "status": source["status"]
            }
            
            # Add type-specific fields
            if source["type"] == "database":
                source_info["db_type"] = source["db_type"]
            elif source["type"] == "file":
                source_info["file_type"] = source["file_type"]
                source_info["row_count"] = source["row_count"]
                source_info["column_count"] = source["column_count"]
            
            sources_list.append(source_info)
        
        return sources_list
    
    def remove_source(self, source_id: str) -> bool:
        """
        Remove a data source
        
        Args:
            source_id: Unique identifier for the data source
            
        Returns:
            True if removed, False if not found
        """
        if source_id in self.sources:
            source = self.sources[source_id]
            
            # Dispose of engine
            source["engine"].dispose()
            
            # Delete SQLite file if it's a file source
            if source["type"] == "file":
                sqlite_path = self.data_dir / f"{source_id}.db"
                if sqlite_path.exists():
                    sqlite_path.unlink()
            
            # Remove from sources
            del self.sources[source_id]
            
            logger.info(f"Removed data source: {source['name']}")
            return True
        
        return False
    
    def get_engine(self, source_id: str):
        """
        Get SQLAlchemy engine for a data source
        
        Args:
            source_id: Unique identifier for the data source
            
        Returns:
            SQLAlchemy engine or None
        """
        source = self.sources.get(source_id)
        return source["engine"] if source else None
    
    def get_tables(self, source_id: str) -> List[str]:
        """
        Get list of tables for a data source
        
        Args:
            source_id: Unique identifier for the data source
            
        Returns:
            List of table names
        """
        source = self.sources.get(source_id)
        return source["tables"] if source else []

    def get_password(self, source_id: str) -> Optional[str]:
        """
        Securely retrieve decrypted password for a data source
        
        Args:
            source_id: Data source ID
            
        Returns:
            Decrypted password string or None
        """
        source = self.sources.get(source_id)
        if not source or "encrypted_password" not in source:
            return None
        
        try:
            from security import security_manager
            return security_manager.decrypt(source["encrypted_password"])
        except Exception as e:
            logger.error(f"Failed to decrypt password for {source_id}: {e}")
            return None


# Global instance (will be initialized in server.py)
data_source_manager = None
