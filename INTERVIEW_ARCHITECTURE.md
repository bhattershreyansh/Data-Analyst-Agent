# Lumina AI / Data Analyst Agent - Interview Architecture

Use this as the quick architecture refresher before interview prep. It maps the resume bullets to the current repository implementation.

## 1. System Overview

```mermaid
flowchart LR
  User["User / Interview Demo"]
  FE["React + Vite Frontend\nfinal_frontend"]
  Auth["Auth Context / Bearer Token"]
  API["FastAPI Backend\nagent/app/main.py"]
  Routers["API Routers\nquery, diagnose, data-sources, dashboards, auth"]
  Services["Service Layer\nRAG SQL, Diagnostics, Anomaly Scanner,\nData Sources, Insights, Cache"]
  LLM["Groq LLaMA 3.3 70B\nLangChain"]
  LangGraph["LangGraph Forensic Engine"]
  RuntimeSources["In-memory active_sources\nDataSourceManager engines"]
  MetadataDB["Metadata DB\nusers, sources, dashboards,\nsaved charts, anomaly_history"]
  UserDB["User Data Sources\nCSV/Excel -> SQLite\nPostgreSQL/MySQL/SQL Server"]

  User --> FE
  FE --> Auth
  FE --> API
  API --> Routers
  Routers --> Services
  Services --> LLM
  Services --> LangGraph
  Services --> RuntimeSources
  RuntimeSources --> UserDB
  Routers --> MetadataDB
  Services --> MetadataDB
```

**Main idea:** the frontend is a workspace for business users; FastAPI owns authentication, source selection, and orchestration; SQLAlchemy/Pandas run validated queries against the active source; Groq/LangChain provide reasoning; LangGraph drives deeper forensic investigations.

## 2. Data Source Lifecycle

```mermaid
sequenceDiagram
  actor User
  participant FE as React UI
  participant API as FastAPI /data-sources
  participant DSM as DataSourceManager
  participant MDB as Metadata DB
  participant Store as User Data Store

  User->>FE: Upload CSV/Excel or connect DB
  FE->>API: POST /data-sources/upload or /connect
  API->>API: Validate auth and ensure user row
  alt File upload
    API->>DSM: add_file(name, path, file_type)
    DSM->>Store: Convert CSV/Excel sheets into per-source SQLite DB
    DSM->>DSM: Compute previews and column stats
  else External database
    API->>DSM: add_database(host, db_type, credentials)
    DSM->>Store: Create SQLAlchemy engine and inspect tables
    DSM->>DSM: Encrypt password for persistence
  end
  API->>MDB: Persist source metadata keyed by user_id
  API-->>FE: source_id, tables, table_count, status
  User->>FE: Activate source
  FE->>API: POST /data-sources/{source_id}/activate
  API->>DSM: Restore source if missing from memory
  API->>API: active_sources[user_id] = source_id
  API-->>FE: Active source confirmation
```

**Interview talking points:**
- Every source is keyed by `user_id`; custom sources are ownership-checked before schema, query, scan, or delete.
- Files become isolated SQLite databases, which gives a uniform SQL execution path.
- External database credentials are encrypted before being stored in metadata.

## 3. Conversational SQL / Query & Charts Architecture

```mermaid
flowchart TD
  Q["User asks question\n/query"]
  Active["Resolve active source\nactive_sources[user_id]"]
  History["Conversation Memory\nlast 10 turns per user"]
  Schema["Schema Context Builder\nselect top relevant tables"]
  Classifier["Classification Agent\nSIMPLE vs COMPLEX"]
  Planner{"Complex query?"}
  Plan["Planning Agent\nstep-by-step query plan"]
  Gen["SQL Generator Agent\nSQL + chart config + reasoning"]
  Validate["Static SQL Validator\nvalid tables, safe ops, LIMIT required"]
  Execute["Pandas read_sql\nagainst active SQLAlchemy engine"]
  Sanitize["Result Sanitizer\nJSON-safe rows"]
  Review["Reviewer / Judge Agent\nconfidence + critique"]
  Retry{"Confidence >= 0.8\nor attempts exhausted?"}
  Chart["Frontend Plotly renderer\nchart + data table + KPI"]

  Q --> Active --> History --> Schema --> Classifier --> Planner
  Planner -- Yes --> Plan --> Gen
  Planner -- No --> Gen
  Gen --> Validate
  Validate -- invalid --> Gen
  Validate -- valid --> Execute --> Sanitize --> Review --> Retry
  Retry -- No, repair --> Gen
  Retry -- Yes --> Chart
```

**What happens in code:**
- Route: `agent/app/routers/query.py`
- Main engine: `agent/app/services/rag_engine.py`
- Frontend caller: `final_frontend/src/pages/Analytics.tsx`
- Renderer: `final_frontend/src/components/ChatInterface.tsx`

