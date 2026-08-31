# QAIbridge

An AI‑driven classical‑to‑quantum simulation platform (FYP). This README covers
**running the project**, **using Modules 6 & 7**, and the **User / Admin roles**.

- **Module 6 – Neural Angle Optimizer** — trains a small quantum classifier two
  ways and shows the "barren plateau" problem and how to beat it.
- **Module 7 – QNN Converter** — turn a classical neural network into an
  equivalent quantum circuit, then train and compare them.

> New to what these modules actually *do*? Read
> [`docs/MODULE_6_7_GUIDE.md`](docs/MODULE_6_7_GUIDE.md) — it explains every
> concept, chart, and file in plain language.

---

## TL;DR — start the app

Open **two** PowerShell terminals in the `qaibridge/` folder:

```powershell
# Terminal 1 — backend (http://localhost:8000)
.\run-backend.ps1

# Terminal 2 — frontend (http://localhost:3000)
.\run-frontend.ps1
```

Then open **http://localhost:3000**.

---

## Two ways to reach Modules 6 & 7

All module pages are **behind login**. Not signed in → you only see Home and About.

**Option 1 — through the full app (needs PostgreSQL + email OTP).**
Register at `/register`, verify the emailed OTP, sign in, then open
**Neural Optimizer** / **QNN Converter** from the nav. This path needs a running
PostgreSQL database and working Gmail SMTP credentials in `backend/.env`
(see [First-time setup](#first-time-setup)).

**Option 2 — straight to the backend API (no login, no database needed).**
The Module 6 & 7 endpoints have no auth. Open **http://localhost:8000/docs**
and call `/api/module6/train`, `/api/module7/convert`,
`/api/module7/train-compare`, etc. directly from the Swagger UI. The server
still needs a `DATABASE_URL` *string* to boot, but the dummy one in
`backend/.env.example` is enough — no real database has to be running.

---

## Two actors: User & Admin

The site has two roles. See [`docs/ACTORS_USER_VS_ADMIN.md`](docs/ACTORS_USER_VS_ADMIN.md)
for the full feature split.

| | **User** | **Admin** |
|---|---|---|
| Signs in via | `/login` (User tab) or the "Get Started" flow | `/login` (Admin tab) — link on the landing page + navbar |
| Sees | the modules and the Solve page | a Dashboard (platform stats) and a Users table |
| Lands on after login | `/app` | `/admin` |

### Creating admin accounts

First run the migration once so the `role` column exists:

```powershell
cd backend
venv\Scripts\python -m alembic upgrade head
```

**The very first admin** — three ways, pick one:

1. **From the website (no CLI):** open **http://localhost:3000/login?as=admin**. While
   no admin exists, the Admin tab shows a *"Create the first administrator"* form.
   Fill it in and you're signed in as admin.
2. **CLI:** `venv\Scripts\python -m scripts.make_admin --email admin@qaibridge.com --username admin --password "ChangeMe123"`
   (creates the account, or **promotes** an existing one if the email already has an account).
3. **API:** `POST /api/auth/admin-setup` with `{username, email, password}` — the same
   one-time endpoint the form uses. Returns `403` once any admin exists.

**More admins after that** — from the dashboard: **Admin → Users → New account**,
set the role to *Admin*. (Or promote an existing user by clicking their role pill.)
`make_admin --list` / `--demote <email>` still work from the CLI.

> Use a real-looking email domain — `.local` addresses are rejected by the email
> validator at login.

**Forgot password** works for both roles — "Forgot password?" on either login tab
(`/forgot-password` for users, `/forgot-password?as=admin` for admins) runs the
same email-OTP → verify → new-password flow. If an admin can't receive email
(e.g. a placeholder address), reset it from the CLI instead:
`venv\Scripts\python -m scripts.make_admin --email <that email> --password "NewPass123"`.

**What's built:** role on the account, admin-only `/api/admin/*` API, the login
toggle, the first-admin setup form, creating accounts from the dashboard, the
admin dashboard, user management (activate/deactivate, change role, delete — with
self-lockout guards), and password reset for both roles.
**Planned next:** content management, feature flags, an audit log — see the actors doc.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11 | 3.12+ may not have matching `torch` wheels |
| Node.js | 18+ | ships with `npm` |
| PostgreSQL | any recent | needed for the account system and every module page (Option 1) |
| Gmail app password | — | needed for registration OTP emails (Option 1); [how to create one](https://support.google.com/accounts/answer/185833) |

---

## First‑time setup

### Backend

The repo already contains a working virtualenv at `backend/venv/` with every
dependency (including CPU‑only `torch`). If it's missing or broken, rebuild it:

```powershell
cd backend
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt
venv\Scripts\python -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
Copy-Item .env.example .env      # then edit .env — real DATABASE_URL + Gmail creds for Option 1
```

For **Option 1** (login), also set in `backend/.env`:
`DATABASE_URL` (a reachable PostgreSQL), `EMAIL_USER` / `EMAIL_PASSWORD`
(Gmail address + 16-char app password), then run `alembic upgrade head` from
`backend/` to create the `users` table.

For **Option 2** (`/docs` only), the dummy values from `.env.example` are enough.

> ⚠️ There is a stray `.venv/` folder at the repo root that is **incomplete**
> (wrong NumPy, no `torch`). Ignore it — always use `backend/venv/`.
> `run-backend.ps1` uses the correct one automatically.

### Frontend

```powershell
cd frontend
npm install
```

---

## Running

### Option A — the helper scripts (recommended)

```powershell
.\run-backend.ps1     # terminal 1
.\run-frontend.ps1    # terminal 2
```

### Option B — manual

```powershell
# backend
cd backend
venv\Scripts\python -m uvicorn main:app --reload --port 8000

# frontend
cd frontend
npm run dev
```

### Option C — Docker (full stack, needs Postgres wired up)

```powershell
docker compose up --build
```

---

## Verifying it works

```powershell
cd backend
venv\Scripts\python -m pytest -q
```

All 64 tests should pass — the quantum simulation kernel, the parameter‑shift
gradient, the barren‑plateau study, every module API, and the admin actor
(role guard, user management, self‑lockout guards).

---

## Where things live

```
qaibridge/
├─ run-backend.ps1 / run-frontend.ps1   ← start scripts
├─ docs/
│  ├─ MODULE_6_7_GUIDE.md               ← Modules 6 & 7: concepts + file-by-file
│  └─ ACTORS_USER_VS_ADMIN.md           ← the User / Admin feature split
├─ backend/
│  ├─ venv/                             ← the Python env to use
│  ├─ main.py                           ← FastAPI app, registers all routers
│  ├─ scripts/make_admin.py             ← create / promote an admin account
│  ├─ app/routers/optimizer.py          ← Module 6 HTTP API  (/api/module6)
│  ├─ app/routers/qnn.py                ← Module 7 HTTP API  (/api/module7)
│  ├─ app/routers/admin.py              ← Admin API          (/api/admin, admin role)
│  ├─ app/routers/auth.py               ← auth + get_current_admin dependency
│  ├─ app/modules/module6_optimizer/    ← Module 6 logic
│  ├─ app/modules/module7_qnn/          ← Module 7 logic
│  └─ tests/                            ← test_module6_*, test_module7_*, test_admin.py
└─ frontend/
   └─ src/
      ├─ pages/Module6Page.tsx / Module7Page.tsx
      ├─ pages/admin/                    ← AdminDashboard, AdminUsers, AdminLayout
      ├─ components/AdminRoute.tsx       ← admin route guard
      ├─ components/module6/ , components/module7/
      └─ api/optimizer.ts / qnn.ts / admin.ts
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `run-backend.ps1` — "virtualenv not found" | Follow **First‑time setup → Backend** to build `backend/venv/`. |
| `... .ps1 cannot be loaded because running scripts is disabled` | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` then re‑run. |
| Backend starts but `import torch` fails | You're on the wrong env. Use `backend\venv\Scripts\python.exe`, not the root `.venv`. |
| `RuntimeError: DATABASE_URL is not set` | `Copy-Item backend\.env.example backend\.env` (the dummy URL lets the server boot for Option 2). |
| `/module6` redirects me to `/login` | Expected — module pages require login. Use Option 1 (register + sign in) or Option 2 (`/docs`). |
| Registration OTP email never arrives | `EMAIL_USER` / `EMAIL_PASSWORD` in `backend/.env` must be a Gmail address + **app password**, not your normal password. |
| Login fails with a DB error | PostgreSQL isn't running / `DATABASE_URL` is wrong, or you haven't run `alembic upgrade head`. |
| "Administrator access required" after admin login | That account's `role` is still `user`. Run `scripts.make_admin --email <that email>` to promote it. |
| `make_admin` → email login later fails (422) | You used a reserved domain like `.local`. Pick e.g. `admin@qaibridge.com`. |
| Admin nav / dashboard missing after promoting | Sign out and back in — the role is baked into the JWT at login. |
| **"Failed to fetch" / "Can't reach the server"** on any auth or module action | The **backend isn't running**. Start it in its own terminal with `.\run-backend.ps1` and check `http://localhost:8000/health` returns `{"status":"healthy"}`. |
| `run-backend.ps1` — "Missing closing '}'" / "string is missing the terminator" | The script picked up a non‑ASCII character (em‑dash, arrow). Keep the `.ps1` files ASCII‑only — Windows PowerShell 5.1 mis‑decodes UTF‑8 punctuation. |
| "Network Error" when clicking Train | Same as "Failed to fetch" — the backend isn't running on port 8000, or started after the page loaded (refresh). |
| Training feels slow (~20 s) | Expected. It runs real gradient descent with parameter‑shift gradients; lower the iteration/qubit sliders to speed it up. |
