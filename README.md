<div align="center">
  <img src="final_frontend/public/Futuristic%20Lumina%20AI%20logo%20design.png" width="180" alt="Lumina AI Logo" />
  <h1>Lumina AI · Private Data Intelligence</h1>
  <p><b>The ultimate autonomous forensic and analytics engine for enterprise data ecosystems.</b></p>
</div>

---

## 🌟 The Vision

Lumina AI is not just a dashboard—it is a **reasoning layer** for your business data. It transforms raw numbers into **Strategic Content** by combining high-precision Natural Language processing with an autonomous multi-agent forensic engine. Whether you are a CEO looking for a high-level trend or an analyst performing a root-cause deep dive, Lumina AI provides the answers in plain English.

---

## 🚀 Key Features

### 🧠 Causal Nexus Discovery (Forensic Engine)
Lumina features **Causal Nexus**, a multi-agent diagnostic system built on **LangGraph** that investigates data anomalies autonomously:
- **Autonomous Iteration**: The engine runs up to 5 iterative "Sleuth" steps to verify hypotheses.
- **Judge Node**: An internal evaluator that checks if evidence is sufficient or if the engine needs to drill deeper into related tables.
- **Root Cause Recovery**: Moves beyond "what happened" to reveal "why it happened" with quantified certainty.

### 💡 Lumina Intelligence (Narrative Engine)
Powered by specialized LLM prompts, Lumina Intelligence enriches every query result:
- **Strategic Context**: Explains the business implications behind the data spikes or dips.
- **Trend Detection**: Automatically identifies distribution skews and outliers in the result set.
- **Executive Summaries**: Generates high-level summaries tailored for quick decision-making.

### 🗺️ Sentinel Map (Schema Blueprint)
A revolutionary **custom card-grid visualization** of your entire data schema:
- **Semantic Linker**: Automatically discovers "Statistical Foreign Keys" in messy Excel or CSV files without formal constraints.
- **Global & Focus Modes**: Toggle between a high-level architectural view and a deep-dive column inspection for specific tables.
- **Interactive Navigation**: Click any table to see its direct relationships and navigate the web of data.

### 📊 Universal Querying & Visualization
- **Multi-Source Support**: Connect **PostgreSQL, MySQL, SQL Server**, or upload **CSV/Excel** files.
- **NL → SQL**: Highly accurate SQL generation using RAG (Retrieval Augmented Generation) and ChromaDB embeddings.
- **Smart Visuals**: Automatically selects the best chart type (Bar, Line, Pie, Area, Table) and allows manual overrides.
- **Dynamic Dashboards**: Save any insight to a persistent dashboard for real-time monitoring.

---

## 🛡️ Security & Enterprise Hardening

### 🔒 Strict RBAC & Multi-tenancy
Lumina AI implements a **Safety-First isolation architecture**:
- **User Isolation**: All state (active sources, chat history, saved charts, blueprints) is strictly keyed by `userId` (via Clerk). User B can never access User A's data, even if they share the same backend.
- **Session Protection**: All sensitive `localStorage` and `React Query` caches are wiped immediately upon sign-out or session switch.

### 🚫 SQL Safety Gate
Every query is intercepted by a security middleware that blocks **mutating commands**:
- **Blacklist**: `DROP`, `DELETE`, `UPDATE`, `INSERT`, `TRUNCATE`, `ALTER`, etc.
- **Read-Only Enforcement**: Ensures the LLM only performs `SELECT` operations, protecting the integrity of your production data.

---

## 🛠️ Tech Stack

### Backend (The Brain)
- **Framework**: FastAPI (Python 3.11+)
- **LLM Orchestration**: LangGraph, LangChain
- **Database Layer**: SQLAlchemy (Core), Pandas (Analysis)
- **Vector DB (RAG)**: ChromaDB (Storing schema embeddings)
- **LLM**: Groq (Llama 3.3 70B Versatile)

### Frontend (The Interface)
- **Framework**: React 18 (Vite, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui
- **State/Data**: React Query (TanStack), Framer Motion
- **Charts**: Recharts, Plotly.js

---

## 📂 Project Organization

```text
Data-Analyst-Agent/
├── agent/                      # BACKEND (Python)
│   ├── server.py               # FastAPI Endpoints & Logic
│   ├── forensic_graph.py       # Causal Nexus (LangGraph)
│   ├── agnet_rag.py            # Schema Sentinel & RAG System
│   ├── insight_engine.py       # Lumina Intelligence Logic
│   ├── data_sources.py         # Multi-DB Connection Manager
│   ├── smart_questions.py      # Schema-based Suggestion Logic
│   ├── models.py               # Database Models (Auth/Persistence)
│   ├── caching.py              # Performance Optimization Layer
│   └── data/                   # Isolated SQLite Storage for Uploads
├── final_frontend/             # FRONTEND (React)
│   ├── src/
│   │   ├── pages/              # Analytics, Blueprint, Home, Dashboards
│   │   ├── components/         # ChatInterface, ChartDisplay, Header
│   │   ├── contexts/           # RBAC & Theme State
│   │   └── lib/api.ts          # Type-safe API Client
│   └── public/                 # Futuristic Assets & Branding
└── README.md                   # Complete Documentation
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **Groq API Key**: Obtain from [Groq Console](https://console.groq.com/)
- **Clerk Keys**: For Production Auth (Default is mock for local dev)

### 2. Backend Setup
```bash
cd agent
pip install -r ../requirements.txt
# Create a .env file with your GROQ_API_KEY
uvicorn server:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd final_frontend
npm install
npm run dev
```

---

## 📖 Usage Guide

1.  **Select Data Source**: Use the **Header** to upload an Excel file or connect your SQL Database.
2.  **Ask Questions**: In the Chat interface, ask anything (*"What is the total revenue by region in Q3?"*).
3.  **Explore Intelligence**: Toggle **Lumina Intelligence** to get business trends and narratives.
4.  **Forensic Investigation**: If a result looks odd, click **Run Causal Nexus** for a multi-agent root cause analysis.
5.  **Blueprint Exploration**: Visit the **Schema Blueprint** page to see how your data tables are semantically and physically linked.
6.  **Build Dashboards**: Save icons from individual charts and visit the **Dashboards** page to organize them.

---

## 📜 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/query` | POST | NL → Chart + SQL + Intelligence |
| `/diagnose` | POST | Trigger Causal Nexus Forensic Analysis |
| `/schema` | GET | Fetch the Sentinel Map (Blueprint) |
| `/data-sources` | GET/POST | Manage database and file connections |
| `/saved-charts` | GET/POST | Manage persistent chart storage |
| `/dashboards` | GET/POST | Create and manage unified views |

---

## ⚖️ License
Enterprise Proprietary. Built by the Lumina AI Engineering Team.
