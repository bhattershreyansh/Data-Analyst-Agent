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
from app.core.security import security_manager

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
        database: str,
        source_id: Optional[str] = None
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
            source_id: Optional existing ID to reuse
            
        Returns:
            Dict with source_id and metadata
        """
        if not source_id:
            source_id = str(uuid.uuid4())
        
        try:
            # Create connection string based on database type
            if db_type == "postgresql":
                connection_string = f"postgresql://{username}:{password}@{host}:{port}/{database}"
                if "neon.tech" in host.lower():
                    connection_string += "?sslmode=require&connect_timeout=30"
            elif db_type == "mysql":
                connection_string = f"mysql+mysqlconnector://{username}:{password}@{host}:{port}/{database}"
            elif db_type == "sqlserver":
                connection_string = f"mssql+pyodbc://{username}:{password}@{host}:{port}/{database}?driver=ODBC+Driver+17+for+SQL+Server"
            else:
                raise ValueError(f"Unsupported database type: {db_type}")
            
            # Create SQLAlchemy engine with safety options
            engine_kwargs = {"execution_options": {"isolation_level": "AUTOCOMMIT"}}
            if db_type in ("postgresql", "mysql"):
                engine_kwargs.update({
                    "pool_pre_ping": True,
                    "pool_recycle": 300,
                    "pool_timeout": 60
                })
                
            engine = create_engine(connection_string, **engine_kwargs)
            
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
        sheet_name: Optional[str] = None,
        source_id: Optional[str] = None
    ) -> Dict:
        """
        Load Excel/CSV file into SQLite database.
        For Excel files, ALL sheets are loaded as separate tables.

        Args:
            name: User-friendly name for this data source
            file_path: Path to the uploaded file
            file_type: 'csv', 'xlsx', or 'xls'
            sheet_name: (deprecated) For Excel, all sheets are now loaded
            source_id: Optional existing ID to reuse

        Returns:
            Dict with source_id and metadata
        """
        if not source_id:
            source_id = str(uuid.uuid4())

        try:
            # Create SQLite database for this file
            sqlite_path = self.data_dir / f"{source_id}.db"
            write_engine = create_engine(f"sqlite:///{sqlite_path}")

            sheets: Dict[str, pd.DataFrame] = {}

            if file_type == "csv":
                df = pd.read_csv(file_path)
                table_name = Path(file_path).stem.lower()
                table_name = "".join(c if c.isalnum() else "_" for c in table_name)
                sheets[table_name] = df

            elif file_type in ["xlsx", "xls"]:
                all_sheets = pd.read_excel(file_path, sheet_name=None)  # Load ALL sheets
                for raw_sheet, df in all_sheets.items():
                    t = raw_sheet.lower()
                    t = "".join(c if c.isalnum() else "_" for c in t)
                    sheets[t] = df
                logger.info(f"Excel file '{name}' has {len(sheets)} sheet(s): {list(sheets.keys())}")
            else:
                raise ValueError(f"Unsupported file type: {file_type}")

            tables: List[str] = []
            total_rows = 0
            all_previews: Dict[str, list] = {}
            all_stats: Dict[str, dict] = {}

            for tbl, df in sheets.items():
                df.columns = [
                    "".join(c if c.isalnum() else "_" for c in str(col))
                    for col in df.columns
                ]
                df.to_sql(tbl, write_engine, index=False, if_exists="replace")
                tables.append(tbl)
                total_rows += len(df)

                all_previews[tbl] = df.head(5).to_dict(orient="records")

                stats: Dict[str, dict] = {}
                for col in df.columns:
                    col_info: dict = {"dtype": str(df[col].dtype)}
                    if pd.api.types.is_numeric_dtype(df[col]):
                        col_info.update({
                            "min": float(df[col].min()) if not df[col].isnull().all() else None,
                            "max": float(df[col].max()) if not df[col].isnull().all() else None,
                            "mean": round(float(df[col].mean()), 2) if not df[col].isnull().all() else None,
                        })
                    else:
                        unique_vals = df[col].dropna().unique()
                        if len(unique_vals) <= 50:
                            col_info["unique_values"] = [str(v) for v in unique_vals[:50]]
                        col_info["unique_count"] = int(len(unique_vals))
                    stats[col] = col_info
                all_stats[tbl] = stats

            write_engine.dispose()

            engine = create_engine(f"sqlite:///{sqlite_path}")

            self.sources[source_id] = {
                "source_id": source_id,
                "name": name,
                "type": "file",
                "file_type": file_type,
                "file_path": file_path,
                "engine": engine,
                "tables": tables,
                "table_count": len(tables),
                "row_count": total_rows,
                "column_count": sum(len(df.columns) for df in sheets.values()),
                "previews": all_previews,
                "column_stats": all_stats,
                "created_at": datetime.now().isoformat(),
                "status": "loaded"
            }

            logger.info(
                f"Loaded {file_type} file '{name}' — "
                f"{len(tables)} table(s), {total_rows} total rows"
            )

            return {
                "source_id": source_id,
                "name": name,
                "type": "file",
                "file_type": file_type,
                "table_count": len(tables),
                "tables": tables,
                "row_count": total_rows,
                "created_at": datetime.now().isoformat(),
                "status": "loaded"
            }

        except Exception as e:
            logger.error(f"Failed to load file: {e}")
            raise Exception(f"File loading failed: {str(e)}")

    def get_source(self, source_id: str) -> Optional[Dict]:
        """Retrieve a data source by ID"""
        return self.sources.get(source_id)
    
    def list_sources(self) -> List[Dict]:
        """List all connected data sources"""
        sources_list = []
        
        for source_id, source in self.sources.items():
            source_info = {
                "source_id": source["source_id"],
                "name": source["name"],
                "type": source["type"],
                "table_count": source["table_count"],
                "tables": source["tables"],
                "created_at": source["created_at"],
                "status": source["status"]
            }
            
            if source["type"] == "database":
                source_info["db_type"] = source["db_type"]
            elif source["type"] == "file":
                source_info["file_type"] = source["file_type"]
                source_info["row_count"] = source["row_count"]
                source_info["column_count"] = source["column_count"]
            
            sources_list.append(source_info)
        
        return sources_list
    
    def remove_source(self, source_id: str) -> bool:
        """Remove a data source"""
        if source_id in self.sources:
            source = self.sources[source_id]
            source["engine"].dispose()
            
            if source["type"] == "file":
                sqlite_path = self.data_dir / f"{source_id}.db"
                if sqlite_path.exists():
                    sqlite_path.unlink()
            
            del self.sources[source_id]
            logger.info(f"Removed data source: {source['name']}")
            return True
        return False
    
    def get_engine(self, source_id: str):
        """Get SQLAlchemy engine for a data source"""
        source = self.sources.get(source_id)
        return source["engine"] if source else None
    
    def get_tables(self, source_id: str) -> List[str]:
        """Get list of tables for a data source"""
        source = self.sources.get(source_id)
        return source["tables"] if source else []

    def get_password(self, source_id: str) -> Optional[str]:
        """Securely retrieve decrypted password for a data source"""
        source = self.sources.get(source_id)
        if not source or "encrypted_password" not in source:
            return None
        
        try:
            return security_manager.decrypt(source["encrypted_password"])
        except Exception as e:
            logger.error(f"Failed to decrypt password for {source_id}: {e}")
            return None


# Global instance
data_source_manager = DataSourceManager()
active_sources = {}
