# MyAudit — Global Treasury Agent By Argonauts

An AI-powered financial document reconciliation and treasury management platform. Upload payment proofs (images, PDFs, Excel/CSV bank statements), auto-extract structured data, and reconcile against bank entries using a multi-agent AI pipeline.

---

[Live Demo (May need to let it warm up before using)](https://global-treasury-agent-arg-frontend.vercel.app/login)

## Features

- **Document Ingestion** — Upload receipts, invoices, and payment proofs (JPG/PNG/PDF/XLSX/CSV)
- **AI Extraction** — OCR + LLM vision pipeline extracts amount, currency, date, payer, payee, and description from any document format
- **Bank Statement Parsing** — Smart column detection for CSV/XLSX bank statements with AI fallback for non-standard formats
- **Multi-Currency FX** — Automatic currency conversion to your organisation's base currency
- **AI Reconciliation** — Proactive reconciliation with vendor memory, learned patterns, and adjustment proposals (bank fees, FX spreads, partial payments)
- **ML Decision Agent** — LLM-powered auto-approval and risk assessment with retry logic, confidence degradation, deterministic fallback, and full audit trail
- **Orchestration Agent** — Agentic workflow coordinator that decides which tools to use, in what order, for each reconciliation case
- **Multi-Tenant** — Full organisation isolation with RBAC (VIEWER / APPROVER / ADMIN roles)
- **Governance** — Every AI decision logged to JSONL with full explainability; audit endpoints for compliance review

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLModel, PostgreSQL |
| Frontend | React, TypeScript, Vite |
| AI (text) | Chutes AI — `deepseek-ai/DeepSeek-V3.2-TEE` |
| AI (vision) | Chutes AI — `google/gemma-4-31B-turbo-TEE` |
| AI (reconciliation) | Morpheus AI — `minimax-m2.5` |
| OCR | OCR.space API |
| File storage | Local filesystem (`uploads/`) |
| Auth | JWT (PyJWT), bcrypt / argon2 |
| Infra | Docker Compose |

---

## Project Structure

```
backend/
  app/
    api/routes/              # FastAPI route handlers
    core/                    # Config (Pydantic Settings), security
    utils/                   # Email sending, password reset, org context
    decision_agent.py        # ML auto-approval + risk assessment agent
    extraction.py            # OCR + LLM document data extraction
    ai_insights.py           # Enhanced extraction with semantic categorisation
    orchestration_agent.py   # Agentic reconciliation coordinator
    reconciliation.py        # Basic fuzzy matching reconciliation
    proactive_reconciliation.py  # Memory-aware reconciliation with adjustments
    statement_parser.py      # Bank statement CSV/XLSX parser
    risk.py                  # Journal entry generation helpers
    fx.py                    # Currency conversion
    models.py                # SQLModel database models
    logs/
      decisions.jsonl        # Append-only ML decision audit log
frontend/
  src/
.env                         # Environment variables (see below)
docker-compose.yml
```

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/Wong-WeiJun/Global-Treasury-Agent_Arg.git
cd Global-Treasury-Agent_Arg
cp .env.example .env   # then edit .env
```

### 2. environment variables (local dev)

```env
DOMAIN=localhost

FRONTEND_HOST=http://localhost:5173

# Environment: local, staging, production
ENVIRONMENT=local

PROJECT_NAME="MyAudit"
STACK_NAME=myaudit-project

# Backend
BACKEND_CORS_ORIGINS="http://localhost,http://localhost:5173,https://localhost,https://localhost:5173,http://localhost.tiangolo.com"
SECRET_KEY=changethis
FIRST_SUPERUSER=changethis
FIRST_SUPERUSER_PASSWORD=changethis

# Emails
SMTP_HOST=mailcatcher
SMTP_USER=
SMTP_PASSWORD=
EMAILS_FROM_EMAIL=noreply@myaudit.dev
SMTP_TLS=False
SMTP_SSL=False
SMTP_PORT=1025


# Postgres
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changethis

SENTRY_DSN=

# Configure these with your own Docker registry images
DOCKER_IMAGE_BACKEND=backend
DOCKER_IMAGE_FRONTEND=frontend

#Chutes API key
CHUTES_API_KEY=changethis

S3_BUCKET_NAME=changethis
S3_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=changethis
AWS_SECRET_ACCESS_KEY=changethis
MORPHEUS_API_KEY=changethis
OCRSPACE_API_KEY=changethis
```
---

## 3. Compose Files
 
> ⚠️ The compose files in the repo are configured for deployment. Replace them with the local dev versions before running with Docker.
 
```bash
cp example.compose.yml compose.yml
cp example.compose.override.yml compose.override.yml
cp example.compose.traefik.yml compose.traefik.yml
```
 
---

### 4. Start with Docker Compose

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Backend API | `http://localhost:8000` |
| Frontend | `http://localhost:5173` |
| API Docs (Swagger) | `http://localhost:8000/docs` |

---

## Environment Variables

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROJECT_NAME` | ✅ | — | Shown in email subjects and UI |
| `SECRET_KEY` | ✅ | — | JWT signing key (32+ random chars) |
| `ENVIRONMENT` | | `local` | `local` / `staging` / `production` |
| `FRONTEND_HOST` | | `http://localhost:5173` | Used for email links |

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_SERVER` | ✅ | — | Hostname |
| `POSTGRES_PORT` | | `5432` | Port |
| `POSTGRES_USER` | ✅ | — | Username |
| `POSTGRES_PASSWORD` | ✅ | — | Password |
| `POSTGRES_DB` | | — | Database name |

### AI (Chutes)

| Variable | Required | Default | Description |
|---|---|---|---|
| `CHUTES_API_KEY` | ✅ | — | Chutes AI API key |
| `CHUTES_BASE_URL` | | `https://llm.chutes.ai/v1` | API base URL |
| `CHUTES_MODEL` | | `deepseek-ai/DeepSeek-V3.2-TEE` | Text/tools model |
| `CHUTES_VISION_MODEL` | | `google/gemma-4-31B-turbo-TEE` | Vision/image model |

### Morpheus

| Variable | Required | Default | Description |
|---|---|---|---|
| `MORPHEUS_API_KEY` | ✅ |  | - | API key to user Morpheus for Reconciliation |

### OCR

| Variable | Required | Default | Description |
|---|---|---|---|
| `OCRSPACE_API_KEY` | | `helloworld` | OCR.space API key (`helloworld` is the free test key) |

### S3

| Variable | Required | Default | Description |
|---|---|---|---|
| `S3_BUCKET_NAME` | ✅ | | Name of the S3 bucket |
| `S3_REGION` | ✅ | | AWS region where the bucket is hosted (`ap-southeast-12`) |
| `AWS_ACCESS_KEY_ID` | ✅ | | AWS IAM access key ID |
| `AWS_SECRET_ACCESS_KEY` | ✅ | | AWS IAM secret access key |

---

## API Reference

### Key Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/login/access-token` | Obtain JWT |
| `POST` | `/api/v1/files/upload` | Upload document |
| `POST` | `/api/v1/files/{id}/extract` | Extract data from document |
| `GET` | `/api/v1/files/{id}/download-url` | Get file download URL |
| `POST` | `/api/v1/reconciliation/reconcile` | Reconcile document |
| `POST` | `/api/v1/orchestrated-reconciliation/reconcile` | Agentic reconciliation |
| `GET` | `/api/v1/reconciliation/suggest-matches/{id}` | Suggest bank matches |
| `POST` | `/api/v1/statements/upload` | Upload bank statement |
| `GET` | `/api/v1/decisions/audit-log` | ML decision audit log *(superuser)* |
| `GET` | `/api/v1/decisions/audit-log/{doc_id}` | Decisions for a document *(superuser)* |
| `GET` | `/api/v1/decisions/audit-log/stats/summary` | Decision statistics *(superuser)* |

Full interactive docs at `/docs` (Swagger UI) or `/redoc`.




