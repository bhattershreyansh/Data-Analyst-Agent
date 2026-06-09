import sys
import os
sys.path.append(os.path.abspath("agent"))

from sqlalchemy import create_engine, text
from app.core.database import SessionLocal, init_db, engine as metadata_engine
from app.core.shopify_seeder import seed_shopify_tables
from app.services.anomaly_scanner import scan_anomalies

def test_anomaly_scanner():
    print("=" * 60)
    print("🧪 Running Anomaly Scanner & State Memory Test")
    print("=" * 60)
    
    # 1. Initialize metadata database tables (users, anomaly_history)
    init_db()
    
    # Create or clean test user
    db = SessionLocal()
    db.execute(text("DELETE FROM anomaly_history"))
    db.execute(text("DELETE FROM users WHERE user_id = 'test-merchant-1'"))
    db.execute(text("INSERT OR IGNORE INTO users (user_id, email) VALUES ('test-merchant-1', 'merchant@example.com')"))
    db.commit()

    # 2. Setup user's private Shopify SQLite DB (in memory for speed)
    store_engine = create_engine("sqlite:///:memory:")
    seed_shopify_tables(store_engine)
    
    # Force trigger inventory stockout: Product 107 inventory = 0
    # Force trigger refund spike: Add order items for product 107 to hit sold count >= 3
    with store_engine.begin() as conn:
        # Product 107 stockout
        conn.execute(text("UPDATE shopify_products SET inventory_quantity = 0 WHERE product_id = 107"))
        # Product 107 refund spike: make total_sold = 4, total_refunded = 2
        conn.execute(text("INSERT INTO shopify_orders (order_id, customer_id, created_at, subtotal_price, total_tax, total_price, financial_status, fulfillment_status) VALUES (2001, 1, date('now', '-2 days'), 299.00, 24.00, 323.00, 'refunded', 'fulfilled')"))
        conn.execute(text("INSERT INTO shopify_order_items (item_id, order_id, product_id, quantity, price) VALUES (901, 2001, 107, 1, 299.00)"))
        conn.execute(text("INSERT INTO shopify_refunds (refund_id, order_id, created_at, amount) VALUES (99, 2001, date('now', '-2 days'), 323.00)"))
        
        conn.execute(text("INSERT INTO shopify_orders (order_id, customer_id, created_at, subtotal_price, total_tax, total_price, financial_status, fulfillment_status) VALUES (2002, 2, date('now', '-1 days'), 299.00, 24.00, 323.00, 'paid', 'fulfilled')"))
        conn.execute(text("INSERT INTO shopify_order_items (item_id, order_id, product_id, quantity, price) VALUES (902, 2002, 107, 1, 299.00)"))
    
    # 3. First Scan (Expect NEW anomalies to be detected)
    print("\n📡 Running FIRST scan...")
    anomalies = scan_anomalies(
        engine=store_engine,
        metadata_db=db,
        user_id="test-merchant-1",
        source_id="demo-store-1"
    )
    
    print(f"✓ Detected {len(anomalies)} anomalies:")
    for a in anomalies:
        print(f"  - [{a['state']}] {a['metric']} (Impact: ${a['financial_impact_dollars']}): {a['description']}")

    # 4. Second Scan (Expect ONGOING state with duration escalation)
    print("\n📡 Running SECOND scan (no data changes)...")
    anomalies2 = scan_anomalies(
        engine=store_engine,
        metadata_db=db,
        user_id="test-merchant-1",
        source_id="demo-store-1"
    )
    
    print(f"✓ Detected {len(anomalies2)} anomalies:")
    for a in anomalies2:
        print(f"  - [{a['state']}] {a['metric']} (Impact: ${a['financial_impact_dollars']}): {a['description']}")

    # 5. Fix one anomaly (Restock a low inventory item and resolve refund spike)
    print("\n🔧 Simulating inventory restock on product 107 and cleaning refunds...")
    with store_engine.begin() as conn:
        conn.execute(text("UPDATE shopify_products SET inventory_quantity = 500 WHERE product_id = 107"))
        # Delete extra refunded orders to resolve refund rate spike
        conn.execute(text("DELETE FROM shopify_refunds WHERE refund_id = 99"))
        conn.execute(text("UPDATE shopify_orders SET financial_status = 'paid' WHERE order_id = 2001"))
        
    # 6. Third Scan (Expect RESOLVED state for product 107, others ongoing)
    print("\n📡 Running THIRD scan after fix...")
    anomalies3 = scan_anomalies(
        engine=store_engine,
        metadata_db=db,
        user_id="test-merchant-1",
        source_id="demo-store-1"
    )
    
    print(f"✓ Detected {len(anomalies3)} anomalies:")
    for a in anomalies3:
        print(f"  - [{a['state']}] {a['metric']} (Impact: ${a['financial_impact_dollars']}): {a['description']}")

    db.close()
    print("\n" + "=" * 60)
    print("✅ Anomaly Scanner Test Completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    test_anomaly_scanner()
