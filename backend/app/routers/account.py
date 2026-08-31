"""
Account Router — self-service profile management for the signed-in account.

Works identically for a normal user and an admin (every route depends only on
`get_current_user`, and every action targets *your own* account — the identity
comes from the JWT, never from the request body, so one account can't touch
another).

  GET    /api/account/me               – your current profile
  PATCH  /api/account/profile          – change your username
  POST   /api/account/change-password  – change your password (current one required)
  POST   /api/account/delete/send-otp  – email a 5-digit code to YOUR address
  POST   /api/account/delete/verify    – enter the code → account permanently deleted
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, ROLE_ADMIN
from ..auth.security import hash_password, verify_password
from ..auth.schemas import (
    UserOut,
    UpdateProfileRequest,
    ChangePasswordRequest,
    DeleteAccountVerifyRequest,
)
from ..auth import otp_store
from ..auth.email_service import send_otp
from .auth import get_current_user

router = APIRouter(prefix="/api/account", tags=["Account"])


def _delete_otp_key(email: str) -> str:
    return f"delete-account:{email}"


def _admin_count(db: Session) -> int:
    return db.query(func.count(User.id)).filter(User.role == ROLE_ADMIN).scalar() or 0


def _guard_last_admin(db: Session, me: User) -> None:
    """Stop an admin deleting the only remaining admin account."""
    if me.role == ROLE_ADMIN and _admin_count(db) <= 1:
        raise HTTPException(
            400,
            "You are the only administrator. Create another admin account before deleting this one.",
        )


# ── Profile ──────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def my_profile(me: User = Depends(get_current_user)):
    return UserOut.model_validate(me)


@router.patch("/profile", response_model=UserOut)
def update_profile(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    new_username = req.username.strip()
    if new_username != me.username:
        taken = (
            db.query(User)
            .filter(User.username == new_username, User.id != me.id)
            .first()
        )
        if taken:
            raise HTTPException(400, "This username is already taken.")
        me.username = new_username
        db.commit()
        db.refresh(me)
    return UserOut.model_validate(me)


# ── Change password ──────────────────────────────────────────────────────────

@router.post("/change-password", status_code=200)
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not verify_password(req.current_password, me.hashed_password):
        raise HTTPException(400, "Your current password is incorrect.")
    if req.new_password != req.confirm_new_password:
        raise HTTPException(400, "The new passwords do not match.")
    if verify_password(req.new_password, me.hashed_password):
        raise HTTPException(400, "The new password must be different from your current one.")

    me.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"message": "Password changed successfully."}


# ── Delete account (OTP-confirmed, permanent) ────────────────────────────────

@router.post("/delete/send-otp", status_code=200)
def delete_account_send_otp(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    _guard_last_admin(db, me)

    otp = otp_store.generate(_delete_otp_key(me.email))
    try:
        send_otp(
            me.email, otp,
            heading="Confirm account deletion",
            subtext="Enter this code in QAIbridge to permanently delete your account",
        )
    except ValueError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Failed to send email: {e}")

    return {"message": f"A verification code has been sent to {me.email}. It expires in 10 minutes."}


@router.post("/delete/verify", status_code=200)
def delete_account_verify(
    req: DeleteAccountVerifyRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    key = _delete_otp_key(me.email)
    ok, error = otp_store.verify(key, req.otp)
    if not ok:
        raise HTTPException(400, error)

    try:
        _guard_last_admin(db, me)   # re-check at the moment of deletion
    except HTTPException:
        otp_store.clear(key)
        raise

    otp_store.clear(key)
    db.delete(me)
    db.commit()
    return {"message": "Your account has been permanently deleted."}
