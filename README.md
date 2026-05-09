# AI Data Lake Migration Frontend

React frontend for the local `ai-agent` and `dummy_sap` services.

This repo is intentionally separate from the backend repos:

```text
AI agent/
  ai-agent/              core FastAPI tool and agent server
  dummy_sap/             mock SAP S/4 OData server
  migration-frontend/    React UI
```

## Prerequisite

Install Node.js LTS first if `node --version` or `npm --version` is not recognized.

## Run Commands

Open three PowerShell terminals.

### 1. Dummy SAP Server

Use the port that worked on your machine. Example with `8011`:

```powershell
cd "C:\Users\Sadhana.Deshmukh\Desktop\AI agent\dummy_sap"
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8011 --reload
```

Check:

```text
http://127.0.0.1:8011/
```

### 2. Core AI Agent Server

Make sure `ai-agent\.env` points to the dummy SAP port:

```env
SAP_NGROK_BASE_URL=http://127.0.0.1:8011
SAP_API_USERNAME=demo
SAP_API_PASSWORD=demo123
```

Then run the core server on the port that worked on your machine. Example with `8010`:

```powershell
cd "C:\Users\Sadhana.Deshmukh\Desktop\AI agent\ai-agent"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

Check:

```text
http://127.0.0.1:8010/health
```

### 3. React Frontend

Create `.env.local`:

```powershell
cd "C:\Users\Sadhana.Deshmukh\Desktop\AI agent\migration-frontend"
Copy-Item .env.example .env.local
notepad .env.local
```

Set the core API port:

```env
VITE_CORE_API_URL=http://127.0.0.1:8010
```

Install and run:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## UI Flow

1. Welcome page
2. Source system selection and SAP credentials
3. Cloud provider selection
4. Destination warehouse and credentials
5. Review and connection checks
6. AI scan with chatbot-style prompts
7. Approval and upload action

## Backend Integration

The frontend proxies API calls through Vite:

```text
/api/health       -> CORE_API/health
/api/v1/sap/run   -> CORE_API/v1/sap/run
```

The AI scan table discovery is currently frontend-assisted using the dummy SAP API catalog and metadata candidates. The approval button calls the existing SAP agent endpoint and uses the backend approval flow.