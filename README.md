# Lumina AI · Intelligent Insights

**Ask questions in plain English. Get charts and dashboards—no SQL required.**

Lumina AI is a universal analytics platform that turns natural language into insights. Connect your **Excel/CSV** or **database** (PostgreSQL, MySQL, SQL Server), ask questions in everyday language, and get instant visualizations (bar, line, pie, table) and saved dashboards.

---

## Features

- **Universal data sources** — Connect PostgreSQL, MySQL, or SQL Server; or upload CSV/Excel files
- **Natural language to SQL** — RAG-powered query generation with schema-aware retrieval (ChromaDB)
- **Smart question suggestions** — AI-generated questions based on your data’s schema and domain
- **Charts & dashboards** — Auto chart type (bar, line, pie, table), save charts, build dashboards
- **Secure** — Encrypted credentials for DB connections; read-only query execution

---

## Tech Stack

| Layer      | Stack |
|-----------|--------|
| **Backend** | Python 3.10+, FastAPI, SQLAlchemy, ChromaDB (RAG), Groq (LLM), Pandas, LlamaIndex |
| **Frontend** | Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query, Plotly/Recharts, Framer Motion |
| **Demo video** | Remotion 4 (optional) |

---

## Project Structure

```
DataAnalyst/
├── agent/                 # Backend API & RAG
│   ├── server.py          # FastAPI app, routes, demo mode
│   ├── agnet_rag.py       # Schema RAG, NL → SQL (hospital demo path)
│   ├── generic_query.py   # DB-agnostic SQL generation
│   ├── data_sources.py    # Data source manager (DB + file upload)
│   ├── smart_questions.py # Schema analysis & question suggestions
│   ├── security.py        # Credential encryption
│   ├── chroma_db/         # ChromaDB persistence (schema embeddings)
│   ├── data/              # Uploaded files → SQLite DBs
│   └── saved_charts.json  # Saved charts (created at runtime)
├── final_frontend/        # Web app (Lumina AI UI)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/         # Analytics, Dashboards, DashboardView
│   │   ├── components/    # Header, ChatInterface, ChartDisplay, DataSourceSelector, etc.
│   │   └── lib/api.ts     # API client (base URL: localhost:8000)
│   └── package.json
├── pitch-video/           # Remotion pitch demo (20s MP4)
│   ├── src/Video.tsx      # Composition (hook → demo → proof → CTA)
│   └── README.md
├── requirements.txt       # Python dependencies
└── README.md             # This file
```

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** (for frontend)
- **MySQL** (for demo mode; optional if you only use file upload or your own DB)
- **Groq API key** (for LLM: [groq.com](https://console.groq.com))

---

## Environment

Create a `.env` in the project root (or in `agent/` if the app runs from there):

```env
# Required for NL → SQL (Groq)
GROQ_API_KEY=your_groq_api_key_here
```

Demo mode uses a built-in MySQL connection to a hospital DB; override in code or use **Connect Database** / **Upload File** in the UI instead.

---

## Quick Start

### 1. Backend (API)

```bash
cd agent
pip install -r ../requirements.txt
# Or: pip install fastapi uvicorn sqlalchemy chromadb llama-index-llms-groq pandas python-dotenv mysql-connector-python openpyxl
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

API: **http://localhost:8000**  
Docs: **http://localhost:8000/docs**

### 2. Frontend (Lumina AI)

```bash
cd final_frontend
npm install
npm run dev
```

App: **http://localhost:5173** (or the port Vite prints)

### 3. Use the app

1. **Data source** — Use the header: **Upload File (CSV/Excel)** or **Connect Database** (PostgreSQL, MySQL, SQL Server). Demo mode may pre-load a hospital DB.
2. **Analytics** — On the home page, type a question (e.g. *“Show me patient admissions by department”*) and get a chart + table.
3. **Dashboards** — Save charts from the sidebar, then create a dashboard from **Dashboards** and open it to view all charts.

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/mode/status` | Active data source |
| POST | `/data-sources/upload` | Upload CSV/Excel |
| POST | `/data-sources/database` | Connect DB (PostgreSQL, MySQL, SQL Server) |
| GET | `/data-sources` | List sources |
| POST | `/data-sources/{id}/activate` | Set active source |
| GET | `/data-sources/{id}/smart-questions` | Get suggested questions |
| POST | `/query` | Natural language query → SQL + chart + result |
| GET/POST/DELETE | `/saved-charts`, `/saved-charts/{id}` | Saved charts |
| POST | `/dashboard/create` | Create dashboard |
| GET/DELETE | `/dashboards`, `/dashboards/{id}` | List / get / delete dashboard |

---

## Pitch Video (Remotion)

A 20s cinematic pitch (logo → demo UI → metrics → CTA) is in `pitch-video/`:

```bash
cd pitch-video
npm install
npm run start   # Preview in Remotion Studio
npm run render  # Export out/demo.mp4
```

See `pitch-video/README.md` for details.

---

## Scripts Reference

| Where | Command | Description |
|-------|--------|-------------|
| `agent/` | `uvicorn server:app --reload --port 8000` | Run API |
| `final_frontend/` | `npm run dev` | Dev server |
| `final_frontend/` | `npm run build` | Production build |
| `pitch-video/` | `npm run render` | Render MP4 |

---

## License

Private / internal use unless otherwise specified.
