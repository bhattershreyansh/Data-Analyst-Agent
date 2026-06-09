<div align="center">
  <img src="final_frontend/public/Futuristic%20Lumina%20AI%20logo%20design.png" width="180" alt="Data Analyst Agent Logo" />
  <h1>Data Analyst Agent · Private Intelligence Platform</h1>
  <p><b>A dual-mode analytics engine — natural language querying meets autonomous forensic root cause analysis.</b></p>
</div>

---

## The Vision

Data Analyst Agent is a **reasoning layer** for your business data. It connects directly to your databases or uploaded files and gives you two distinct investigation modes:

- **Query & Charts** — ask any business question in plain English and get charts, SQL, and tabular results instantly.
- **Deep Diagnostics** — submit an anomaly or business problem and a multi-agent LangGraph engine autonomously investigates root causes, cross-referencing multiple tables until it reaches a verdict.

Each mode maintains its own independent conversation history, so exploration and investigation never get mixed up.

---

## Key Features

### Query & Charts
- **Natural Language → SQL**: High-accuracy SQL generation using RAG (ChromaDB schema embeddings) and Groq LLaMA 3.3 70B.
- **Auto Visualisation**: Automatically selects the best chart type (Bar, Line, Pie, Area) via Plotly.js.
- **Save to Dashboard**: Pin any chart result to your persistent dashboard with one click.
- **Data Explorer**: Every query response includes a full interactive data table alongside the chart.

### Deep Diagnostics (Forensic Engine)
Built on **LangGraph**, the diagnostics engine runs a multi-agent pipeline:
- **Scout Agent**: Scans the data for statistical anomalies and patterns.
- **Sleuth Agent**: Iteratively queries related tables to verify or eliminate hypotheses (up to 5 rounds).
- **Judge Agent**: Evaluates accumulated evidence and decides whether the investigation is conclusive.
- **Forensic Verdict**: A plain-English root cause summary with quantified evidence — *what happened*, *why it happened*, and the *financial impact*.

### Schema Blueprint
A visual card-grid of your entire data schema:
- **Semantic Linker**: Discovers relationships in messy Excel/CSV files without formal foreign key constraints.
- **Global & Focus Modes**: High-level architecture view or deep-dive column inspection.
- **Interactive Navigation**: Click any table to explore its relationships.

### Proactive Anomaly Alerts
The **Anomaly Alert Center** runs continuous background scans on your active data source and surfaces anomalies with suggested diagnostic queries.

### Smart Question Suggestions
Schema-aware question suggestions tailored to your active data source, so you always have a starting point.

### Security & Multi-Tenancy
- **Strict RBAC**: All state (sources, history, charts, blueprints) is keyed by `userId` via Clerk. Users never share data.
- **SQL Safety Gate**: A middleware layer blocks all mutating SQL commands (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, etc.). Only `SELECT` is permitted.
- **Session Isolation**: All caches and localStorage entries are wiped on sign-out or user switch.

---

## Tech Stack

### Backend
| Layer | Technology |
| :--- | :--- |
| Framework | FastAPI (Python 3.11+) |
| LLM Orchestration | LangGraph, LangChain |
| LLM | Groq (LLaMA 3.3 70B Versatile) |
| Database Layer | SQLAlchemy Core, Pandas |
| Vector DB (RAG) | ChromaDB |
| Auth | Clerk (JWT validation) |

### Frontend
| Layer | Technology |
| :--- | :--- |
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Animations | Framer Motion |
| Charts | Plotly.js |
| State / Data | TanStack React Query |
| Auth | Clerk React |

---

## Project Structure

```text
Data-Analyst-Agent/
├── agent/                          # BACKEND (Python / FastAPI)
│   ├── app/
│   │   ├── main.py                 # FastAPI app, routing & middleware
│   │   ├── models.py               # SQLAlchemy database models
│   │   └── services/
│   │       ├── diagnostics.py      # Deep Diagnostics (LangGraph multi-agent)
│   │       ├── rag_engine.py       # NL → SQL (ChromaDB RAG)
│   │       ├── anomaly_scanner.py  # Proactive anomaly detection
│   │       ├── insights.py         # Schema-aware smart questions
│   │       └── data_sources.py     # Multi-DB connection manager
│   └── data/                       # Isolated SQLite storage for uploads
├── final_frontend/                 # FRONTEND (React + Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Analytics.tsx       # Main dual-mode chat page
│   │   │   ├── Blueprint.tsx       # Schema Blueprint visualiser
│   │   │   ├── Dashboards.tsx      # Saved charts & dashboards
│   │   │   └── Home.tsx            # Landing & data source setup
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx   # Dual-mode chat UI (Query / Diagnostics)
│   │   │   ├── ChartDisplay.tsx    # Chart + table result renderer
│   │   │   ├── AnomalyAlertCenter.tsx
│   │   │   ├── SmartQuestions.tsx
│   │   │   ├── SavedChartsSidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── contexts/               # Theme & RBAC state
│   │   └── lib/api.ts              # Type-safe API client
│   └── public/
└── README.md
```

---

## Installation & Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- [Groq API Key](https://console.groq.com/)
- [Clerk Keys](https://clerk.com/) (for authentication)

### 1. Backend Setup
```bash
cd agent
pip install -r ../requirements.txt

# Create a .env file:
# GROQ_API_KEY=your_key_here
# DATABASE_URL=sqlite:///./data/app.db
# CLERK_SECRET_KEY=your_clerk_secret

uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd final_frontend
npm install

# Create a .env file:
# VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
# VITE_API_URL=http://localhost:8000

npm run dev
```

---

## Usage Guide

1. **Connect a Data Source** — Upload a CSV/Excel file or connect a PostgreSQL / MySQL / SQL Server database from the Home page.
2. **Query & Charts mode** — Switch to the **Query & Charts** tab in the chat and ask any business question in plain English. Results appear as charts with a data table below.
3. **Save Charts** — Click **Save Chart** on any result to pin it to your dashboard.
4. **Deep Diagnostics mode** — Switch to the **Deep Diagnostics** tab and describe an anomaly or business problem (e.g. *"Why did revenue drop 52% last week?"*). The multi-agent engine investigates and returns a forensic verdict with step-by-step reasoning.
5. **Schema Blueprint** — Visit the Blueprint page to explore how your data tables are semantically linked and navigate the schema visually.
6. **Dashboards** — Visit the Dashboards page to view all saved charts in one place.

> **Note**: Query & Charts and Deep Diagnostics maintain completely separate conversation histories. Switching modes swaps the thread — your exploration history and investigation history never mix.

---

## API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/query` | POST | NL → SQL → Chart + Data Table |
| `/diagnose` | POST | Trigger Deep Diagnostics forensic analysis |
| `/schema` | GET | Fetch schema blueprint for active source |
| `/data-sources` | GET / POST | Manage database and file connections |
| `/saved-charts` | GET / POST / DELETE | Manage persistent chart storage |
| `/dashboards` | GET / POST | Create and manage unified dashboard views |
| `/anomalies` | GET | Fetch latest anomaly scan results |
| `/smart-questions` | GET | Get schema-aware question suggestions |
