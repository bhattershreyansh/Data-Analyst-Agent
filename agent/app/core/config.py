import os
from dotenv import load_dotenv

# Find .env in current or parent directory
load_dotenv()
if not os.getenv("GROQ_API_KEY") and os.path.exists("../.env"):
    load_dotenv("../.env")

class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPEN_AI_API_KEY") or os.getenv("OPENAI_API_KEY")
    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY")
    PINECONE_INDEX_NAME: str = os.getenv("PINECONE_INDEX_NAME", "lumina-ai")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "your-super-secret-jwt-key-change-me")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    DEMO_SOURCE_ID: str = "demo-shopify-db"
    
    METADATA_DATABASE_URL: str = os.getenv("METADATA_DATABASE_URL") or os.getenv("DATABASE_URL", "sqlite:///./metadata.db")

settings = Settings()
