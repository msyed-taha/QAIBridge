"""
Application configuration derived from environment variables.

── ADMIN_EMAILS — the administrator allowlist ────────────────────────────────
The single source of truth for *who is allowed to be an administrator*.

An account may hold the "admin" role ONLY if its email address is on this list.
This is enforced in three places so there is no way around it:

  1. Every API path that grants the admin role (dashboard "create account",
     "promote to admin", the one-time first-admin setup) refuses an email
     that is not listed.
  2. `get_current_admin` re-checks on every admin request, so even a row that
     was flipped to role='admin' straight in the database is NOT treated as
     an admin unless its email is also listed.
  3. scripts/make_admin.py refuses too.

Set it in backend/.env as a comma-separated list. Two entry styles:

    ADMIN_EMAILS=alice@gmail.com,bob@gmail.com     # exact addresses
    ADMIN_EMAILS=@mycompany.com                    # any address at a domain

To add or remove an admin later: edit this line, restart the backend, then
promote/demote the account from the dashboard or scripts/make_admin.py.

── OWNER_EMAIL — the protected super-admin (optional) ────────────────────────
One address whose account is always an active admin and cannot be demoted,
deactivated or deleted by any other admin (or by itself). It is implicitly on
the allowlist, its account is promoted automatically, and no admin can create
an account with this email — the owner must sign up (email OTP) themselves.

    OWNER_EMAIL=you@gmail.com
"""
from __future__ import annotations

import os


def _parse_admin_emails(raw: str | None) -> frozenset[str]:
    if not raw:
        return frozenset()
    parts = raw.replace(";", ",").replace("\n", ",").split(",")
    return frozenset(p.strip().lower() for p in parts if p.strip())


ADMIN_EMAILS: frozenset[str] = _parse_admin_emails(os.getenv("ADMIN_EMAILS"))

if not ADMIN_EMAILS:
    raise RuntimeError(
        "ADMIN_EMAILS is not set. Refusing to start without an explicit admin "
        "allowlist. Set it in backend/.env to a comma-separated list of the "
        "email addresses allowed to be administrators (see backend/.env.example)."
    )


OWNER_EMAIL: str = (os.getenv("OWNER_EMAIL") or "").strip().lower()


def is_owner_email(email: str | None) -> bool:
    """True if `email` belongs to the protected owner account (OWNER_EMAIL)."""
    return bool(OWNER_EMAIL) and bool(email) and email.strip().lower() == OWNER_EMAIL


def is_admin_email(email: str | None) -> bool:
    """
    True if `email` is permitted to be an administrator.

    Matches either an exact listed address, or a listed "@domain" entry. The
    owner is always permitted. Referenced (not copied) by callers so tests can
    override ADMIN_EMAILS / OWNER_EMAIL.
    """
    if not email:
        return False
    addr = email.strip().lower()
    if addr in ADMIN_EMAILS or is_owner_email(addr):
        return True
    _, _, domain = addr.partition("@")
    return bool(domain) and f"@{domain}" in ADMIN_EMAILS
