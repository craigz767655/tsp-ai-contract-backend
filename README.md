# TSP AI Contract — Backend API

Clean, reliable backend for **TSP AI Contract**, the AI-assisted MSA/SOW review-and-authoring
platform for professional-services firms. The AI assistant is **Aria**.

This is a **pure API** (no frontend). The frontend is built separately in Lovable and calls
these endpoints. The backend deploys to **Render** with a **Render Postgres** database.

## Why this is a rewrite (not the Replit POC)
The Replit prototype was unreliable because it had three competing contract data models,
a fake in-memory storage layer (only users were persisted), mock authentication, and hard
dependencies on Replit that stop it running anywhere else. This backend replaces all of that
with one coherent data model, real Postgres persistence, real JWT auth, and Render-native
deployment. The genuinely good parts of the POC — the AI analysis engine and the file text
extractor — were ported over and hardened (timeouts + retry + provider fallback).

## What's inside
```
src/
  index.ts              Express bootstrap (CORS, logging, error handling)
  db/
    schema.ts           Unified Drizzle schema (10 tables)
    index.ts            Postgres pool + Drizzle client
    seed.ts             Demo org + owner (npm run db:seed)
  auth/                 bcrypt password hashing + JWT cookie sessions
  middleware/           requireAuth / requireRole (server-side org scoping)
  services/
    aria.ts             Aria AI engine (OpenAI primary, Gemini fallback)
    extract.ts          PDF / DOCX / TXT text extraction
  routes/               auth, clients, contracts (MSA/SOW families), analyze, aria, clauses, health
drizzle/                Generated SQL migration
render.yaml             One-click Render blueprint (web service + Postgres)
```

## Data model (10 tables)
`orgs` → `users` → `clients` → `contracts` (self-referencing `parent_id` for MSA→SOW families)
→ `contract_versions` → `findings` (clauses / missing clauses / redlines) → `approvals`,
`notes`, `clause_library` (firm playbook), `audit_logs`. Every table is org-scoped for
multi-tenant isolation, enforced server-side.

## Run locally
```bash
npm install
cp .env.example .env          # then fill DATABASE_URL, JWT_SECRET, an AI key
npm run db:push               # create tables in your Postgres
npm run db:seed               # optional: demo login (demo@tspaicontract.com / ChangeMe123!)
npm run dev                   # http://localhost:5000
```

## API reference
All routes are under `/api`. Auth is a `tsp_session` httpOnly cookie (also accepts
`Authorization: Bearer <token>`). All non-auth routes require authentication and are
automatically scoped to the caller's org.

### Auth
- `POST /api/auth/register` — `{ orgName, name, email, password }` → creates org + owner, sets cookie
- `POST /api/auth/login` — `{ email, password }` → sets cookie, returns `{ user, token }`
- `POST /api/auth/logout`
- `GET  /api/auth/me` — current `{ user, org }`

### Clients
- `GET  /api/clients` · `GET /api/clients/:id`
- `POST /api/clients` — `{ name, industry?, jurisdiction?, primaryContact?, primaryEmail?, riskLevel? }`
- `PATCH /api/clients/:id` · `DELETE /api/clients/:id`

### Contracts (MSA/SOW families)
- `GET  /api/contracts?clientId=…` — list
- `GET  /api/contracts/:id` — contract + versions + latest findings
- `GET  /api/contracts/:id/family` — nested tree (MSA with its SOWs/amendments)
- `POST /api/contracts` — `{ clientId, name, docType, parentId?, jurisdiction? }`
  (`docType`: MSA | SOW | ChangeOrder | Amendment | NDA | OrderForm | DPA | Other)
- `PATCH /api/contracts/:id` · `DELETE /api/contracts/:id`

### Analyze (the core AI action)
- `POST /api/analyze` — `multipart/form-data`: `file` + `clientId, name, docType, parentId?`
  (new contract) **or** `contractId` (adds a new version to an existing contract).
  Extracts text → runs Aria → stores a version + findings → returns `{ contractId, version, analysis }`.
- `POST /api/analyze/text` — `{ contractId, text, changeNote? }` for pasted text.

### Aria assistant
- `POST /api/aria/chat` — `{ question, contractId? }` → `{ answer }` (grounded in the contract when given)

### Clause library (firm playbook)
- `GET /api/clauses` · `POST /api/clauses` · `DELETE /api/clauses/:id`

### Health
- `GET /api/health` — `{ status, db, ai }` (used by Render's health check)

## Environment variables
See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`. At least one of
`OPENAI_API_KEY` / `GEMINI_API_KEY` is required for analysis. `ALLOWED_ORIGINS` must include
your Lovable frontend URL.
