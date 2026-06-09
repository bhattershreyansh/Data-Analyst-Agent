import sys
import os
sys.path.append(os.path.abspath("agent"))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal, init_db, engine
from sqlalchemy import text

def test_scanner_route():
    print("=" * 60)
    print("🧪 Running Router /scan-anomalies Test via TestClient")
    print("=" * 60)
    
    # 1. Clean database records
    init_db()
    db = SessionLocal()
    db.execute(text("DELETE FROM anomaly_history"))
    db.execute(text("DELETE FROM data_sources WHERE source_id LIKE 'demo-shopify%'"))
    db.execute(text("DELETE FROM users WHERE user_id = 'test-user-id'"))
    db.commit()
    db.close()
    
    # 2. Boot TestClient
    client = TestClient(app)
    
    # 3. Call status endpoint to auto-provision user's isolated SQLite database
    print("\n1. Auto-provisioning Shopify DB via /mode/status...")
    headers = {"Authorization": "Bearer mock-token"}
    response = client.get("/mode/status", headers=headers)
    assert response.status_code == 200, f"Status failed: {response.text}"
    status_data = response.json()
    source_id = status_data["active_source"]["source_id"]
    print(f"✓ Provisioned source_id: {source_id}")
    
    # 4. Trigger Scan anomalies route
    print(f"\n2. Calling GET /data-sources/{source_id}/scan-anomalies...")
    scan_response = client.get(f"/data-sources/{source_id}/scan-anomalies", headers=headers)
    assert scan_response.status_code == 200, f"Scan failed: {scan_response.text}"
    
    scan_data = scan_response.json()
    print("✓ Response status: Success!")
    print(f"✓ Found {len(scan_data['anomalies'])} anomalies:")
    for a in scan_data["anomalies"]:
        print(f"  - [{a['state']}] {a['metric']} (Impact: ${a['financial_impact_dollars']}): {a['description']}")
        
    print("\n" + "=" * 60)
    print("✅ Endpoint /scan-anomalies Router test complete!")
    print("=" * 60)

if __name__ == "__main__":
    test_scanner_route()
