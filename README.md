# MyAudit (The Global Treasury Agent)

> Multi-Agent Financial Operations Intelligence Platform for Autonomous Cross-Border Reconciliation

---

# Overview

AI Treasury Operations Platform is an enterprise-inspired multi-agent financial intelligence system designed to automate treasury workflows for organizations handling cross-border payments, invoices, receipts, and bank transactions.

The platform combines:
- AI-powered document extraction
- Multi-currency reconciliation
- Historical FX normalization
- Autonomous matching agents
- Human-in-the-loop approval workflows
- Exception intelligence
- Investigation and risk analysis
- Collaborative organization workspaces

The system is designed to simulate a modern AI-native treasury operations environment with explainable AI, auditability, and operational intelligence.

---

# Core Features

## AI Document Extraction
- OCR-based extraction from invoices, receipts, and payment proofs
- Structured financial field extraction
- Currency detection
- Confidence scoring
- AI-enhanced parsing and interpretation

---

## Autonomous Reconciliation Engine
- AI fuzzy matching
- Smart transaction linking
- Historical FX normalization
- Confidence-based recommendations
- Duplicate transaction detection

### AI Result Types
- MATCHED
- FUZZY_MATCH
- UNMATCHED

---

## Human-in-the-Loop Treasury Workflow

Treasury operators can:
- Approve reconciliations
- Flag transactions for investigation
- Mark discrepancies as acceptable exceptions

### Workflow Statuses
- PENDING_ACTION
- APPROVED
- UNDER_REVIEW
- EXCEPTION_APPROVED
- REJECTED

---

## Exception Intelligence System

Supports intelligent handling of:
- FX differences
- Bank fees
- Partial payments
- Refunds
- Split payments
- Manual adjustments

---

## Multi-Currency Treasury Engine
- Historical FX conversion
- Organization base currencies
- Currency normalization
- FX analytics
- Cross-border payment intelligence

---

## Organization & Team Management
- Multi-tenant organization system
- Organization switching
- Invite-based collaboration
- Role-based access control
- Team activity tracking

### Roles
- OWNER
- ADMIN
- FINANCE_MANAGER
- ANALYST
- VIEWER

---

## AI Investigation & Risk Analysis
- Suspicious transaction detection
- Risk scoring
- Payer anomaly detection
- Duplicate payment analysis
- AI-generated investigation summaries

---

## AI Analytics & Learning
- Approval pattern analysis
- Auto-match optimization
- Exception trend detection
- Treasury insights
- Operational intelligence

---

# Technology Stack and Features

## Backend
- ⚡ FastAPI for the Python backend API
- 🧰 SQLModel for ORM and database interactions
- 🔍 Pydantic for validation and settings management
- 💾 PostgreSQL as the relational database
- 🔒 Secure password hashing
- 🔑 JWT authentication
- 📫 Email-based password recovery
- ✅ Pytest testing framework

---

## Frontend
- 🚀 React frontend
- 💃 TypeScript + Hooks + Vite
- 🎨 Tailwind CSS + shadcn/ui
- 🤖 Automatically generated frontend API client
- 🧪 Playwright E2E testing
- 🦇 Dark mode support

---

## Infrastructure
- 🐋 Docker Compose for development and production
- 📞 Traefik reverse proxy / load balancer
- 📬 Mailcatcher for local email testing
- 🚢 Deployment-ready Docker setup
- 🏭 GitHub Actions CI/CD workflows

---

## AI & Financial Services
- AWS Textract for OCR extraction
- Chutes AI for intelligent document understanding
- Morpheus AI for reconciliation intelligence
- Frankfurter FX API for historical exchange rates

---

# Multi-Agent Architecture

## Document Extraction Agent
Handles:
- OCR
- Structured extraction
- Currency recognition
- Confidence scoring

---

## FX Normalization Agent
Handles:
- Historical exchange rates
- Currency conversion
- Base currency alignment

---

## Reconciliation Agent
Handles:
- AI fuzzy matching
- Confidence scoring
- Transaction linking
- Duplicate detection

---

## Risk & Investigation Agent
Handles:
- Fraud indicators
- Suspicious payer analysis
- Risk scoring
- Investigation summaries

---

## Exception Intelligence Agent
Handles:
- FX spread analysis
- Bank fee detection
- Partial payment analysis
- Exception classification

