"""
Auth Router
POST /api/auth/send-otp    – Send 5-digit OTP to email
POST /api/auth/verify-otp  – Verify the OTP
POST /api/auth/register    – Create account (requires prior OTP verification)
POST /api/auth/login       – Authenticate and return JWT
GET  /api/auth/me          – Return current user profile
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import config
from ..config import is_admin_email, is_owner_email
from ..legal import TERMS_VERSION, purge_expired
from ..models.user import User, ROLE_ADMIN, ROLE_USER
from ..auth.security      import hash_password, verify_password, create_access_token, decode_access_token
from ..auth.schemas       import (
    RegisterRequest, LoginRequest, TokenResponse, UserOut, SendOtpRequest,
    VerifyOtpRequest, ForgotPasswordSendOtpRequest, ForgotPasswordVerifyOtpRequest,
    ResetPasswordRequest, AdminSetupRequest
)
from ..auth               import otp_store
from ..auth.email_service import EMAIL_UNAVAILABLE, send_otp

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer = HTTPBearer()


# ── Helper ────────────────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token   = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token.")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload.")
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found.")
    return user


optional_bearer = HTTPBearer(auto_error=False)


def user_from_token(token: str, db: Session) -> "User | None":
    """Resolve a JWT to an active user, or None (used by WebSockets and optional auth)."""
    payload = decode_access_token(token) if token else None
    if not payload:
        return None
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None
    user = db.query(User).filter(User.id == user_id).first()
    return user if user and user.is_active else None


def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(optional_bearer),
    db: Session = Depends(get_db),
) -> "User | None":
    """Like get_current_user, but anonymous requests get None instead of a 401/403."""
    if not credentials:
        return None
    return user_from_token(credentials.credentials, db)


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency for admin-only routes. The account must BOTH carry the admin
    role AND have an allowlisted email (backend/.env ADMIN_EMAILS). The second
    check means a role flipped straight in the database is not enough.
    """
    if current_user.role != ROLE_ADMIN or not is_admin_email(current_user.email):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required.")
    return current_user


def enforce_owner(user: User) -> bool:
    """Keep the OWNER_EMAIL account an active admin. Returns True if it had to change."""
    if not is_owner_email(user.email) or (user.role == ROLE_ADMIN and user.is_active):
        return False
    user.role, user.is_active, user.deleted_at = ROLE_ADMIN, True, None
    return True


def sync_owner_account(db: Session) -> None:
    """Called at startup: promote the owner's existing account right away."""
    if not config.OWNER_EMAIL:
        return
    user = db.query(User).filter(func.lower(User.email) == config.OWNER_EMAIL).first()
    if user and enforce_owner(user):
        db.commit()
        log.info("Owner account %s promoted to active admin", user.email)


# ── OTP: send ─────────────────────────────────────────────────────────────────

@router.post("/send-otp", status_code=200)
def send_otp_endpoint(req: SendOtpRequest, db: Session = Depends(get_db)):
    """Generate a 5-digit OTP and email it to the user."""

    # Block if email is already registered — unless the user deleted that account
    # themselves, in which case signing up again restores it (within 30 days;
    # after that it has been erased and this is a brand-new account).
    purge_expired(db)
    existing = db.query(User).filter(func.lower(User.email) == req.email).first()
    if existing and existing.deleted_at is None:
        raise HTTPException(400, "An account with this email already exists.")

    otp = otp_store.generate(str(req.email))

    try:
        send_otp(str(req.email), otp)
    except Exception:
        log.exception("Sign-up OTP email could not be sent")
        raise HTTPException(503, EMAIL_UNAVAILABLE)

    return {"message": "We've sent a 5-digit code to your email. Please check your inbox."}


# ── OTP: verify ───────────────────────────────────────────────────────────────

