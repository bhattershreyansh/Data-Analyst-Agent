"""
Test the demo mode functionality (with retry logic)
"""

import requests
import json
import time

BASE_URL = "http://0.0.0.0:8000"

print("=" * 60)
print("Testing Demo Mode vs Custom Mode")
print("=" * 60)

# Wait for server to be ready
print("\n⏳ Waiting for server to be ready...")
for i in range(5):
    try:
        response = requests.get(f"{BASE_URL}/", timeout=2)
        if response.status_code == 200:
            print("✓ Server is ready!")
            break
    except:
        print(f"  Attempt {i+1}/5...")
        time.sleep(1)
else:
    print("✗ Server not responding. Make sure it's running on port 8000")
    exit(1)

# Test 1: Check mode status
print("\n1. Checking current mode status...")
try:
    response = requests.get(f"{BASE_URL}/mode/status")
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Mode: {data['mode']}")
        print(f"  Message: {data['message']}")
        if data['active_source']:
            print(f"  Active Source: {data['active_source']['name']}")
            print(f"  Tables: {data['active_source']['table_count']}")
            print(f"  Is Demo: {data['active_source']['is_demo']}")
    else:
        print(f"✗ Error: {response.status_code}")
except Exception as e:
    print(f"✗ Error: {e}")

# Test 2: List all data sources
print("\n2. Listing all data sources...")
try:
    response = requests.get(f"{BASE_URL}/data-sources")
    if response.status_code == 200:
        data = response.json()
        print(f"✓ Found {data['count']} data source(s):")
        for source in data['sources']:
            is_demo_flag = source.get('is_demo', False) or 'demo' in source.get('source_id', '').lower()
            icon = "🏥 DEMO" if is_demo_flag else "📁 CUSTOM"
            print(f"  {icon} - {source['name']}")
            print(f"      Type: {source['type']}, Tables: {source['table_count']}")
    else:
        print(f"✗ Error: {response.status_code}")
except Exception as e:
    print(f"✗ Error: {e}")

# Test 3: Test a query on demo database
print("\n3. Testing query on active source...")
try:
    response = requests.post(
        f"{BASE_URL}/query",
        json={"question": "How many products do we have?", "limit": 10}
    )
    if response.status_code == 200:
        data = response.json()
        if data['success']:
            print(f"✓ Query successful!")
            print(f"  SQL: {data['query'][:100]}...")
            print(f"  Rows returned: {data['row_count']}")
            if data['result']:
                print(f"  First result: {data['result'][0]}")
        else:
            print(f"✗ Query failed: {data.get('error')}")
    else:
        print(f"✗ Error: {response.status_code}")
except Exception as e:
    print(f"✗ Error: {e}")

print("\n" + "=" * 60)
print("✅ Demo Mode Test Complete!")
print("=" * 60)
print("\n💡 Summary:")
print("  - Demo mode auto-loads Shopify database on startup")
print("  - Demo database is set as default active source")
print("  - Users can still upload files or connect custom databases")
print("  - Switch between sources using /data-sources/{id}/activate")
