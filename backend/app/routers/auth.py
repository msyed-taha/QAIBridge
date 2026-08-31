"""
Auth Router
POST /api/auth/send-otp    – Send 5-digit OTP to email
POST /api/auth/verify-otp  – Verify the OTP
POST /api/auth/register    – Create account (requires prior OTP verification)
POST /api/auth/login       – Authenticate and return JWT
GET  /api/auth/me          – Return current user profile
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import is_admin_email
from ..models.user import User, ROLE_ADMIN
from ..auth.security      import hash_password, verify_password, create_access_token, decode_access_token
from ..auth.schemas       import (
    RegisterRequest, LoginRequest, TokenResponse, UserOut, SendOtpRequest,
    VerifyOtpRequest, ForgotPasswordSendOtpRequest, ForgotPasswordVerifyOtpRequest,
    ResetPasswordRequest, AdminSetupRequest
)
from ..auth               import otp_store
from ..auth.email_service import send_otp

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


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency for admin-only routes. The account must BOTH carry the admin
    role AND have an allowlisted email (backend/.env ADMIN_EMAILS). The second
    check means a role flipped straight in the database is not enough.
    """
    if current_user.role != ROLE_ADMIN or not is_admin_email(current_user.email):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required.")
    return current_user


# ── OTP: send ─────────────────────────────────────────────────────────────────

@router.post("/send-otp", status_code=200)
def send_otp_endpoint(req: SendOtpRequest, db: Session = Depends(get_db)):
    """Generate a 5-digit OTP and email it to the user."""

    # Block if email is already registered
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(400, "An account with this email already exists.")

    otp = otp_store.generate(str(req.email))

    try:
        send_otp(str(req.email), otp)
    except ValueError as e:
        # EMAIL_USER / EMAIL_PASSWORD not configured — surface a clear message
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Failed to send email: {e}")

    return {"message": "OTP sent successfully. Please check your inbox."}


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
    Create a new account.
    Requires the email to have been verified via /send-otp → /verify-otp first.
    """

    if not otp_store.is_verified(str(req.email)):
        raise HTTPException(403, "Email not verified. Please complete OTP verification first.")

    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(400, "An account with this email already exists.")

    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(400, "This username is already taken.")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    otp_store.clear(str(req.email))   # clean up OTP entry

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate and return a JWT token."""

    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password.")

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

    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(400, "An account with this email already exists.")
    if db.query(User).filter(User.username == req.username).first():
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
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        otp = otp_store.generate(f"forgot-password:{req.email}")
        try:
            send_otp(
                str(req.email), otp,
                heading="Reset your password",
                subtext="Enter this code in QAIbridge to reset your password",
            )
        except ValueError as e:
            raise HTTPException(503, str(e))
        except Exception as e:
            raise HTTPException(502, f"Failed to send email: {e}")

    return {"message": "If an account exists for this email, an OTP has been sent. Please check your inbox."}


# ── Forgot Password: verify OTP ───────────────────────────────────────────────

@router.post("/forgot-password/verify-otp", status_code=200)
def forgot_password_verify_otp(req: ForgotPasswordVerifyOtpRequest):
    """Verify the OTP for password reset."""

    success, error = otp_store.verify(f"forgot-password:{req.email}", req.otp)
    if not success:
        raise HTTPException(400, error)

    return {"message": "OTP verified successfully. You may now reset your password."}


# ── Forgot Password: reset password ────────────────────────────────────────────

@router.post("/forgot-password/reset-password", status_code=200)
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset password for user after OTP verification."""

    # Check if OTP was verified
    if not otp_store.is_verified(f"forgot-password:{req.email}"):
        raise HTTPException(403, "Please verify OTP first.")

    # Check if passwords match
    if req.new_password != req.confirm_new_password:
        raise HTTPException(400, "Passwords do not match.")

    # Find user
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(400, "User not found.")

    # Update password
    user.hashed_password = hash_password(req.new_password)
    db.commit()

    otp_store.clear(f"forgot-password:{req.email}")  # Clean up OTP entry

    return {"message": "Password changed successfully. Please log in with your new password."}
