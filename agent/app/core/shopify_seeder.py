import logging
from datetime import datetime, timedelta
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)

def seed_shopify_tables(engine):
    """Create and seed Shopify-specific e-commerce tables if they do not exist."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    if "shopify_orders" in existing_tables:
        logger.info("Shopify demo tables already exist. Skipping seeding.")
        return

    logger.info("Initializing Shopify e-commerce demo tables...")
    
    # We use raw DDL matching PostgreSQL syntax
    queries = [
        # 1. Shopify Products
        """
        CREATE TABLE IF NOT EXISTS shopify_products (
            product_id INT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            vendor VARCHAR(255),
            product_type VARCHAR(255),
            price DECIMAL(10, 2) NOT NULL,
            inventory_quantity INT DEFAULT 0,
            created_at DATE NOT NULL
        )
        """,
        # 2. Shopify Customers
        """
        CREATE TABLE IF NOT EXISTS shopify_customers (
            customer_id INT PRIMARY KEY,
            first_name VARCHAR(100),
            last_name VARCHAR(100),
            email VARCHAR(255) UNIQUE,
            city VARCHAR(100),
            province VARCHAR(100),
            country VARCHAR(100),
            created_at DATE NOT NULL
        )
        """,
        # 3. Shopify Orders
        """
        CREATE TABLE IF NOT EXISTS shopify_orders (
            order_id INT PRIMARY KEY,
            customer_id INT REFERENCES shopify_customers(customer_id),
            created_at TIMESTAMP NOT NULL,
            subtotal_price DECIMAL(10, 2) NOT NULL,
            total_tax DECIMAL(10, 2) DEFAULT 0.00,
            total_discounts DECIMAL(10, 2) DEFAULT 0.00,
            total_price DECIMAL(10, 2) NOT NULL,
            financial_status VARCHAR(50) NOT NULL,
            fulfillment_status VARCHAR(50) NOT NULL,
            referral_source VARCHAR(100)
        )
        """,
        # 4. Shopify Order Items
        """
        CREATE TABLE IF NOT EXISTS shopify_order_items (
            item_id INT PRIMARY KEY,
            order_id INT REFERENCES shopify_orders(order_id) ON DELETE CASCADE,
            product_id INT REFERENCES shopify_products(product_id),
            quantity INT NOT NULL,
            price DECIMAL(10, 2) NOT NULL
        )
        """,
        # 5. Shopify Refunds
        """
        CREATE TABLE IF NOT EXISTS shopify_refunds (
            refund_id INT PRIMARY KEY,
            order_id INT REFERENCES shopify_orders(order_id),
            created_at TIMESTAMP NOT NULL,
            amount DECIMAL(10, 2) NOT NULL
        )
        """,
        # 6. Shopify Discounts
        """
        CREATE TABLE IF NOT EXISTS shopify_discounts (
            discount_id INT PRIMARY KEY,
            code VARCHAR(50) UNIQUE NOT NULL,
            type VARCHAR(50) NOT NULL,
            value DECIMAL(10, 2) NOT NULL
        )
        """,
        # 7. Indexes
        "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON shopify_orders(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON shopify_order_items(product_id)",
        "CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON shopify_refunds(order_id)"
    ]
    
    with engine.begin() as conn:
        for q in queries:
            conn.execute(text(q))
        logger.info("Shopify schema tables created successfully.")
        
        # Now seed products
        conn.execute(text("DELETE FROM shopify_order_items"))
        conn.execute(text("DELETE FROM shopify_refunds"))
        conn.execute(text("DELETE FROM shopify_orders"))
        conn.execute(text("DELETE FROM shopify_products"))
        conn.execute(text("DELETE FROM shopify_customers"))
        conn.execute(text("DELETE FROM shopify_discounts"))
        
        # Insert Discounts
        conn.execute(text("""
            INSERT INTO shopify_discounts (discount_id, code, type, value) VALUES
            (1, 'WELCOME10', 'fixed_amount', 10.00),
            (2, 'SAVE40', 'percentage', 40.00),
            (3, 'FREESHIP', 'free_shipping', 0.00)
        """))
        
        # Insert Products
        today = datetime.now().date()
        products = [
            (101, "Shopify Tee", "Shopify", "Apparel", 25.00, 150, today - timedelta(days=100)),
            (102, "Shopify Hoodie", "Shopify", "Apparel", 50.00, 80, today - timedelta(days=90)),
            (103, "Logo Mug", "Shopify", "Homegoods", 15.00, 200, today - timedelta(days=120)),
            (104, "Leather Tech Organizer", "Bellroy", "Accessories", 89.00, 45, today - timedelta(days=50)),
            (105, "Classic Backpack", "Bellroy", "Accessories", 129.00, 30, today - timedelta(days=40)),
            (106, "Wireless Charger Pad", "Anker", "Electronics", 39.00, 120, today - timedelta(days=30)),
            (107, "Noise Cancelling Headphones", "Bose", "Electronics", 299.00, 15, today - timedelta(days=10))
        ]
        for p in products:
            conn.execute(text("""
                INSERT INTO shopify_products (product_id, title, vendor, product_type, price, inventory_quantity, created_at)
                VALUES (:id, :title, :vendor, :type, :price, :qty, :created)
            """), {"id": p[0], "title": p[1], "vendor": p[2], "type": p[3], "price": p[4], "qty": p[5], "created": p[6]})
            
        # Insert Customers
        customers = [
            (1, "Alice", "Smith", "alice@example.com", "New York", "NY", "USA", today - timedelta(days=60)),
            (2, "Bob", "Johnson", "bob@example.com", "Los Angeles", "CA", "USA", today - timedelta(days=55)),
            (3, "Charlie", "Brown", "charlie@example.com", "Chicago", "IL", "USA", today - timedelta(days=30)),
            (4, "Diana", "Prince", "diana@example.com", "London", "England", "UK", today - timedelta(days=20)),
            (5, "Ethan", "Hunt", "ethan@example.com", "Toronto", "ON", "Canada", today - timedelta(days=15))
        ]
        for c in customers:
            conn.execute(text("""
                INSERT INTO shopify_customers (customer_id, first_name, last_name, email, city, province, country, created_at)
                VALUES (:id, :fn, :ln, :email, :city, :prov, :country, :created)
            """), {"id": c[0], "fn": c[1], "ln": c[2], "email": c[3], "city": c[4], "prov": c[5], "country": c[6], "created": c[7]})
            
        # Insert Orders
        now = datetime.now()
        orders = [
            # customer_id, created_at, subtotal, tax, discounts, total, financial_status, fulfillment_status, referral
            (1001, 1, now - timedelta(days=5), 89.00, 7.12, 10.00, 86.12, "paid", "fulfilled", "direct"),
            (1002, 2, now - timedelta(days=12), 349.00, 27.92, 0.00, 376.92, "paid", "fulfilled", "facebook"),
            (1003, 3, now - timedelta(days=2), 15.00, 1.20, 0.00, 16.20, "paid", "unfulfilled", "google"),
            (1004, 4, now - timedelta(days=15), 129.00, 10.32, 0.00, 139.32, "paid", "fulfilled", "instagram"),
            (1005, 5, now - timedelta(days=20), 299.00, 23.92, 0.00, 322.92, "refunded", "fulfilled", "direct"),
            (1006, 1, now - timedelta(days=8), 114.00, 9.12, 0.00, 123.12, "paid", "fulfilled", "google"),
            (1007, 2, now - timedelta(days=1), 179.00, 14.32, 51.60, 141.72, "paid", "unfulfilled", "tiktok")
        ]
        for o in orders:
            conn.execute(text("""
                INSERT INTO shopify_orders (order_id, customer_id, created_at, subtotal_price, total_tax, total_discounts, total_price, financial_status, fulfillment_status, referral_source)
                VALUES (:id, :cust_id, :created, :sub, :tax, :disc, :total, :fin, :ful, :ref)
            """), {
                "id": o[0], "cust_id": o[1], "created": o[2], "sub": o[3], "tax": o[4], "disc": o[5], "total": o[6], "fin": o[7], "ful": o[8], "ref": o[9]
            })
            
        # Insert Order Items
        items = [
            # item_id, order_id, product_id, qty, price
            (1, 1001, 101, 2, 25.00),
            (2, 1001, 106, 1, 39.00),
            (3, 1002, 107, 1, 299.00),
            (4, 1002, 102, 1, 50.00),
            (5, 1003, 103, 1, 15.00),
            (6, 1004, 105, 1, 129.00),
            (7, 1005, 107, 1, 299.00),
            (8, 1006, 101, 1, 25.00),
            (9, 1006, 104, 1, 89.00),
            (10, 1007, 102, 1, 50.00),
            (11, 1007, 105, 1, 129.00)
        ]
        for i in items:
            conn.execute(text("""
                INSERT INTO shopify_order_items (item_id, order_id, product_id, quantity, price)
                VALUES (:id, :order_id, :prod_id, :qty, :price)
            """), {"id": i[0], "order_id": i[1], "prod_id": i[2], "qty": i[3], "price": i[4]})
            
        # Insert Refunds
        conn.execute(text("""
            INSERT INTO shopify_refunds (refund_id, order_id, created_at, amount)
            VALUES (1, 1005, :created, 322.92)
        """), {"created": now - timedelta(days=19)})
        
    logger.info("✅ Shopify e-commerce demo tables seeded successfully!")
