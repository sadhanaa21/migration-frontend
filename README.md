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

Then run the core server on port **8000** (this is the port configured for the unified LLM endpoint):

```powershell
cd "C:\Users\Sadhana.Deshmukh\Desktop\AI agent\ai-agent"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Check:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/docs
```

### 3. React Frontend

The `.env` file is already configured. If you need to change the backend API URL, edit:

```powershell
cd "C:\Users\Sadhana.Deshmukh\Desktop\AI agent\migration-frontend"
notepad .env
```

Verify the core API port matches your backend:

```env
VITE_CORE_API_URL=http://127.0.0.1:8000
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

The frontend features an intelligent, conversational chatbot that guides you through the migration setup:

### Enhanced Conversational Experience

1. **Intelligent Onboarding**: The chatbot greets you with a friendly welcome and explains the migration process step-by-step.

2. **Contextual Help System**: 
   - When asked for credentials or connection details, the chatbot detects if you need help
   - Offers detailed guidance on finding SAP URLs, client IDs, Azure storage details, etc.
   - Provides multiple help levels: quick overview, detailed step-by-step, and advanced guidance

3. **Three-Step Configuration**:
   - **Source**: Choose your SAP system (S/4HANA, ECC, Oracle, or Custom)
   - **Cloud**: Select your cloud provider (Azure, AWS, or GCP)
   - **Destination**: Pick the landing service (Azure Blob, ADLS Gen2, Synapse, or Databricks)

4. **Smart Assistance**:
   - "I need help finding these details" - Get step-by-step guidance
   - "I have the details" - Skip help and proceed
   - "Use demo/default" - Quick setup for testing

5. **Real-time Guidance**:
   - **Finding SAP Base URL**: Multiple methods including SAP GUI, Basis team contacts, IT documentation
   - **Azure Storage Setup**: Portal walkthrough, access key retrieval, container creation
   - **Connection Strings**: Security best practices and credential management tips

6. **SAP Agent Integration**:
   - Calls the backend unified LLM endpoint at `http://127.0.0.1:8000/v1/llm/run` with SAP domain routing
   - Natural language request processing
   - Approval-gated operations for data migration
   - Real-time status updates in chat

### Traditional Features

- Collapsible AWS Glue-style catalog rail showing scanned tables
- Table selection with confidence scores and row estimates
- Output format selection (Parquet, JSON, CSV)
- Backend approval workflow with approve/reject actions
- Persistent chat history throughout the session

### Key Improvements

- **More human-like interactions**: The chatbot uses friendly, encouraging language
- **Proactive help**: Offers assistance before users get stuck
- **Educational content**: Teaches users where to find credentials and how systems connect
- **Flexible paths**: Users can get help, use defaults, or provide custom details
- **Security awareness**: Includes tips on credential management and best practices

## Backend Integration

The frontend proxies API calls through Vite:

```text
/api/health       -> CORE_API/health
/api/v1/llm/run   -> CORE_API/v1/llm/run
```

Table discovery is currently frontend-assisted using the dummy SAP API metadata candidates. The approval button calls the unified LLM endpoint in SAP mode and uses the backend approval flow.
