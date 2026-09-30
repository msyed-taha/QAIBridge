"""
Contact Router — the public "Contact us" form.

  POST /api/contact  – anyone (signed in or not) sends a message; admins read
                       them in Admin → Messages (/api/admin/messages).

Nobody's personal email address is published: messages are stored and shown
to admins instead. Spam guards: a hidden honeypot field bots tend to fill in,
length limits, and a small per-address rate limit.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.contact import ContactMessage
from ..models.user import User
from .auth import get_optional_user

router = APIRouter(prefix="/api/contact", tags=["Contact"])

RATE_LIMIT = 5              # messages …
RATE_WINDOW_SECONDS = 900   # … per 15 minutes from one address
_recent: dict[str, deque[float]] = defaultdict(deque)

THANKS = "Thanks for getting in touch — we'll reply to your email as soon as we can."


class ContactRequest(BaseModel):
    name:    str = Field(..., min_length=1, max_length=100)
    email:   EmailStr
    subject: Optional[str] = Field(None, max_length=150)
    message: str = Field(..., min_length=10, max_length=5000)
    website: Optional[str] = None   # honeypot: hidden in the form, so a person leaves it empty

    @field_validator("name", "message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("subject")
    @classmethod
    def tidy_subject(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _allow(key: str) -> bool:
    now = time.monotonic()
    hits = _recent[key]
    while hits and now - hits[0] > RATE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        return False
    hits.append(now)
    return True


@router.post("", status_code=201)
def send_message(
    req: ContactRequest,
    request: Request,
    db: Session = Depends(get_db),
    me: Optional[User] = Depends(get_optional_user),
):
    if req.website:   # a bot filled the hidden field — look successful, store nothing
        return {"message": THANKS}
    if not _allow(_client_key(request)):
        raise HTTPException(429, "You've sent several messages already. Please wait a few minutes and try again.")

    db.add(ContactMessage(
        name=req.name,
        email=str(req.email),
        subject=req.subject,
        message=req.message,
        user_id=me.id if me else None,
    ))
    db.commit()
    return {"message": THANKS}
