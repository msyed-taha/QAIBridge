"""
Legal settings that the Privacy Policy and Terms of Use (frontend /privacy,
/terms) promise — keep the two in step.

  * TERMS_VERSION — the effective date of the current Terms/Privacy Policy.
    Stored with each account when its owner accepts them at sign-up.
  * Retention — self-deleted accounts (with their run history, via the
    database's ON DELETE CASCADE) are erased for good after 30 days; Contact-
    form messages after 12 months. `purge_expired` enforces both; it runs at
    startup, once a day, and before sign-up so an expired account is never
    restored.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from .models.contact import ContactMessage
from .models.user import User

TERMS_VERSION = "2026-10-01"   # keep equal to EFFECTIVE_DATE in frontend/src/legal.ts

DELETED_ACCOUNT_RETENTION_DAYS = 30
CONTACT_MESSAGE_RETENTION_DAYS = 365


def purge_expired(db: Session, now: Optional[datetime] = None) -> dict[str, int]:
    """Permanently erase data that is past its retention period. Returns counts."""
    now = now or datetime.now(timezone.utc)
    accounts = (
        db.query(User)
        .filter(User.deleted_at.isnot(None),
                User.deleted_at < now - timedelta(days=DELETED_ACCOUNT_RETENTION_DAYS))
        .delete(synchronize_session=False)
    )
    messages = (
        db.query(ContactMessage)
        .filter(ContactMessage.created_at < now - timedelta(days=CONTACT_MESSAGE_RETENTION_DAYS))
        .delete(synchronize_session=False)
    )
    if accounts or messages:
        db.commit()
    return {"accounts": accounts, "messages": messages}
