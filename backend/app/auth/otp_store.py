"""
In-memory OTP store with expiry and attempt limiting.
Each entry lives for OTP_EXPIRY_MINUTES then is discarded.

Codes come from the `secrets` module (a cryptographically secure generator,
unlike `random`) and are compared in constant time.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

OTP_EXPIRY_MINUTES = 10
MAX_ATTEMPTS       = 5

# { email: { otp, expires_at, verified, attempts } }
_store: dict[str, dict] = {}


def generate(email: str) -> str:
    """Create a new 5-digit OTP for *email* and return it."""
    otp = f"{10000 + secrets.randbelow(90000)}"
    _store[email] = {
        "otp":        otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        "verified":   False,
        "attempts":   0,
    }
    return otp


def verify(email: str, otp: str) -> tuple[bool, str]:
    """
    Verify *otp* for *email*.
    Returns (True, '') on success or (False, error_message) on failure.
    """
    entry = _store.get(email)

    if not entry:
        return False, "No code found for this email. Please request a new one."

    if datetime.utcnow() > entry["expires_at"]:
        _store.pop(email, None)
        return False, "This code has expired. Please request a new one."

    if entry["attempts"] >= MAX_ATTEMPTS:
        _store.pop(email, None)
        return False, "Too many wrong attempts. Please request a new code."

    entry["attempts"] += 1

    if not secrets.compare_digest(entry["otp"], otp.strip()):
        remaining = MAX_ATTEMPTS - entry["attempts"]
        return False, f"Incorrect code. {remaining} attempt(s) remaining."

    entry["verified"] = True
    return True, ""


def is_verified(email: str) -> bool:
    """Return True if the email's OTP was successfully verified."""
    entry = _store.get(email)
    return bool(entry and entry.get("verified"))


def clear(email: str) -> None:
    """Remove the OTP entry after successful registration."""
    _store.pop(email, None)