@router.post("/verify-otp", status_code=200)
def verify_otp_endpoint(req: VerifyOtpRequest):
    """Verify the 5-digit OTP. Must be called before /register."""

    success, error = otp_store.verify(str(req.email), req.otp)
    if not success:
        raise HTTPException(400, error)

    return {"message": "Email verified successfully. You may now complete registration."}


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """
    Create a new account — or restore one the user deleted themselves in the
    last 30 days, keeping its id and history but taking the new username and
    password. Requires the email to have been verified via /send-otp →
    /verify-otp first, and the Terms/Privacy Policy to be accepted (recorded).
    """

    if not otp_store.is_verified(str(req.email)):
        raise HTTPException(403, "Please verify your email with the code we sent first.")

    purge_expired(db)   # an account deleted over 30 days ago is erased, never restored
    existing = db.query(User).filter(func.lower(User.email) == req.email).first()
    if existing and existing.deleted_at is None:
        raise HTTPException(400, "An account with this email already exists.")

    taken = db.query(User).filter(func.lower(User.username) == req.username.lower()).first()
    if taken and taken is not existing:
        raise HTTPException(400, "This username is already taken.")

    if existing:
        user = existing
        user.username        = req.username
        user.hashed_password = hash_password(req.password)
        user.role            = ROLE_USER
        user.is_active       = True
        user.deleted_at      = None
    else:
        user = User(
            username=req.username,
            email=req.email,
            hashed_password=hash_password(req.password),
        )
        db.add(user)
    user.terms_accepted_at = datetime.now(timezone.utc)
    user.terms_version     = TERMS_VERSION
    enforce_owner(user)
    db.commit()
    db.refresh(user)

    otp_store.clear(str(req.email))   # clean up OTP entry

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate and return a JWT token."""

    user = db.query(User).filter(func.lower(User.email) == req.email).first()
    # A self-deleted account answers exactly like an email that was never registered.
    if not user or user.deleted_at is not None or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password.")

    enforce_owner(user)   # the owner can never be locked out or left as a plain user
    if not user.is_active:
        raise HTTPException(403, "Account is disabled.")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserOut.model_validate(current_user)


# ── First-admin setup ────────────────────────────────────────────────────────
#
# The very first admin has a chicken-and-egg problem: only an admin can create
# another admin, but there is no admin yet. This one-time endpoint solves it —
# it works ONLY while zero admins exist, then disables itself forever. After
# that, admins are created from the dashboard (POST /api/admin/users) or the
# scripts/make_admin.py CLI.

@router.get("/admin-setup-status")
def admin_setup_status(db: Session = Depends(get_db)):
    """Tell the frontend whether the one-time first-admin form should be shown."""
    admin_count = db.query(User).filter(User.role == ROLE_ADMIN).count()
    return {"needs_setup": admin_count == 0}


@router.post("/admin-setup", response_model=TokenResponse, status_code=201)
def admin_setup(req: AdminSetupRequest, db: Session = Depends(get_db)):
    """Create the first administrator account. 403 once any admin exists."""
    if db.query(User).filter(User.role == ROLE_ADMIN).count() > 0:
        raise HTTPException(403, "An administrator already exists. Ask them to create more from the dashboard.")

    if not is_admin_email(req.email):
        raise HTTPException(403, "This email address is not on the administrator allowlist (backend/.env ADMIN_EMAILS).")

    if db.query(User).filter(func.lower(User.email) == req.email).first():
        raise HTTPException(400, "An account with this email already exists.")
    if db.query(User).filter(func.lower(User.username) == req.username.lower()).first():
        raise HTTPException(400, "This username is already taken.")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        role=ROLE_ADMIN,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


# ── Forgot Password: send OTP ─────────────────────────────────────────────────

@router.post("/forgot-password/send-otp", status_code=200)
def forgot_password_send_otp(req: ForgotPasswordSendOtpRequest, db: Session = Depends(get_db)):
    """
    Send OTP to existing user email for password reset.
    Always returns the same generic message regardless of whether the email
    is registered, so this endpoint can't be used to enumerate accounts —
    only actually emails an OTP if the account exists.
    """
    user = db.query(User).filter(func.lower(User.email) == req.email).first()
    if user and user.deleted_at is None:   # a deleted account is restored by signing up again
        otp = otp_store.generate(f"forgot-password:{req.email}")
        try:
            send_otp(
                str(req.email), otp,
                heading="Reset your password",
                subtext="Enter this code in QAIbridge to reset your password",
            )
        except Exception:
            log.exception("Password-reset OTP email could not be sent")
            raise HTTPException(503, EMAIL_UNAVAILABLE)

    return {"message": "If an account exists for this email, we've sent a 5-digit code to it. Please check your inbox."}


# ── Forgot Password: verify OTP ───────────────────────────────────────────────

@router.post("/forgot-password/verify-otp", status_code=200)
def forgot_password_verify_otp(req: ForgotPasswordVerifyOtpRequest):
    """Verify the OTP for password reset."""

    success, error = otp_store.verify(f"forgot-password:{req.email}", req.otp)
    if not success:
        raise HTTPException(400, error)

    return {"message": "Code verified. You can now set a new password."}


# ── Forgot Password: reset password ────────────────────────────────────────────

@router.post("/forgot-password/reset-password", status_code=200)
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password for user after OTP verification."""

    # Check if OTP was verified
    if not otp_store.is_verified(f"forgot-password:{req.email}"):
        raise HTTPException(403, "Please verify the code we sent first.")

    # Check if passwords match
    if req.new_password != req.confirm_new_password:
        raise HTTPException(400, "Passwords do not match.")

    # Find user
    user = db.query(User).filter(func.lower(User.email) == req.email).first()
    if not user:
        raise HTTPException(400, "User not found.")

    # Update password
    user.hashed_password = hash_password(req.new_password)
    db.commit()

    otp_store.clear(f"forgot-password:{req.email}")  # Clean up OTP entry

    return {"message": "Password changed successfully. Please log in with your new password."}
