# Two Actors: User & Admin

A design note for the **Admin** actor in QAIbridge alongside the existing
**User**. Written to resolve "the project is for users — what does admin even do?"

> **Status (2026-08-28):** the core is now implemented — `role` on the account,
> an admin-only `/api/admin/*` API, a User/Admin toggle on the login page, an
> `/admin` area with a stats dashboard + user management (activate/deactivate,
> change role, delete, with self-lockout guards), and **password reset ("forgot
> password") for both roles** (`/forgot-password` and `/forgot-password?as=admin`).
> Create the first admin with `backend/scripts/make_admin.py` (see the
> [README](../README.md#two-actors-user--admin)). Content management, feature
> flags, and the audit log are **not yet built** — they're marked below.

---

## 1. Clearing up the confusion

You built a **single-actor product**, and that instinct was right — every quantum
feature is something a **user** does for themselves. So it feels like there's
nothing left for an **admin**.

The admin is **not a second kind of user**. The admin keeps the platform
*running and trustworthy*: decides who gets in, watches how it's used, keeps the
learning content current, and holds the safety switches. None of that is visible
to a user, and none of it involves a simulation.

> **The test:** if you deleted the admin interface, the app still runs — but
> nobody can deactivate an abusive account, nobody knows the OTP emails started
> failing, the tutorials are frozen in source code, and there's no record of what
> Python people ran through Module 5.

**Tag key:** `built` = already in the codebase · `add` = small change to
something that exists · `new` = new to build · ★ = priority for the FYP.

---

## 2. User interface — actor: *Registered User*

The learner / researcher. Signs in, uses the modules, keeps their own work.

### Account & access
| | Feature |
|---|---|
| `built` | Register → email-OTP verification → login (JWT) → forgot / reset password |
| `built` | Public landing & About pages; protected app area |
| `add` | Profile page — change password, delete my own account |
| `add` | Resend OTP; graceful session-expiry handling |

### The modules
| | Feature |
|---|---|
| `built` | **M1** Simulation Kernel — build a circuit, RAM check, live progress |
| `built` | **M2** SFOD comparison suite + guided tutorial |
| `built` | **M3** educational circuit builder |
| `built` | **M4** architecture recommender |
| `built` | **M5** classical → quantum code transformer (runs the user's Python) |
| `built` | **M6** Neural Angle Optimizer · **M7** QNN Converter |
| `built` | Solve page — pick a problem, upload PDF/DOCX/CSV, run classical vs quantum |

### Keeping their work
| | Feature |
|---|---|
| `new` | My history — a list of my past runs, re-openable |
| `new` | Download a run as a report (PDF / JSON) |
| `new` | Save / bookmark a circuit or conversion |
| `new` | Submit feedback / report a bug → goes to the admin inbox |

> The user side is essentially done. Don't put admin-style controls here.

---

## 3. Admin interface — actor: *Platform Administrator*

Keeps the platform healthy. Never runs a simulation. One seeded account to start.

### ★ User management — *do first*
| | Feature |
|---|---|
| `new` | All-users table: username, email, joined, active, role, last login — search, filter, pagination |
| `add` | Activate / deactivate an account — the `is_active` flag already exists, it just needs a screen |
| `new` | Change a user's role; delete a user; force a password reset or re-send verification |

### ★ Usage analytics — *feeds your evaluation chapter*
| | Feature |
|---|---|
| `new` | Totals: users, active this week, new this month |
| `new` | Runs per module, runs over time, avg duration & failure rate |
| `new` | Largest qubit counts requested; memory-limit rejections (M1 already computes these) |
| `new` | Needs a `usage_events` table + one `log_event()` helper |

### ★ Content management — *makes "educational" real*
| | Feature |
|---|---|
| `new` | Edit the M2 tutorial steps, M5 example snippets, the AppHome "Did You Know" facts, Solve/M1 presets, About text — all hard-coded today |
| `new` | Post an announcement banner |

### Configuration & safety
| | Feature |
|---|---|
| `new` | Global limits: max qubits, max training iterations, rate limits |
| `new` | Feature flags — enable / disable any module |
| `new` | Kill-switch for M5 code execution (it runs arbitrary Python via `subprocess`) |
| `new` | Maintenance mode + message |

### Security & audit log
| | Feature |
|---|---|
| `new` | Chronological log: logins, failed logins, registrations, resets, every admin action |
| `new` | M5 execution log — who ran what code, when, outcome |
| `new` | OTP / email delivery: sent vs failed (surface the SMTP errors the code already raises) |

### Feedback & support
| | Feature |
|---|---|
| `new` | Inbox of user bug reports / feedback; mark resolved |

---

## 4. Build the admin, in order

`[x]` = done · `[ ]` = not yet.

- `[x]` **1. Model the role.** `role` (`"user"` default / `"admin"`) + `last_login_at`
  on `User` (`backend/app/models/user.py`), migration
  `b1a2c3d4e5f6_add_user_role_and_last_login.py`.
- `[x]` **2. Create the first admin.** Three ways: the *"Create the first
  administrator"* form on the Admin login tab (`POST /api/auth/admin-setup`,
  self-disables once an admin exists), `backend/scripts/make_admin.py` (create or
  promote; `--list` / `--demote`), or the API directly. More admins after that:
  **Admin → Users → New account** (`POST /api/admin/users`).
- `[x]` **3. Backend auth plumbing.** `role` in the JWT; `get_current_admin` in
  `auth.py`; `role` on `UserOut`; `last_login_at` set on login.
- `[ ]` **4. Usage logging.** `usage_events` table + a `log_event()` helper or
  middleware. *(dashboard currently shows account stats only, not per-module runs)*
- `[~]` **5. Admin API router.** `backend/app/routers/admin.py`, all routes under
  `Depends(get_current_admin)`: `stats`, `users` list/patch/delete **done**;
  `usage` / `content` / `config` / `audit` **not yet**.
- `[~]` **6. Frontend.** `AuthContext.isAdmin`, `AdminRoute`, `/admin` +
  `/admin/users`, `AdminLayout` tabs, login toggle, navbar/landing entry points
  **done**. Analytics / Content / Settings / Audit tabs **not yet**.
- `[ ]` **7. Migrate the hard-coded content** into `content` rows.
- `[~]` **8. Tests & docs.** `backend/tests/test_admin.py` (8 tests) **done**.
  SRS use-case diagram + `FR-ADMIN-*` requirements **still to update**.

---

## 5. Scope for the FYP

| Area | Status | Notes |
|---|---|---|
| User management | **done** | Table, search, activate/deactivate, role change, delete + self-lockout guards |
| Account stats dashboard | **done** | Totals, admins, new/active in last 7 days, recent signups |
| Per-module usage analytics | **todo** | Needs step 4 (`usage_events`) |
| Content management | **todo** | Facts + M5 examples editable from the DB, banner |
| Config & safety | **todo** | Feature flags + M5 kill-switch |
| Security & audit log | **todo** | Auth events + admin actions + M5 executions |
| Feedback & support | **future work** | Planned extension |

---

## 6. What was added (reference)

**Backend**
- `app/models/user.py` — `role`, `last_login_at`, `is_admin` property, `ROLE_*` constants
- `migrations/versions/b1a2c3d4e5f6_add_user_role_and_last_login.py`
- `app/routers/auth.py` — `get_current_admin`; `role` in the JWT; `last_login_at` on login
- `app/auth/schemas.py` — `UserOut.role`
- `app/routers/admin.py` — `GET /api/admin/stats`, `GET/POST/PATCH/DELETE /api/admin/users[/{id}]`
- `app/routers/auth.py` — `GET /api/auth/admin-setup-status`, `POST /api/auth/admin-setup` (first admin only)
- `app/auth/schemas.py` — `AdminCreateUserRequest`, `AdminSetupRequest`
- `scripts/make_admin.py` — seed / promote / demote / list admins (also `--password` to reset)
- `tests/test_admin.py`, `tests/test_forgot_password.py` (forgot-password works for user *and* admin)
- forgot-password endpoints already existed in `auth.py` and are role-agnostic — no change needed

**Frontend**
- `context/AuthContext.tsx` — `role` on `User`, `isAdmin`
- `components/AdminRoute.tsx` — guard
- `pages/LoginPage.tsx` — User / Admin toggle, role-based redirect, "Forgot password?" on both tabs, first-admin setup form
- `pages/FirstAdminSetup.tsx` — the one-time "create the first administrator" form
- `pages/ForgotPasswordPage.tsx` — role-aware (`?as=admin` theming + returns to the right login tab)
- `pages/admin/` — `AdminLayout`, `AdminDashboard`, `AdminUsers`, `CreateAccountForm` (Users -> New account)
- `api/client.ts` — `detailToMessage()` (fixes `[object Object]` on 422 errors)
- `api/admin.ts`, `types/index.ts` (`AdminUser`, `AdminStats`)
- `App.tsx` routes; `Navbar.tsx` role-aware nav; `Home.tsx` admin entry point

```python
# app/routers/auth.py
def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required.")
    return current_user
```
