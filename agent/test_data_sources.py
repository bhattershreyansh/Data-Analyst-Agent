"""
Quick test script to verify data source endpoints work
"""

import sys
sys.path.insert(0, 'd:/DataAnalyst/agent')

from data_sources import DataSourceManager
import pandas as pd
from pathlib import Path

print("=" * 60)
print("Testing DataSourceManager")
print("=" * 60)

# Initialize manager
manager = DataSourceManager()
print("✓ DataSourceManager initialized")

# Test 1: Create a sample CSV file
print("\n1. Creating sample CSV file...")
sample_data = pd.DataFrame({
    'product': ['Laptop', 'Mouse', 'Keyboard', 'Monitor'],
    'price': [1000, 25, 75, 300],
    'quantity': [10, 50, 30, 15]
})

test_dir = Path('./test_data')
test_dir.mkdir(exist_ok=True)
csv_path = test_dir / 'sample_products.csv'
sample_data.to_csv(csv_path, index=False)
print(f"✓ Created sample CSV: {csv_path}")

# Test 2: Add file to manager
print("\n2. Adding CSV file to DataSourceManager...")
try:
    result = manager.add_file(
        name="Sample Products",
        file_path=str(csv_path),
        file_type="csv"
    )
    print(f"✓ File added successfully!")
    print(f"   Source ID: {result['source_id']}")
    print(f"   Table name: {result['table_name']}")
    print(f"   Rows: {result['row_count']}, Columns: {result['column_count']}")
except Exception as e:
    print(f"✗ Error: {e}")
    sys.exit(1)

# Test 3: List sources
print("\n3. Listing all data sources...")
sources = manager.list_sources()
print(f"✓ Found {len(sources)} data source(s)")
for source in sources:
    print(f"   - {source['name']} ({source['type']})")

# Test 4: Query the data
print("\n4. Querying the loaded data...")
source_id = result['source_id']
engine = manager.get_engine(source_id)
query_result = pd.read_sql("SELECT * FROM sample_products LIMIT 3", engine)
print("✓ Query successful! First 3 rows:")
print(query_result)

# Test 5: Remove source
print("\n5. Cleaning up...")
manager.remove_source(source_id)
print("✓ Data source removed")

print("\n" + "=" * 60)
print("All tests passed! ✓")
print("=" * 60)