**Good answer framing:** "I treated natural language analytics as a constrained agent pipeline, not a single LLM call. The system first narrows schema context, optionally plans, generates SQL and chart metadata, validates safety and schema correctness, executes through SQLAlchemy/Pandas, then has a reviewer agent decide whether to retry."

## 4. Deep Diagnostics / LangGraph Forensic Pipeline

```mermaid
flowchart TD
  Start["POST /diagnose\nquestion + anomaly_data"]
  Blueprint["Build Schema Blueprint\nactive source tables + relationships"]
  Filter["Large schema filter\ntop 5 relevant tables"]
  Scout["Schema Scout\nfind 2-3 suspicious tables"]
  Sleuth["Data Sleuth\nwrite SELECT-only SQL\nusing real columns only"]
  Safety["SQL Safety Gate\nblock mutating commands"]
  Evidence["Execute SQL\ncollect evidence rows"]
  Judge["Evidence Judge\nsufficient root-cause evidence?"]
  Budget{"SQL calls < 5\nand drill-down hints?"}
  Narrator["Forensic Narrator\nverdict + diagnostic_path"]
  UI["Diagnostics UI\ninvestigation path + verdict"]

  Start --> Blueprint --> Filter --> Scout --> Sleuth --> Safety --> Evidence --> Judge
  Judge --> Budget
  Budget -- Yes --> Sleuth
  Budget -- No --> Narrator --> UI
```

**LangGraph nodes:**
- `schema_scout`: identifies suspicious upstream/related tables from the blueprint.
- `data_sleuth`: generates targeted SELECT queries, validates SQL safety, executes evidence-gathering queries.
- `evidence_judge`: decides if evidence is conclusive or asks for drill-down hints.
- `forensic_narrator`: converts evidence into a quantified root-cause report.

**Controls that matter in interviews:**
- Hard SQL budget: `MAX_SQL_CALLS = 5`.
- Column grounding: the Sleuth prompt receives exact table columns from the blueprint.
- Safety regex blocks mutating SQL like `DELETE`, `DROP`, `ALTER`, `UPDATE`, `INSERT`, `CREATE`, `TRUNCATE`, etc.
- Judge controls looping, so investigation stops when evidence is sufficient or the budget is exhausted.

## 5. Proactive Anomaly Detection Architecture

```mermaid
flowchart TD
  Trigger["Trigger scan\nGET /data-sources/{source_id}/scan-anomalies"]
  Source["Resolve active/owned data source"]
  Inspect["Inspect available tables and columns"]
  Map["Dynamic table/column mapping\norders, products, items, refunds, customers"]
  DateAnchor["Anchor date windows\nMAX(order date)"]
  Scan1["Inventory stockout risk\ninventory / sales velocity"]
  Scan2["Product refund spike\nrefund rate > threshold"]
  Scan3["Revenue dip\ncurrent 3 days vs prior windows"]
  Scan4["Discount margin erosion\ndiscounts > 20% subtotal"]
  Dedup["Anomaly memory state machine"]
  MDB["anomaly_history table"]
  Response["NEW / ONGOING / RESOLVED alerts\nseverity + impact + suggested SQL"]
  AlertCenter["React Anomaly Alert Center\nclick alert to diagnose/query"]

  Trigger --> Source --> Inspect --> Map --> DateAnchor
  DateAnchor --> Scan1 --> Dedup
  DateAnchor --> Scan2 --> Dedup
  DateAnchor --> Scan3 --> Dedup
  DateAnchor --> Scan4 --> Dedup
  Dedup <--> MDB
  Dedup --> Response --> AlertCenter
```

**What it detects now:**
- Inventory stockout risk based on average daily sales velocity.
- High product refund rate.
- Revenue drop using a double-window baseline.
- Discount-driven margin erosion.

**State model:**
- `NEW`: detected now and not previously unresolved.
- `ONGOING`: detected again while still unresolved.
- `RESOLVED`: existed before, but not detected in the current scan.

**Important repo note:** the current repository exposes anomaly scanning through an authenticated API endpoint and the frontend triggers it on mount/manual button click. I do not see Celery/Celery Beat in `requirements.txt` or the code. If asked about the resume bullet, be ready to clarify whether the scheduled Celery Beat version lived elsewhere, was planned, or that this repo contains the scheduler-ready scanner but not the scheduler worker.

## 6. Schema Blueprint / Relationship Discovery

