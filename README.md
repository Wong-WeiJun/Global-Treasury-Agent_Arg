# MyAudit — Global Treasury Agent

> Multi-Agent Financial Operations Intelligence Platform for Autonomous Cross-Border Reconciliation

An enterprise-grade platform that automates treasury workflows by combining AI-powered document extraction, multi-currency reconciliation, and human-in-the-loop approval workflows.

---

## Features

- **AI Document Extraction** — OCR via AWS Textract and Chutes AI; structured field parsing with confidence scoring
- **Autonomous Reconciliation** — Fuzzy matching and smart transaction linking powered by Morpheus AI
- **Multi-Currency Support** — Historical FX normalization via Frankfurter API with organization-specific base currencies
- **Human-in-the-Loop Approvals** — Treasury operators approve, reject, or escalate every AI decision with full audit trails
- **Exception Intelligence** — Handles FX differences, bank fees, partial payments, refunds, and split payments
- **Risk & Fraud Analysis** — Suspicious transaction detection, risk scoring, and payer anomaly detection
- **Multi-Tenant RBAC** — Organization-scoped data isolation with 5 user roles (Owner, Admin, Finance Manager, Analyst, Viewer)
- **Analytics & Learning** — Approval pattern analysis, auto-match rate optimization, and exception trend reporting

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI (Python), SQLModel, PostgreSQL, Alembic |
| **Frontend** | React 19, TypeScript, Vite, TanStack Router / Query / Table |
| **UI** | Tailwind CSS 4, shadcn/ui, Radix UI, dark mode |
| **AI / ML** | Chutes AI (extraction), Morpheus AI (reconciliation), AWS Textract (OCR) |
| **Storage** | AWS S3 |
| **FX Rates** | Frankfurter API |
| **Infrastructure** | Docker Compose, Traefik (reverse proxy + TLS), GitHub Actions |
| **Testing** | Pytest, Playwright E2E |

---

## Project Structure

```
Global-Treasury-Agent_Arg/
├── backend/
│   └── app/
│       ├── api/routes/          # REST endpoints
│       ├── core/                # Config, database session, security
│       ├── models.py            # SQLModel entity definitions
│       ├── reconciliation.py    # Reconciliation engine
│       ├── extraction.py        # Document extraction pipeline
│       ├── statement_parser.py  # Financial statement parsing
│       ├── fx.py                # FX rate handling
│       ├── risk.py              # Risk & fraud analysis
│       ├── ai_learning.py       # Analytics & learning agent
│       ├── proactive_reconciliation.py
│       ├── crud.py
│       ├── main.py              # FastAPI entry point
│       └── alembic/             # Database migrations
├── frontend/
│   └── src/
│       ├── routes/              # Page-level components
│       ├── components/          # Shared UI components
│       ├── client/              # Auto-generated OpenAPI client
│       └── hooks/
├── .github/workflows/           # CI/CD pipelines
├── compose.yml
├── compose.override.yml         # Dev overrides (hot reload)
├── compose.traefik.yml
├── scripts/
│   ├── test.sh
│   ├── generate-client.sh
│   └── test-local.sh
├── development.md
├── deployment.md
└── CONTRIBUTING.md
```

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose v2
- [Bun](https://bun.sh)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Python 3.11+

### Environment Setup

Create a `.env` file in the project root. Key variables:

```env
DOMAIN=localhost
FRONTEND_HOST=http://localhost:5173
ENVIRONMENT=local

PROJECT_NAME="MyAudit"
STACK_NAME=MyAudit-Project

BACKEND_CORS_ORIGINS="http://localhost,http://localhost:5173"
SECRET_KEY=changethis
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=changethis

# Postgres
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changethis

# Email (dev — Mailcatcher)
SMTP_HOST=mailcatcher
SMTP_PORT=1025
SMTP_TLS=False
SMTP_SSL=False
EMAILS_FROM_EMAIL=noreply@myaudit.dev

# AI services
CHUTES_API_KEY=your-key
MORPHEUS_API_KEY=your-key

# AWS S3
S3_BUCKET_NAME=your-bucket-name
S3_REGION=ap-southeast-2
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-key

# Optional
SENTRY_DSN=
```

### Quick Start

```bash
docker compose watch
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Adminer (DB) | http://localhost:8080 |
| Mailcatcher | http://localhost:1080 |
| Traefik Dashboard | http://localhost:8090 |

### Local Development (without Docker)

**Backend:**
```bash
cd backend
uv sync
source .venv/bin/activate   # Windows: .venv\Scripts\activate
fastapi dev app/main.py
```

**Frontend:**
```bash
cd frontend
bun install
bun run dev
```

### Database Migrations

```bash
docker compose exec backend bash
alembic revision --autogenerate -m "describe_change"
alembic upgrade head
```

### Regenerate Frontend API Client

Run this after any backend route changes:

```bash
bash ./scripts/generate-client.sh
```

---

## Testing

```bash
# Backend (Pytest)
bash ./scripts/test.sh

# Frontend E2E (Playwright)
cd frontend && bun run test
```

---

## Multi-Agent Architecture

| Agent | Responsibility |
|---|---|
| **Document Extraction** | OCR, structured field parsing, currency recognition |
| **FX Normalization** | Historical rate lookup, multi-currency conversion |
| **Reconciliation** | Fuzzy matching, confidence scoring, duplicate detection |
| **Risk & Investigation** | Fraud detection, payer anomaly analysis, risk scoring |
| **Exception Intelligence** | FX spread detection, bank fee analysis, partial payment handling |
| **Analytics & Learning** | Operational insights, auto-match optimization, trend analysis |

### Transaction Workflow

```
PENDING_EXTRACTION → EXTRACTED → PENDING_ACTION ┬→ APPROVED
                                                 ├→ UNDER_REVIEW → EXCEPTION_APPROVED
                                                 └→ REJECTED
```

---

## API Reference

All routes are under `/api/v1/`. Interactive docs at `/docs` (Swagger) and `/redoc`.

| Route | Description |
|---|---|
| `POST /login` | Authenticate and receive JWT |
| `GET/POST /users` | User management |
| `GET/POST /organizations` | Multi-tenant org management |
| `GET/POST /memberships` | RBAC membership |
| `POST /invitations` | Team invitation emails |
| `POST /file` | Upload and process financial documents |
| `GET/POST /reconciliation` | Reconciliation workflow |
| `POST /review` | Approve / reject / escalate |
| `GET /fx` | FX rate queries |
| `GET /statements` | Financial statement parsing |
| `POST /chat` | Multi-agent conversation interface |
| `GET /learning` | Analytics and learning data |

---

## Deployment

See [deployment.md](deployment.md) for production setup with Docker Compose, Traefik, and automatic HTTPS via Let's Encrypt. CI/CD pipelines in [.github/workflows/](.github/workflows/) handle automated testing and deployment to staging and production.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, branching strategy, and pull request process.

---

## Security

See [SECURITY.md](SECURITY.md) for the security policy and vulnerability reporting.

- JWT authentication with configurable token expiry
- Argon2/bcrypt password hashing
- Organization-scoped data isolation
- Role-based access control (5 permission tiers)
- Full audit logging of all financial decisions

---

## License

MIT License