---

## Analytics & Learning Agent
Handles:
- Operational insights
- AI learning
- Trend analysis
- Workflow optimization

---

# Dashboard Features

## Executive Overview
- Total reconciled value
- Auto-match rate
- Pending investigations
- Exception counts
- High-risk alerts

---

## Operational Queue
- Transactions requiring review
- Risk prioritization
- Investigation workflows

---

## FX Analytics
- Currency distribution
- FX exposure
- Historical conversion tracking
- FX anomaly detection

---

## AI Attention Center
AI-generated operational alerts:
- Suspicious transactions
- Recurring discrepancies
- Duplicate payment warnings
- Exception trends

---

# Human Review Workflow

## Approve
Marks reconciliation as approved and updates audit logs.

---

## Flag for Review
Creates investigation cases for manual review.

---

## Mark as Exception
Accepts discrepancies with structured justification.

---

# Multi-Tenant Organization System

Each organization includes:
- Base currency
- Timezone
- FX provider
- Team members
- Role permissions

All financial operations are organization-scoped.

---

# Security Features

- JWT authentication
- Role-based access control
- Organization isolation
- Audit logging
- Secure password hashing
- Protected API routes

---

# Project Structure

```text
backend/
frontend/
docker/
scripts/
```

---

# Running the System

## Prerequisites

Install:
- Docker
- Docker Compose
- Bun
- Python 3.11+
- UV package manager

---

# Environment Setup

Create a `.env` file:

```env
# Domain
# This would be set to the production domain with an env var on deployment
# used by Traefik to transmit traffic and aqcuire TLS certificates
DOMAIN=localhost
# To test the local Traefik config
# DOMAIN=localhost.tiangolo.com

# Used by the backend to generate links in emails to the frontend
FRONTEND_HOST=http://localhost:5173
# In staging and production, set this env var to the frontend host, e.g.
# FRONTEND_HOST=https://dashboard.example.com

# Environment: local, staging, production
ENVIRONMENT=local

PROJECT_NAME="MyAudit"
STACK_NAME=MyAudit-Project

# Backend
BACKEND_CORS_ORIGINS="http://localhost,http://localhost:5173,https://localhost,https://localhost:5173,http://localhost.tiangolo.com"
SECRET_KEY=changethis
FIRST_SUPERUSER=changethis
FIRST_SUPERUSER_PASSWORD=changethis

# Emails (This configuration is for development)
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

#Chutes
CHUTES_API_KEY=your-key

#S3 Access Configurations
S3_BUCKET_NAME=your-bucket-name
S3_REGION=ap-southeast-2
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-key

#Morpheus
MORPHEUS_API_KEY=your-key
```

---

# Start Full Stack (Recommended)

```bash
docker compose watch
```

---

# Access Services

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Adminer | http://localhost:8080 |
| Traefik Dashboard | http://localhost:8090 |
| Mailcatcher | http://localhost:1080 |

---

# Frontend Development

```bash
bun install
bun run dev
```

---

# Backend Development

```bash
cd backend

uv sync

source .venv/bin/activate

fastapi dev app/main.py
```

---

# Database Migrations

```bash
docker compose exec backend bash

alembic revision --autogenerate -m "migration"
alembic upgrade head
```

---

# Running Tests

## Backend Tests

```bash
bash ./scripts/test.sh
```

---

## Frontend E2E Tests

```bash
bun run test
```

---

# Generate Frontend API Client

After backend API changes:

```bash
bash ./scripts/generate-client.sh
```

---

# Deployment

The project supports deployment using Docker Compose with:
- Traefik reverse proxy
- Automatic HTTPS
- GitHub Actions CI/CD

---

# Database Entities

Core entities:
- Users
- Organizations
- Memberships
- Transactions
- Reconciliations
- Investigations
- Exceptions
- Audit Logs

---

# System Vision

This platform is designed to evolve beyond traditional reconciliation software into an:

> AI Treasury Operations Operating System

The long-term goal is to create an intelligent financial operations platform capable of:
- autonomous reconciliation
- treasury intelligence
- operational risk analysis
- financial anomaly detection
- collaborative finance workflows

while maintaining:
- explainability
- auditability
- human oversight

---


# License

MIT License
