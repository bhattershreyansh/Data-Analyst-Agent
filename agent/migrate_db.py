import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DATABASE_URL = os.getenv("METADATA_DATABASE_URL") or os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("No DATABASE_URL found in environment variables.")
    exit(1)

print("Connecting to database...")
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        print("Checking if users table exists and contains hashed_password...")
        # Check if column exists
        res = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='hashed_password';
        """)).fetchone()
        
        if res:
            print("Column 'hashed_password' already exists in 'users' table.")
        else:
            print("Adding 'hashed_password' column to 'users' table...")
            conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR(255);"))
            conn.commit()
            print("Migration completed successfully!")
except Exception as e:
    print(f"Error executing migration: {e}")