```mermaid
flowchart LR
  Engine["SQLAlchemy engine\nactive source"]
  Inspector["SQLAlchemy Inspector"]
  Tables["Tables + columns"]
  Explicit["Explicit foreign keys"]
  Semantic["Semantic links\nshared non-generic column names"]
  Blueprint["Blueprint JSON\ntables + relationships"]
  UI["SchemaBlueprint page\nvisual schema exploration"]
  Diagnostics["Diagnostics Scout\nuses blueprint as map"]
  Query["Query pipeline\nuses schema context"]

  Engine --> Inspector --> Tables --> Blueprint
  Inspector --> Explicit --> Blueprint
  Tables --> Semantic --> Blueprint
  Blueprint --> UI
  Blueprint --> Diagnostics
  Blueprint --> Query
```

**Why this is valuable:** uploaded CSV/Excel files often lack real foreign keys, so the system supplements explicit relationships with semantic links discovered from shared column names.

## 7. Persistence and Multi-Tenancy

```mermaid
erDiagram
  users ||--o{ data_sources : owns
  users ||--o{ saved_charts : saves
  users ||--o{ dashboards : creates
  users ||--o{ anomaly_history : receives

  users {
    string user_id PK
    string email
    datetime created_at
  }

  data_sources {
    string source_id PK
    string user_id FK
    string name
    string type
    string db_type
    json connection_info
    string status
    int table_count
  }

  saved_charts {
    string chart_id PK
    string user_id FK
    string question
    string chart_type
    json data
    string query
  }

  dashboards {
    string dashboard_id PK
    string user_id FK
    string name
    json charts
  }

  anomaly_history {
    int id PK
    string user_id FK
    string source_id
    string anomaly_key
    string metric
    int financial_impact_dollars
    string severity
    boolean resolved
  }
```

**Security posture:**
- API routes depend on `get_current_user`.
- Data-source operations verify `source_id` ownership.
- Query SQL validation blocks dangerous operations and requires row limiting.
- Connection passwords are encrypted in metadata.

## 8. Request Flow Summary

```mermaid
flowchart TB
  subgraph Frontend["React Frontend"]
    Home["Home / Data connections"]
    Analytics["Analytics workspace\nQuery + Diagnostics modes"]
    Alerts["AnomalyAlertCenter"]
    Dash["Dashboards"]
    SchemaUI["Schema Blueprint"]
  end

  subgraph Backend["FastAPI Backend"]
    DS["/data-sources"]
    Query["/query"]
    Diagnose["/diagnose"]
    DashboardAPI["/dashboards + /saved-charts"]
    Mode["/mode/status"]
  end

  subgraph Services["Python Services"]
    DSM["DataSourceManager"]
    RAG["Agentic SQL pipeline"]
    FG["LangGraph forensic_engine"]
    Scanner["scan_anomalies"]
    Insights["insights + smart questions + cache"]
  end

  Home --> DS --> DSM
  Analytics --> Query --> RAG
  Analytics --> Diagnose --> FG
  Alerts --> DS --> Scanner
  Dash --> DashboardAPI
  SchemaUI --> DS --> RAG
  Analytics --> Mode
  Query --> Insights
```

## 9. Interview-Ready One-Liners

- **Overall architecture:** "Lumina AI is a multi-tenant FastAPI and React analytics platform where each user activates a data source, and all query, diagnosis, schema, dashboard, and anomaly workflows operate against that isolated active source."
- **SQL pipeline:** "The natural-language SQL path is agentic: memory, schema selection, classification, planning, SQL generation, static validation, execution, sanitization, and reviewer-based retry."
- **Forensics pipeline:** "The diagnostic path uses LangGraph as a controlled investigation loop: Scout picks likely tables, Sleuth gathers evidence with safe SQL, Judge decides whether to drill deeper, and Narrator produces the final root-cause verdict."
- **Anomaly pipeline:** "The anomaly scanner is deterministic and data-grounded: it maps messy ecommerce schemas to canonical concepts, runs targeted checks, persists anomaly history, and returns NEW/ONGOING/RESOLVED alerts with impact estimates and diagnostic queries."
- **Schema blueprint:** "The blueprint is the shared map used by both UI exploration and agents; it combines database inspection with semantic links for CSV/Excel sources that do not have real foreign keys."

## 10. Resume Alignment Notes

- **FastAPI:** implemented.
- **LangGraph:** implemented in `agent/app/services/diagnostics.py`.
- **PostgreSQL:** supported through `DataSourceManager.add_database`; metadata DB can also use `DATABASE_URL`.
- **React:** implemented in `final_frontend`.
- **Pinecone:** dependency/config/imports exist, but current `SchemaRAG` logs a vectorless LLM schema selector and bypasses cloud vector indexing.
- **Celery Beat:** not present in this checked-out repo. Current anomaly scanning is endpoint/UI-triggered.
- **Shopify CSV exports:** represented by demo seed data and `TEST_CSV` files; file uploads become SQLite-backed tables.
