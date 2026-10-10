"""Pydantic schemas for auth requests and responses."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field, computed_field, field_validator, model_validator

from ..config import is_admin_email, is_owner_email


# An email address in a request, in lower case: "Ali@Gmail.com" and "ali@gmail.com"
# are the same account, whichever way it is typed.
Email = Annotated[EmailStr, AfterValidator(lambda v: v.lower())]

# A username in a request, without spaces at either end, then 3–50 characters
# (so "  ab  " is too short rather than being saved as "ab").
Username = Annotated[str, BeforeValidator(lambda v: v.strip() if isinstance(v, str) else v), Field(min_length=3, max_length=50)]


# ── Password strength validation ──────────────────────────────────────────────

def _validate_password(v: str) -> str:
    errors = []
    if len(v) < 8:
        errors.append("at least 8 characters")
    if not re.search(r"[A-Z]", v):
        errors.append("one uppercase letter")
    if not re.search(r"[a-z]", v):
        errors.append("one lowercase letter")
    if not re.search(r"\d", v):
        errors.append("one digit")
    if errors:
        raise ValueError("Password must contain " + ", ".join(errors) + ".")
    return v


# ── Request models ────────────────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    email: Email


class VerifyOtpRequest(BaseModel):
    email: Email
    otp:   str = Field(..., min_length=5, max_length=5, pattern=r"^\d{5}$")


class RegisterRequest(BaseModel):
    username: Username
    email:    Email
    password: str      = Field(..., min_length=8)
    # "I am 13 or older and agree to the Terms of Use and Privacy Policy"
    accept_terms: bool = Field(False, validate_default=True)   # missing counts as "not accepted"

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)

    @field_validator("accept_terms")
    @classmethod
    def must_accept_terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Please confirm you are 13 or older and agree to the Terms of Use and Privacy Policy.")
        return v


class LoginRequest(BaseModel):
    email:    Email
    password: str


class AdminCreateUserRequest(BaseModel):
    """An admin creating an account directly from the dashboard (no email OTP)."""
    username:  Username
    email:     Email
    password:  str      = Field(..., min_length=8)
    role:      str      = Field(default="user", pattern=r"^(user|admin)$")
    is_active: bool      = True

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


class AdminSetupRequest(BaseModel):
    """One-time creation of the very first administrator (only works when none exist)."""
    username: Username
    email:    Email
    password: str      = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


# ── Account self-service (signed-in user or admin) ────────────────────────────

class UpdateProfileRequest(BaseModel):
    """Change your own display name."""
    username: Username


class ChangePasswordRequest(BaseModel):
    """Change your own password — the current one must be supplied."""
    current_password:     str
    new_password:         str = Field(..., min_length=8)
    confirm_new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


class DeleteAccountVerifyRequest(BaseModel):
    """Confirm permanent account deletion with the emailed OTP."""
    otp: str = Field(..., min_length=5, max_length=5, pattern=r"^\d{5}$")


class ForgotPasswordSendOtpRequest(BaseModel):
    email: Email


class ForgotPasswordVerifyOtpRequest(BaseModel):
    email: Email
    otp:   str = Field(..., min_length=5, max_length=5, pattern=r"^\d{5}$")


class ResetPasswordRequest(BaseModel):
    email:                Email
    otp:                  str = Field(..., min_length=5, max_length=5, pattern=r"^\d{5}$")
    new_password:         str = Field(..., min_length=8)
    confirm_new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


# ── Response models ───────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id:       int
    username: str
    email:    str
    role:     str = "user"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def _role_the_server_honours(self) -> "UserOut":
        # The admin role only counts with an allowlisted email (get_current_admin),
        # so the website isn't told an account is an admin when the server won't
        # treat it as one: it would show an admin portal where every page fails.
        if self.role == "admin" and not is_admin_email(self.email):
            self.role = "user"
        return self

    @computed_field
    @property
    def is_owner(self) -> bool:
        return is_owner_email(self.email)


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
