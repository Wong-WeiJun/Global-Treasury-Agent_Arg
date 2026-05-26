# MyAudit — Global Treasury Agent

An AI-powered financial document reconciliation and treasury management platform. Upload payment proofs (images, PDFs, Excel/CSV bank statements), auto-extract structured data, and reconcile against bank entries using a multi-agent AI pipeline.

---

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
| OCR | OCR.space API |
| File storage | Local filesystem (`uploads/`) |
| Email | Gmail SMTP via `aiosmtplib` / Resend REST API |
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
git clone <repo>
cd Global-Treasury-Agent_Arg
cp .env.example .env   # then edit .env
```

### 2. Minimum required variables (local dev)

```env
PROJECT_NAME=MyAudit
SECRET_KEY=<random 32-char string>
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=<password>
POSTGRES_SERVER=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<password>
POSTGRES_DB=app
s3_bucket_name=unused        # required by config but unused locally
CHUTES_API_KEY=<your key>
EMAIL_DEV_MODE=true          # skips real email sending in local dev
```

### 3. Start with Docker Compose

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
| `DATABASE_URL` | | — | Full DSN (overrides individual fields) |

### AI (Chutes)

| Variable | Required | Default | Description |
|---|---|---|---|
| `CHUTES_API_KEY` | ✅ | — | Chutes AI API key |
| `CHUTES_BASE_URL` | | `https://llm.chutes.ai/v1` | API base URL |
| `CHUTES_MODEL` | | `deepseek-ai/DeepSeek-V3.2-TEE` | Text/tools model |
| `CHUTES_VISION_MODEL` | | `google/gemma-4-31B-turbo-TEE` | Vision/image model |

### OCR

| Variable | Required | Default | Description |
|---|---|---|---|
| `OCRSPACE_API_KEY` | | `helloworld` | OCR.space API key (`helloworld` is the free test key) |

### Email

| Variable | Required | Default | Description |
|---|---|---|---|
| `EMAIL_DEV_MODE` | | `false` | `true` = log to console, skip sending (local dev) |
| `EMAIL_PROVIDER` | | `smtp` | `smtp` or `resend` |
| `EMAILS_FROM_EMAIL` | ✅* | — | Sender address |
| `EMAILS_FROM_NAME` | | project name | Sender display name |
| `SMTP_HOST` | ✅* | — | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | | `587` | 587 = STARTTLS, 465 = implicit SSL |
| `SMTP_TLS` | | `true` | Enable STARTTLS (Gmail port 587) |
| `SMTP_SSL` | | `false` | Implicit SSL (port 465) |
| `SMTP_USER` | | — | SMTP username |
| `SMTP_PASSWORD` | | — | SMTP password / Gmail App Password |
| `RESEND_API_KEY` | ✅* | — | Resend API key (when `EMAIL_PROVIDER=resend`) |

\* Required when `EMAIL_DEV_MODE=false`

#### Gmail setup

1. Enable 2-Step Verification on your Google account
2. Go to **Google Account → Security → App Passwords**
3. Generate a 16-character App Password
4. Use that as `SMTP_PASSWORD` (not your regular Gmail password)

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_TLS=true
SMTP_USER=you@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
EMAILS_FROM_EMAIL=you@gmail.com
```

---

## AI Pipeline

### Document Extraction

```
Upload
  → OCR.space (optional text hint)
  → Chutes vision LLM
  → structured JSON {amount, currency, date, payer, payee, description}
```

OCR is best-effort — if it fails the vision model handles it directly.

### Reconciliation

```
Proof document + bank entries
  → FX conversion (if needed)
  → vendor history + learned patterns lookup
  → proactive reconciliation (Chutes LLM with memory)
  → ML Decision Agent (auto-approve or escalate)
  → ReconciliationRecord (audit trail)
```

### ML Decision Agent

The decision agent (`decision_agent.py`) replaces all script-based approval logic:

- **Retry logic** — 3 attempts with exponential backoff (1 s → 2 s → 4 s)
- **Confidence degradation** — max confidence ceiling drops 10 % per retry (1.00 → 0.90 → 0.80)
- **Hard gates** (server-enforced, LLM cannot override):
  - `confidence ≥ 0.80` AND `risk_score < 40` required for auto-approval
- **Deterministic fallback** — if all LLM attempts fail, rule-based scoring takes over (conservative: only auto-approves if `risk < 15 AND score ≥ 0.95`)
- **Audit log** — every decision written to `logs/decisions.jsonl` with full reasoning, risk factors, method, latency, and attempt count

### Risk Score Reference

| Factor | Condition | Points |
|---|---|---|
| Amount deviation | > 20 % | +40 |
| Amount deviation | > 10 % | +25 |
| Amount deviation | > 5 % | +15 |
| Amount deviation | > 2 % | +8 |
| Date gap | > 30 days | +30 |
| Date gap | > 7 days | +20 |
| Date gap | > 2 days | +10 |
| Payer similarity | < 0.50 | +20 |
| Payer similarity | < 0.75 | +10 |
| No vendor history | — | +10 |

`LOW` < 40 · `MEDIUM` 40–69 · `HIGH` ≥ 70

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

---

## Development

### Running locally without Docker

```bash
# Backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

```bash
# Frontend
cd frontend
npm install
npm run dev
```

### Email in local dev

Set `EMAIL_DEV_MODE=true` in `.env` — emails are logged to the backend console instead of being sent. No SMTP configuration needed.

### Viewing the decision audit log

```bash
# Stream live decisions
tail -f backend/logs/decisions.jsonl | python -m json.tool

# Via API (superuser token required)
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/decisions/audit-log?limit=20
```

### Linting and type-checking

```bash
cd backend
ruff check .
mypy .
```

---

## Roles

| Role | Permissions |
|---|---|
| `VIEWER` | Read-only access to documents and reconciliations |
| `APPROVER` | Can manually approve / reject reconciliations |
| `ADMIN` | Full access including user and statement management |
| Superuser | Governance endpoints (decision audit log, stats) |

---

## License

MIT
