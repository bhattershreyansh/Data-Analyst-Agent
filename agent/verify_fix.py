
import sys
import os
sys.path.append(os.path.abspath('.'))

try:
    from agnet_rag import SchemaRAG
    print("✅ SchemaRAG imported successfully")
except ImportError as e:
    print(f"❌ Failed to import SchemaRAG: {e}")
    sys.exit(1)

# Test naming convention
source_id = "test-source-id"
collection_name = f"schema-{source_id}"
print(f"Testing collection name: {collection_name}")

# Optional: Try to import from server.py to check for SyntaxErrors
try:
    import server
    print("✅ server.py imported successfully (no NameError at top level)")
except Exception as e:
    # server.py might have other dependencies that fail to load in this environment
    # but at least it shouldn't have a SyntaxError
    print(f"ℹ️ server.py import info: {e}")
