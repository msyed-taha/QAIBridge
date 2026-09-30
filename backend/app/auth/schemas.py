"""Pydantic schemas for auth requests and responses."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator

from ..config import is_owner_email


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
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp:   str = Field(..., min_length=5, max_length=5, pattern=r"^\d{5}$")


class RegisterRequest(BaseModel):
    username: str      = Field(..., min_length=3, max_length=50)
    email:    EmailStr
    password: str      = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class AdminCreateUserRequest(BaseModel):
    """An admin creating an account directly from the dashboard (no email OTP)."""
    username:  str      = Field(..., min_length=3, max_length=50)
    email:     EmailStr
    password:  str      = Field(..., min_length=8)
    role:      str      = Field(default="user", pattern=r"^(user|admin)$")
    is_active: bool      = True

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


class AdminSetupRequest(BaseModel):
    """One-time creation of the very first administrator (only works when none exist)."""
    username: str      = Field(..., min_length=3, max_length=50)
    email:    EmailStr
    password: str      = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return _validate_password(v)


# ── Account self-service (signed-in user or admin) ────────────────────────────

class UpdateProfileRequest(BaseModel):
    """Change your own display name."""
    username: str = Field(..., min_length=3, max_length=50)


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
    email: EmailStr


class ForgotPasswordVerifyOtpRequest(BaseModel):
    email: EmailStr
    otp:   str = Field(..., min_length=5, max_length=5, pattern=r"^\d{5}$")


class ResetPasswordRequest(BaseModel):
    email:                EmailStr
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

    @computed_field
    @property
    def is_owner(self) -> bool:
        return is_owner_email(self.email)


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
