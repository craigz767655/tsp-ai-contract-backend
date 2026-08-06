# Deploy Guide — GitHub → Render (step by step)

Written to be followed without prior DevOps experience. ~30 minutes.
You'll do it once; after that, every `git push` redeploys automatically.

---

## Part 1 — Put the code on GitHub

You need: a free GitHub account (github.com) and Git installed (git-scm.com).

1. **Create an empty repo on GitHub.**
   Go to github.com → top-right **+** → **New repository**.
   - Name: `tsp-ai-contract-backend`
   - Visibility: **Private**
   - Do **not** add a README, .gitignore, or license (we already have them).
   - Click **Create repository**. Leave that page open — you'll need the URL it shows.

2. **Push this folder up.** Open a terminal in this
   `tsp-ai-contract-backend` folder and run, one line at a time:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: TSP AI Contract backend"
   git branch -M main
   git remote add origin https://github.com/<YOUR-USERNAME>/tsp-ai-contract-backend.git
   git push -u origin main
   ```
   Replace `<YOUR-USERNAME>`. If asked to log in, use your GitHub username and a
   **Personal Access Token** as the password (GitHub → Settings → Developer settings
   → Personal access tokens → Fine-grained token, give it repo access).

3. Refresh the GitHub page — your files should be there. ✅

---

## Part 2 — Deploy on Render

You need: a free Render account (render.com), signed in with GitHub.

### The easy way (Blueprint — provisions the API *and* the database at once)
1. Render dashboard → **New +** → **Blueprint**.
2. Connect your GitHub and pick `tsp-ai-contract-backend`.
3. Render detects `render.yaml` and shows a web service **and** a Postgres database.
   Click **Apply**. It creates both and wires `DATABASE_URL` and `JWT_SECRET` for you.
4. Open the **tsp-ai-contract-api** service → **Environment** tab and add your keys:
   - `OPENAI_API_KEY` = your OpenAI key (and/or `GEMINI_API_KEY`)
   - `ALLOWED_ORIGINS` = your Lovable URL (add it once you have it, e.g.
     `https://your-app.lovable.app`). You can update this any time.
   Click **Save Changes** (this triggers a redeploy).

### First-time database setup (create the tables)
The database starts empty. Create the tables once:
- In the Render dashboard, open the **tsp-ai-contract-api** service → **Shell** tab, then run:
  ```bash
  npm run db:push
  npm run db:seed     # optional: creates a demo login you can test with
  ```
  (If the Shell tab isn't available on your plan, run the same two commands locally
  with `DATABASE_URL` set to the database's **External** connection string from Render.)

### Confirm it's live
- Open your API URL (e.g. `https://tsp-ai-contract-api.onrender.com`) and add `/api/health`.
  You should see `{"status":"ok","db":true,"ai":true}`.
  - `db:false` → tables not created yet (run `db:push`).
  - `ai:false` → no AI key set yet (add `OPENAI_API_KEY`).

Copy your API base URL — you'll give it to Lovable as `VITE_API_BASE_URL`.

---

## Part 3 — Everyday workflow
- **Change backend code** → I edit files → you `git add . && git commit -m "…" && git push`
  → Render redeploys automatically in a couple of minutes.
- **Change the schema** → after deploy, run `npm run db:push` again (Render Shell) to apply it.
- **Rotate/replace a key** → Render → service → Environment → edit → Save.

## Guardrail: keep the frontend out of the backend
Lovable builds the UI **only**. It must never create its own database, auth, or server
routes — it only calls this Render API. The `LOVABLE_PROMPT.md` file enforces that.
