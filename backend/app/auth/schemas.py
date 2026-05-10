"""Pydantic schemas for auth requests and responses."""
from __future__ import annotations

import re
from pydantic import BaseModel, EmailStr, Field, field_validator


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

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
