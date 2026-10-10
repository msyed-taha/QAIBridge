"""
Admin Router — the second actor.

Every route here depends on `get_current_admin`, so a normal user's token gets
a 403. Admins are never created through the public /register flow; use
`backend/scripts/make_admin.py` to seed the first one, then admins can promote
others from the dashboard.

Routes:
  GET    /api/admin/stats            – dashboard counters + recent signups
  GET    /api/admin/users            – list users (optional ?search= &role= &active=)
  POST   /api/admin/users            – create an account (user or admin), no email OTP
  PATCH  /api/admin/users/{user_id}  – change is_active and/or role
  DELETE /api/admin/users/{user_id}  – delete a user
  GET    /api/admin/messages         – Contact-form messages, newest first
  GET    /api/admin/messages/unread-count – how many are unread (for the admin menu)
  PATCH  /api/admin/messages/{id}    – mark a message read / unread
  DELETE /api/admin/messages/{id}    – delete a message

The owner account (OWNER_EMAIL in backend/.env) is locked: no admin can change
its role or status, delete it, or create an account with its email.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, computed_field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import is_admin_email, is_owner_email
from ..models.contact import ContactMessage
from ..models.user import User, ROLE_ADMIN, VALID_ROLES
from ..auth.security import hash_password
from ..auth.schemas import AdminCreateUserRequest
from .auth import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])


# ── Response shapes ───────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id:            int
    username:      str
    email:         str
    role:          str
    is_active:     bool
    created_at:    Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    deleted_at:    Optional[datetime] = None   # set when the user deleted their own account

    class Config:
        from_attributes = True

    @computed_field
    @property
    def is_owner(self) -> bool:
        return is_owner_email(self.email)


OWNER_LOCKED = "This is the owner account. Its role, status and account can't be changed."


class AdminStats(BaseModel):
    total_users:     int
    active_users:    int
    inactive_users:  int
    admins:          int
    new_last_7_days: int
    logged_in_last_7_days: int
    unread_messages: int
    recent_signups:  list[AdminUserOut]


class UpdateUserRequest(BaseModel):
    is_active: Optional[bool] = None
    role:      Optional[str]  = None


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)):
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    total    = db.query(func.count(User.id)).scalar() or 0
    active   = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0
    admins   = db.query(func.count(User.id)).filter(User.role == ROLE_ADMIN).scalar() or 0
    new_7d   = db.query(func.count(User.id)).filter(User.created_at >= week_ago).scalar() or 0
    seen_7d  = db.query(func.count(User.id)).filter(User.last_login_at >= week_ago).scalar() or 0
    recent   = db.query(User).order_by(User.created_at.desc()).limit(5).all()

    return AdminStats(
        total_users=total,
        active_users=active,
        inactive_users=total - active,
        admins=admins,
        new_last_7_days=new_7d,
        logged_in_last_7_days=seen_7d,
        unread_messages=db.query(func.count(ContactMessage.id)).filter(ContactMessage.is_read.is_(False)).scalar() or 0,
        recent_signups=[AdminUserOut.model_validate(u) for u in recent],
    )


# ── User list ─────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, description="Match username or email (case-insensitive)"),
    role:   Optional[str] = Query(None, description="Filter by role"),
    active: Optional[bool] = Query(None, description="Filter by active flag"),
):
    q = db.query(User)
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(func.lower(User.username).like(like) | func.lower(User.email).like(like))
    if role:
        q = q.filter(User.role == role)
    if active is not None:
        q = q.filter(User.is_active.is_(active))
    users = q.order_by(User.created_at.desc()).all()
    return [AdminUserOut.model_validate(u) for u in users]


# ── Create a user ─────────────────────────────────────────────────────────────

@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_user(req: AdminCreateUserRequest, db: Session = Depends(get_db)):
    """
    Create an account directly, bypassing the email-OTP signup flow. `role` can
    be "user" or "admin". This is how additional admins are made after the first.
    """
    if db.query(User).filter(func.lower(User.email) == req.email).first():
        raise HTTPException(400, "An account with this email already exists.")
    if is_owner_email(req.email):
        # Otherwise another admin could pick the owner's password and take the account over.
        raise HTTPException(403, "This email is reserved for the owner, who must sign up themselves.")
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(400, "This username is already taken.")
    if req.role == ROLE_ADMIN and not is_admin_email(req.email):
        raise HTTPException(
            403,
            "That email is not on the administrator allowlist. Add it to "
            "ADMIN_EMAILS in backend/.env and restart the backend to create an admin with it.",
        )

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        role=req.role,
        is_active=req.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AdminUserOut.model_validate(user)


# ── Update a user ─────────────────────────────────────────────────────────────

@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    req: UpdateUserRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found.")
    if is_owner_email(target.email):
        raise HTTPException(403, OWNER_LOCKED)
    if target.deleted_at is not None:
        raise HTTPException(
            403,
            "This user deleted their account. Only they can restore it, by signing up again with the same email.",
        )

    if req.role is not None:
        if req.role not in VALID_ROLES:
            raise HTTPException(400, f"role must be one of {sorted(VALID_ROLES)}.")
        if req.role == ROLE_ADMIN and not is_admin_email(target.email):
            raise HTTPException(
                403,
                "That account's email is not on the administrator allowlist. Add it to "
                "ADMIN_EMAILS in backend/.env and restart the backend before promoting it.",
            )
        if target.id == me.id and req.role != ROLE_ADMIN:
            raise HTTPException(400, "You cannot remove your own admin role.")
        if target.role == ROLE_ADMIN and req.role != ROLE_ADMIN and _admin_count(db) <= 1:
            raise HTTPException(400, "Cannot demote the last remaining admin.")
        target.role = req.role

    if req.is_active is not None:
        if target.id == me.id and not req.is_active:
            raise HTTPException(400, "You cannot deactivate your own account.")
        target.is_active = req.is_active

    db.commit()
    db.refresh(target)
    return AdminUserOut.model_validate(target)


# ── Delete a user ─────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found.")
    if is_owner_email(target.email):
        raise HTTPException(403, OWNER_LOCKED)
    if target.id == me.id:
        raise HTTPException(400, "You cannot delete your own account.")
    if target.role == ROLE_ADMIN and _admin_count(db) <= 1:
        raise HTTPException(400, "Cannot delete the last remaining admin.")
    db.delete(target)
    db.commit()
    return None


def _admin_count(db: Session) -> int:
    return db.query(func.count(User.id)).filter(User.role == ROLE_ADMIN).scalar() or 0


# ── Contact-form messages ─────────────────────────────────────────────────────

class ContactMessageOut(BaseModel):
    id:         int
    name:       str
    email:      str
    subject:    Optional[str] = None
    message:    str
    user_id:    Optional[int] = None
    is_read:    bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UpdateMessageRequest(BaseModel):
    is_read: bool


@router.get("/messages", response_model=list[ContactMessageOut])
def list_messages(
    db: Session = Depends(get_db),
    unread: Optional[bool] = Query(None, description="Only unread (true) or only read (false)"),
):
    q = db.query(ContactMessage)
    if unread is not None:
        q = q.filter(ContactMessage.is_read.is_(not unread))
    return [ContactMessageOut.model_validate(m) for m in q.order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc()).all()]


class UnreadCount(BaseModel):
    unread: int


@router.get("/messages/unread-count", response_model=UnreadCount)
def unread_count(db: Session = Depends(get_db)):
    """Just the number of unread messages: the admin menu checks it on every page."""
    return UnreadCount(unread=db.query(func.count(ContactMessage.id)).filter(ContactMessage.is_read.is_(False)).scalar() or 0)


@router.patch("/messages/{message_id}", response_model=ContactMessageOut)
def update_message(message_id: int, req: UpdateMessageRequest, db: Session = Depends(get_db)):
    msg = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message not found.")
    msg.is_read = req.is_read
    db.commit()
    db.refresh(msg)
    return ContactMessageOut.model_validate(msg)


@router.delete("/messages/{message_id}", status_code=204)
def delete_message(message_id: int, db: Session = Depends(get_db)):
    msg = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message not found.")
    db.delete(msg)
    db.commit()
    return None
