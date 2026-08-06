# Lovable Prompt — TSP AI Contract (FRONTEND ONLY)

Paste the block below into Lovable as your project instructions. It is deliberately
strict so Lovable builds **only the UI** and never touches the backend.

Your live API base URL (already filled in below): **https://tsp-ai-contract-api.onrender.com**

---

## PASTE THIS INTO LOVABLE

You are building the **frontend only** for an app called **TSP AI Contract** — an AI-assisted
contract review and authoring tool for professional-services firms working with MSAs and SOWs.
The in-app AI assistant is named **Aria**.

### HARD RULES — do not break these
1. **Frontend only.** Build a React + TypeScript + Tailwind single-page app. Do NOT create
   any backend, server, API routes, or serverless/edge functions.
2. **No database.** Do NOT use Supabase, Firebase, Lovable Cloud, or any database. Do NOT
   create tables, schemas, or storage buckets. All data comes from the existing REST API below.
3. **No auth logic of your own.** Do NOT implement password hashing, JWT, or session logic.
   Authentication is done by calling the existing `/api/auth/*` endpoints.
4. **Never invent endpoints or fields.** Only call the endpoints listed under "API CONTRACT".
   If something seems missing, leave a clearly-labelled TODO in the UI — do not build a backend
   workaround.
5. **All server calls go to one base URL** stored in an env var `VITE_API_BASE_URL`
   (value: `https://tsp-ai-contract-api.onrender.com`). Use `fetch` with `credentials: "include"` so the
   session cookie is sent. Never hardcode secrets or API keys in the frontend.

### BRAND
- Product name: **TSP AI Contract**. Assistant name: **Aria** (never "Sue" or "ContractlyPro").
- Aesthetic: professional legal, dark navy palette (base ~#0A0F1F, primary blue ~#1D4ED8),
  clean and enterprise. Sidebar navigation layout.

### SCREENS TO BUILD (Phase 2 core)
1. **Login / Register** — calls `/api/auth/login` and `/api/auth/register`. On success, route
   to Dashboard. Registration collects org name, name, email, password.
2. **Dashboard** — summary cards (total contracts, contracts needing review, high-risk count)
   computed from `GET /api/contracts`; recent contracts list.
3. **Clients** — list + create + edit, using `/api/clients`.
4. **Upload & Analyze** — the core screen. A form with:
   - Client selector (from `GET /api/clients`, plus "Add new client").
   - "Create new contract" vs "New version of existing" toggle.
   - Contract name, document type (MSA | SOW | ChangeOrder | Amendment | NDA | OrderForm | DPA | Other).
   - Parent MSA selector (for SOWs/amendments): "No parent — standalone" or pick a parent MSA.
   - Drag & drop file upload (PDF, DOCX, TXT — max 20MB).
   - Submit posts `multipart/form-data` to `POST /api/analyze` and shows a loading state.
5. **Analysis Results** — after analysis, show: executive summary, overall risk score (0–100
   gauge), a list of clauses (type, severity badge, risk, summary), missing clauses, and
   suggested redlines (original vs suggested). Data comes from the `analysis` in the response
   and from `GET /api/contracts/:id`.
6. **Contract Families** — for a contract, call `GET /api/contracts/:id/family` and render the
   MSA → SOWs/amendments tree.
7. **Aria assistant** — a chat panel that posts to `POST /api/aria/chat` with `{ question,
   contractId? }` and shows `answer`. Label it "informational, not legal advice".
8. **Clause Library** — list/add/delete via `/api/clauses` (the firm's standard positions).

### API CONTRACT (the ONLY endpoints you may call)
Base URL = `VITE_API_BASE_URL`. Always send `credentials: "include"`.

Auth:
- POST `/api/auth/register` body `{ orgName, name, email, password }`
- POST `/api/auth/login` body `{ email, password }`
- POST `/api/auth/logout`
- GET  `/api/auth/me` → `{ user, org }`

Clients:
- GET  `/api/clients` → array
- POST `/api/clients` body `{ name, industry?, jurisdiction?, primaryContact?, primaryEmail?, riskLevel? }`
- PATCH `/api/clients/:id` · DELETE `/api/clients/:id`

Contracts:
- GET  `/api/contracts?clientId=…` → array
- GET  `/api/contracts/:id` → `{ contract, versions, findings }`
- GET  `/api/contracts/:id/family` → nested tree with `children[]`
- POST `/api/contracts` body `{ clientId, name, docType, parentId?, jurisdiction? }`
- PATCH `/api/contracts/:id` · DELETE `/api/contracts/:id`

Analyze:
- POST `/api/analyze` multipart fields: `file`, and either (`clientId`,`name`,`docType`,`parentId?`)
  for a new contract OR `contractId` for a new version. Response `{ contractId, version, analysis }`
  where `analysis = { executiveSummary, riskScore, clauses[], missingClauses[], redlines[], modelUsed }`.
- POST `/api/analyze/text` body `{ contractId, text, changeNote? }`

Aria:
- POST `/api/aria/chat` body `{ question, contractId? }` → `{ answer }`

Clauses:
- GET `/api/clauses` · POST `/api/clauses` body `{ title, clauseType, jurisdiction, body, preferredPosition?, riskLevel? }` · DELETE `/api/clauses/:id`

### ERROR HANDLING
- 401 → redirect to Login. Show API error messages (the API returns `{ error: "..." }`).
- Show loading states on every network call; disable submit buttons while pending.
- File upload: validate type (PDF/DOCX/TXT) and size (≤20MB) client-side before posting.

Build clean, typed, reusable components. Remember: **UI only — the backend already exists.**
