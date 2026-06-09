import logging
import json
import datetime
from typing import List, Dict, Tuple, Optional
import pandas as pd
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.models.db_models import AnomalyHistory

logger = logging.getLogger(__name__)

def resolve_table_name(available_tables: List[str], base_names: List[str]) -> Optional[str]:
    """Find a table name in the database matching one of the base names (case-insensitive)"""
    # 1. First pass: exact match
    for base in base_names:
        for t in available_tables:
            if t.lower() == base.lower():
                return t
                
    # 2. Second pass: suffix/UUID prefix match (e.g. _uuid_shopify_orders matches shopify_orders)
    for base in base_names:
        for t in available_tables:
            clean_t = t.lower()
            clean_base = base.lower()
            if clean_t.endswith(clean_base) or clean_t.endswith(f"_{clean_base}"):
                return t
    return None


def resolve_column_name(available_columns: List[str], base_names: List[str]) -> Optional[str]:
    """Find a column name matching one of the base names (case-insensitive)"""
    for base in base_names:
        for col in available_columns:
            if col.lower() == base.lower():
                return col
    return None


def scan_anomalies(
    engine,
    metadata_db: Session,
    user_id: str,
    source_id: str
) -> List[Dict]:
    """
    Scans the active database for e-commerce anomalies using dynamic table mapping,
    deterministic templating, memory tracking, and severity capping.
    """
    logger.info(f"Starting e-commerce anomaly scan for user: {user_id}, source: {source_id}")
    
    try:
        inspector = inspect(engine)
        available_tables = inspector.get_table_names()
    except Exception as e:
        logger.error(f"Failed to inspect tables: {e}")
        return []

    # 1. Resolve standard table names (supports demo seeder and custom user CSV uploads)
    orders_table = resolve_table_name(available_tables, ["shopify_orders", "orders", "order"])
    products_table = resolve_table_name(available_tables, ["shopify_products", "products", "product"])
    items_table = resolve_table_name(available_tables, ["shopify_order_items", "order_items", "order_details", "items"])
    refunds_table = resolve_table_name(available_tables, ["shopify_refunds", "refunds", "refund"])
    customers_table = resolve_table_name(available_tables, ["shopify_customers", "customers", "customer"])

    # Retrieve columns for resolved tables to map schema variations dynamically
    orders_cols = []
    products_cols = []
    items_cols = []
    refunds_cols = []

    try:
        if orders_table:
            orders_cols = [c['name'] for c in inspector.get_columns(orders_table)]
        if products_table:
            products_cols = [c['name'] for c in inspector.get_columns(products_table)]
        if items_table:
            items_cols = [c['name'] for c in inspector.get_columns(items_table)]
        if refunds_table:
            refunds_cols = [c['name'] for c in inspector.get_columns(refunds_table)]
    except Exception as e:
        logger.warning(f"Failed to inspect table columns: {e}")

    # Map column names dynamically
    col_orders_id = resolve_column_name(orders_cols, ["order_id", "order_number", "id"]) or "order_id"
    col_orders_date = resolve_column_name(orders_cols, ["created_at", "date", "created"]) or "created_at"
    col_orders_total = resolve_column_name(orders_cols, ["total_price", "total", "amount"]) or "total_price"
    col_orders_disc = resolve_column_name(orders_cols, ["total_discounts", "discount_amount", "discount", "discounts"]) or "total_discounts"
    col_orders_sub = resolve_column_name(orders_cols, ["subtotal_price", "subtotal", "sub_total"]) or "subtotal_price"

    col_prod_id = resolve_column_name(products_cols, ["product_id", "id", "variant_id"]) or "product_id"
    col_prod_title = resolve_column_name(products_cols, ["title", "name", "product_title"]) or "title"
    col_prod_qty = resolve_column_name(products_cols, ["inventory_quantity", "quantity", "qty", "stock", "variant_inventory_qty", "variant inventory qty"]) or "inventory_quantity"
    col_prod_price = resolve_column_name(products_cols, ["price", "cost", "variant_price", "variant price"]) or "price"

    col_items_prod_id = resolve_column_name(items_cols, ["product_id", "id", "variant_id"]) or "product_id"
    col_items_qty = resolve_column_name(items_cols, ["quantity", "qty"]) or "quantity"
    col_items_ord_id = resolve_column_name(items_cols, ["order_id", "order_number"]) or "order_id"

    col_ref_id = resolve_column_name(refunds_cols, ["refund_id", "id"]) or "refund_id"
    col_ref_ord_id = resolve_column_name(refunds_cols, ["order_id", "order_number"]) or "order_id"
    col_ref_amount = resolve_column_name(refunds_cols, ["amount", "refund_amount", "refunded_amount", "value"]) or "amount"

    # Anchor the sliding date windows to the maximum order date in the dataset to support historical uploaded CSV files
    ref_date = "now"
    if orders_table:
        try:
            ref_date_query = f"SELECT MAX({col_orders_date}) as max_date FROM {orders_table}"
            df_ref = pd.read_sql(ref_date_query, engine)
            max_date_val = df_ref['max_date'].iloc[0]
            if max_date_val:
                ref_date = str(max_date_val)[:10]
        except Exception as ref_err:
            logger.warning(f"Could not determine max order date (using 'now'): {ref_err}")

    detected_anomalies = {}

    # --- SCAN 1: Inventory Days-Remaining Velocity ---
    if products_table and items_table and orders_table:
        try:
            ref_param = "'now'" if ref_date == "now" else f"'{ref_date}'"
            query = f"""
                SELECT 
                    p.{col_prod_id} as product_id,
                    p.{col_prod_title} as title,
                    p.{col_prod_qty} as inventory_quantity,
                    p.{col_prod_price} as price,
                    COALESCE(sales.avg_daily_sales, 0.0) as avg_daily_sales
                FROM {products_table} p
                LEFT JOIN (
                    SELECT 
                        {col_items_prod_id} as product_id, 
                        CAST(SUM({col_items_qty}) AS FLOAT) / 30.0 as avg_daily_sales
                    FROM {items_table} oi
                    JOIN {orders_table} o ON oi.{col_items_ord_id} = o.{col_orders_id}
                    WHERE o.{col_orders_date} >= date({ref_param}, '-30 days')
                    GROUP BY {col_items_prod_id}
                ) sales ON p.{col_prod_id} = sales.product_id
            """
            df = pd.read_sql(query, engine)
            for _, row in df.iterrows():
                p_id = int(row['product_id'])
                title = str(row['title'])
                qty = int(row['inventory_quantity'])
                avg_sales = float(row['avg_daily_sales'])
                price = float(row['price'])
                
                # Check velocity
                if avg_sales > 0:
                    days_remaining = qty / avg_sales
                else:
                    days_remaining = 999.0
                    
                if days_remaining < 7:
                    lost_rev = price * avg_sales * 7
                    key = f"inventory:{p_id}"
                    
                    description = f"{title} is projected to run out of stock in {days_remaining:.1f} days based on sales velocity. You have {qty} units left while selling {avg_sales*30:.1f} per month."
                    detected_anomalies[key] = {
                        "metric": "Inventory Stockout Risk",
                        "description": f"{description} Order replenishment immediately.",
                        "financial_impact_dollars": int(lost_rev),
                        "severity": "HIGH" if lost_rev > 500 else "MEDIUM",
                        "suggested_query": f"SELECT {col_prod_id}, {col_prod_title}, {col_prod_qty}, {col_prod_price} FROM {products_table} WHERE {col_prod_id} = {p_id}"
                    }
        except Exception as err:
            logger.error(f"Error in inventory stockout scan: {err}")

    # --- SCAN 2: SKU / Variant Refund Spike ---
    if products_table and items_table and orders_table and refunds_table:
        try:
            query = f"""
                SELECT 
                    p.{col_prod_id} as product_id,
                    p.{col_prod_title} as title,
                    count(distinct o.{col_orders_id}) as total_sold,
                    count(distinct r.{col_ref_id}) as total_refunded,
                    COALESCE(sum(r.{col_ref_amount}), 0.0) as total_refunded_amount
                FROM {products_table} p
                JOIN {items_table} oi ON p.{col_prod_id} = oi.{col_items_prod_id}
                JOIN {orders_table} o ON oi.{col_items_ord_id} = o.{col_orders_id}
                LEFT JOIN {refunds_table} r ON o.{col_orders_id} = r.{col_ref_ord_id}
                GROUP BY p.{col_prod_id}
                HAVING total_sold >= 3
            """
            df = pd.read_sql(query, engine)
            for _, row in df.iterrows():
                p_id = int(row['product_id'])
                title = str(row['title'])
                sold = int(row['total_sold'])
                refunded = int(row['total_refunded'])
                refunded_amt = float(row['total_refunded_amount'])
                
                refund_rate = refunded / sold if sold > 0 else 0
                if refund_rate > 0.15:
                    key = f"refund:{p_id}"
                    description = f"Refund rate on product '{title}' has reached {refund_rate*100:.1f}% ({refunded} refunds out of {sold} sales)."
                    detected_anomalies[key] = {
                        "metric": "High Product Refund Rate",
                        "description": f"{description} Inspect variant details for sizing/description mismatch.",
                        "financial_impact_dollars": int(refunded_amt),
                        "severity": "HIGH" if refunded_amt > 200 else "MEDIUM",
                        "suggested_query": f"SELECT * FROM {refunds_table} r JOIN {items_table} oi ON r.{col_ref_ord_id} = oi.{col_items_ord_id} WHERE oi.{col_items_prod_id} = {p_id}"
                    }
        except Exception as err:
            logger.error(f"Error in refund rate scan: {err}")

    # --- SCAN 3: Double-Windowed Revenue Dip (Noise-Free) ---
    if orders_table:
        try:
            ref_param = "'now'" if ref_date == "now" else f"'{ref_date}'"
            query_cur = f"SELECT COALESCE(SUM({col_orders_total}), 0.0) as rev FROM {orders_table} WHERE {col_orders_date} >= date({ref_param}, '-3 days')"
            query_lw = f"SELECT COALESCE(SUM({col_orders_total}), 0.0) as rev FROM {orders_table} WHERE {col_orders_date} >= date({ref_param}, '-10 days') AND {col_orders_date} < date({ref_param}, '-7 days')"
            query_lm = f"SELECT COALESCE(SUM({col_orders_total}), 0.0) as rev FROM {orders_table} WHERE {col_orders_date} >= date({ref_param}, '-33 days') AND {col_orders_date} < date({ref_param}, '-30 days')"

            rev_cur = float(pd.read_sql(query_cur, engine)['rev'].iloc[0])
            rev_lw = float(pd.read_sql(query_lw, engine)['rev'].iloc[0])
            rev_lm = float(pd.read_sql(query_lm, engine)['rev'].iloc[0])

            # Alert if revenue drops compared to BOTH same-weekdays baseline
            if rev_cur < rev_lw and rev_cur < rev_lm:
                avg_baseline = (rev_lw + rev_lm) / 2.0
                dip_pct = ((avg_baseline - rev_cur) / avg_baseline) * 100 if avg_baseline > 0 else 0
                lost_val = avg_baseline - rev_cur
                
                if dip_pct > 20:
                    key = "revenue_dip:channel_all"
                    detected_anomalies[key] = {
                        "metric": "Sales Revenue Drop",
                        "description": f"Total sales revenue over the last 3 days (${rev_cur:.0f}) has dropped by {dip_pct:.1f}% compared to last week (${rev_lw:.0f}) and last month (${rev_lm:.0f}).",
                        "financial_impact_dollars": int(lost_val),
                        "severity": "HIGH" if lost_val > 500 else "MEDIUM",
                        "suggested_query": f"SELECT date({col_orders_date}) as day, sum({col_orders_total}) as sales FROM {orders_table} GROUP BY day ORDER BY day DESC LIMIT 14"
                    }
        except Exception as err:
            logger.error(f"Error in revenue dip scan: {err}")

    # --- SCAN 4: Discount Margin Erosion ---
    if orders_table:
        try:
            query = f"""
                SELECT 
                    {col_orders_id} as order_id, 
                    {col_orders_total} as total_price, 
                    {col_orders_disc} as total_discounts,
                    {col_orders_sub} as subtotal_price
                FROM {orders_table} 
                WHERE {col_orders_disc} > 0 AND {col_orders_sub} > 0
            """
            df = pd.read_sql(query, engine)
            high_discount_orders = []
            total_eroded = 0.0

            for _, row in df.iterrows():
                disc = float(row['total_discounts'])
                sub = float(row['subtotal_price'])
                ratio = disc / sub if sub > 0 else 0
                if ratio > 0.2:
                    high_discount_orders.append(int(row['order_id']))
                    total_eroded += disc

            if high_discount_orders:
                key = "discount:margin_erosion"
                detected_anomalies[key] = {
                    "metric": "Margin Erosion (Over-discounting)",
                    "description": f"Profit margins have been compressed on {len(high_discount_orders)} orders where discounts exceeded 20% of the subtotal amount.",
                    "financial_impact_dollars": int(total_eroded),
                    "severity": "HIGH" if total_eroded > 200 else "MEDIUM",
                    "suggested_query": f"SELECT {col_orders_id}, {col_orders_total}, {col_orders_disc} FROM {orders_table} WHERE {col_orders_disc} > 0 ORDER BY {col_orders_disc} DESC LIMIT 5"
                }
        except Exception as err:
            logger.error(f"Error in margin erosion scan: {err}")

    # --- FALLBACK: Generic Column Profiler (If not e-commerce) ---
    if not detected_anomalies:
        logger.info("No standard e-commerce tables resolved or no store anomalies detected. Skipping storefront scans.")

    # ============================================
    # ANOMALY MEMORY & STATE STATE MACHINE
    # ============================================
    prev_anomalies = metadata_db.query(AnomalyHistory).filter(
        AnomalyHistory.user_id == user_id,
        AnomalyHistory.source_id == source_id,
        AnomalyHistory.resolved == False
    ).all()

    prev_map = {a.anomaly_key: a for a in prev_anomalies}
    output_anomalies = []
    high_count = 0

    # Process all detected anomalies
    for key, info in detected_anomalies.items():
        severity = info["severity"]
        
        # Severity Capping: Cap HIGH alerts at 2 per scan
        if severity == "HIGH":
            if high_count >= 2:
                severity = "MEDIUM"
            else:
                high_count += 1

        if key in prev_map:
            # 1. Ongoing Anomaly - Escalated state
            db_anomaly = prev_map[key]
            db_anomaly.last_seen = datetime.datetime.now()
            db_anomaly.description = info["description"]
            db_anomaly.financial_impact_dollars = info["financial_impact_dollars"]
            db_anomaly.severity = severity
            
            delta = datetime.datetime.now() - db_anomaly.first_seen
            days_unresolved = delta.days
            duration_str = f"{days_unresolved} days" if days_unresolved > 0 else "less than 24 hours"
            
            output_anomalies.append({
                "anomaly_key": key,
                "metric": info["metric"],
                "severity": severity,
                "state": "ONGOING",
                "duration": duration_str,
                "description": f"[Still unresolved, day {days_unresolved + 1}] {info['description']}",
                "financial_impact_dollars": info["financial_impact_dollars"],
                "suggested_query": info["suggested_query"]
            })
        else:
            # 2. New Anomaly
            db_anomaly = AnomalyHistory(
                user_id=user_id,
                source_id=source_id,
                anomaly_key=key,
                metric=info["metric"],
                description=info["description"],
                financial_impact_dollars=info["financial_impact_dollars"],
                severity=severity,
                first_seen=datetime.datetime.now(),
                last_seen=datetime.datetime.now(),
                resolved=False
            )
            metadata_db.add(db_anomaly)
            metadata_db.commit()
            metadata_db.refresh(db_anomaly)
            
            output_anomalies.append({
                "anomaly_key": key,
                "metric": info["metric"],
                "severity": severity,
                "state": "NEW",
                "duration": "new",
                "description": info["description"],
                "financial_impact_dollars": info["financial_impact_dollars"],
                "suggested_query": info["suggested_query"]
            })

    # 3. Resolved Anomaly (Seen in history but no longer present in current telemetry)
    for key, db_anomaly in prev_map.items():
        if key not in detected_anomalies:
            db_anomaly.resolved = True
            db_anomaly.resolved_at = datetime.datetime.now()
            
            output_anomalies.append({
                "anomaly_key": key,
                "metric": db_anomaly.metric,
                "severity": "LOW",
                "state": "RESOLVED",
                "duration": "resolved",
                "description": f"Resolved: Return values for '{db_anomaly.metric}' are back to normal.",
                "financial_impact_dollars": 0,
                "suggested_query": ""
            })

    metadata_db.commit()
    return output_anomalies
