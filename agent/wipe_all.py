import os
import shutil
import dotenv
from sqlalchemy import create_engine, text

# Load env
dotenv.load_dotenv()
db_url = os.getenv("DATABASE_URL")

if not db_url:
    print("❌ No DATABASE_URL found in env.")
    exit(1)

print(f"🧹 Connecting to metadata database to clean rows...")
engine = create_engine(db_url)

tables = ["saved_charts", "dashboards", "data_sources", "users"]

with engine.begin() as conn:
    # Disable constraints momentarily if needed or delete in order of dependencies
    # saved_charts, dashboards, data_sources depend on users.
    for table in tables:
        try:
            conn.execute(text(f"DELETE FROM {table}"))
            print(f"  ✓ Cleaned table: {table}")
        except Exception as e:
            print(f"  ✗ Failed to clean {table}: {e}")

# Clean up local data folder
data_dir = "data"
if os.path.exists(data_dir):
    print("🧹 Cleaning local data directory...")
    for filename in os.listdir(data_dir):
        file_path = os.path.join(data_dir, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
            print(f"  ✓ Deleted local asset: {filename}")
        except Exception as e:
            print(f"  Failed to delete {file_path}: {e}")
else:
    os.makedirs(data_dir, exist_ok=True)

print("✅ Data wipe completed successfully!")
