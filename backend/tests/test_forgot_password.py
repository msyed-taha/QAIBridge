"""
Forgot-password ("forget") flow — works for both actors.

Run from backend/:  python -m pytest tests/test_forgot_password.py -v

The OTP is injected straight into the in-memory store (otp_store.generate)
so the tests never hit real SMTP — only the verify -> reset -> login steps
are exercised, which is the part that matters.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth import otp_store
from app.auth.security import hash_password
from app.database import SessionLocal
from app.models.user import User, ROLE_ADMIN, ROLE_USER


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


def _mk_user(role: str) -> tuple[int, str, str]:
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email, pw = f"reset_{tag}@example.com", "OldPass123"
    u = User(username=f"reset_{tag}", email=email, hashed_password=hash_password(pw), role=role, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    uid = u.id
    db.close()
    return uid, email, pw


def _cleanup(uid: int) -> None:
    db = SessionLocal()
    u = db.query(User).filter(User.id == uid).first()
    if u:
        db.delete(u); db.commit()
    db.close()


def _reset_flow(client: TestClient, email: str, new_password: str) -> None:
    otp = otp_store.generate(f"forgot-password:{email}")

    r = client.post("/api/auth/forgot-password/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text

    r = client.post("/api/auth/forgot-password/reset-password", json={
        "email": email, "otp": otp,
        "new_password": new_password, "confirm_new_password": new_password,
    })
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("role", [ROLE_USER, ROLE_ADMIN])
def test_forgot_password_flow_for_each_role(client, role):
    uid, email, old_pw = _mk_user(role)
    new_pw = "BrandNew123"
    try:
        # old password works
        assert client.post("/api/auth/login", json={"email": email, "password": old_pw}).status_code == 200

        _reset_flow(client, email, new_pw)

        # old password no longer works, new one does, role is unchanged
        assert client.post("/api/auth/login", json={"email": email, "password": old_pw}).status_code == 401
        r = client.post("/api/auth/login", json={"email": email, "password": new_pw})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == role
    finally:
        _cleanup(uid)


def test_resetting_the_password_signs_out_every_device(client):
    uid, email, pw = _mk_user(ROLE_USER)
    try:
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        old = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert client.get("/api/auth/me", headers=old).status_code == 200
        _reset_flow(client, email, "ResetPass789")
        assert client.get("/api/auth/me", headers=old).status_code == 401
    finally:
        _cleanup(uid)


def test_reset_password_requires_verified_otp(client):
    uid, email, _ = _mk_user(ROLE_USER)
    try:
        otp = otp_store.generate(f"forgot-password:{email}")  # generated but never verified
        r = client.post("/api/auth/forgot-password/reset-password", json={
            "email": email, "otp": otp,
            "new_password": "BrandNew123", "confirm_new_password": "BrandNew123",
        })
        assert r.status_code == 403
    finally:
        otp_store.clear(f"forgot-password:{email}")
        _cleanup(uid)


def test_reset_password_rejects_mismatched_confirmation(client):
    uid, email, _ = _mk_user(ROLE_ADMIN)
    try:
        otp = otp_store.generate(f"forgot-password:{email}")
        client.post("/api/auth/forgot-password/verify-otp", json={"email": email, "otp": otp})
        r = client.post("/api/auth/forgot-password/reset-password", json={
            "email": email, "otp": otp,
            "new_password": "BrandNew123", "confirm_new_password": "Different123",
        })
        assert r.status_code == 400
    finally:
        otp_store.clear(f"forgot-password:{email}")
        _cleanup(uid)
