"""
Account self-service — test suite (profile edit, change password, delete account).

Run from backend/:  python -m pytest tests/test_account.py -v

The delete-account OTP is injected straight into the in-memory store
(otp_store.generate) so the tests never hit real SMTP, exactly like
test_forgot_password.py.
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


def _mk_user(role: str = ROLE_USER) -> tuple[int, str, str]:
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email, pw = f"acct_{tag}@example.com", "OldPass123"
    u = User(username=f"acct_{tag}", email=email, hashed_password=hash_password(pw), role=role, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    uid = u.id
    db.close()
    return uid, email, pw


def _cleanup(*uids: int) -> None:
    db = SessionLocal()
    for uid in uids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            db.delete(u)
    db.commit()
    db.close()


def _token(client: TestClient, email: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _exists(uid: int) -> bool:
    db = SessionLocal()
    found = db.query(User).filter(User.id == uid).first() is not None
    db.close()
    return found


# ── GET /me ─────────────────────────────────────────────────────────────────

def test_me_returns_profile_and_requires_auth(client):
    assert client.get("/api/account/me").status_code == 403
    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        body = client.get("/api/account/me", headers=h).json()
        assert body["email"] == email
        assert body["role"] == "user"
        assert "created_at" in body
    finally:
        _cleanup(uid)


# ── PATCH /profile ──────────────────────────────────────────────────────────

def test_update_username(client):
    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        new_name = f"renamed_{uuid.uuid4().hex[:8]}"
        r = client.patch("/api/account/profile", headers=h, json={"username": new_name})
        assert r.status_code == 200 and r.json()["username"] == new_name
        assert client.get("/api/account/me", headers=h).json()["username"] == new_name
    finally:
        _cleanup(uid)


def test_update_username_rejects_duplicate_and_too_short(client):
    uid1, e1, p1 = _mk_user()
    uid2, e2, p2 = _mk_user()
    try:
        h1 = {"Authorization": f"Bearer {_token(client, e1, p1)}"}
        other = client.get("/api/account/me", headers={"Authorization": f"Bearer {_token(client, e2, p2)}"}).json()["username"]

        assert client.patch("/api/account/profile", headers=h1, json={"username": other}).status_code == 400
        assert client.patch("/api/account/profile", headers=h1, json={"username": "ab"}).status_code == 422
    finally:
        _cleanup(uid1, uid2)


# ── POST /change-password ───────────────────────────────────────────────────

def test_change_password_happy_path(client):
    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        r = client.post("/api/account/change-password", headers=h, json={
            "current_password": pw, "new_password": "FreshPass123", "confirm_new_password": "FreshPass123",
        })
        assert r.status_code == 200, r.text
        assert client.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 401
        assert client.post("/api/auth/login", json={"email": email, "password": "FreshPass123"}).status_code == 200
    finally:
        _cleanup(uid)


def test_change_password_guards(client):
    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        # wrong current
        assert client.post("/api/account/change-password", headers=h, json={
            "current_password": "WrongPass123", "new_password": "FreshPass123", "confirm_new_password": "FreshPass123",
        }).status_code == 400
        # mismatch
        assert client.post("/api/account/change-password", headers=h, json={
            "current_password": pw, "new_password": "FreshPass123", "confirm_new_password": "Different123",
        }).status_code == 400
        # same as current
        assert client.post("/api/account/change-password", headers=h, json={
            "current_password": pw, "new_password": pw, "confirm_new_password": pw,
        }).status_code == 400
        # weak
        assert client.post("/api/account/change-password", headers=h, json={
            "current_password": pw, "new_password": "weak", "confirm_new_password": "weak",
        }).status_code == 422
        # still the original password
        assert client.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 200
    finally:
        _cleanup(uid)


# ── DELETE account ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", [ROLE_USER, ROLE_ADMIN])
def test_delete_account_flow(client, role):
    uid, email, pw = _mk_user(role)
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}

        # wrong OTP is rejected
        otp = otp_store.generate(f"delete-account:{email}")
        assert client.post("/api/account/delete/verify", headers=h, json={"otp": "00000"}).status_code == 400

        # correct OTP → gone for good
        otp = otp_store.generate(f"delete-account:{email}")
        r = client.post("/api/account/delete/verify", headers=h, json={"otp": otp})
        assert r.status_code == 200, r.text
        assert not _exists(uid)
        assert client.get("/api/account/me", headers=h).status_code == 401
        assert client.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 401
    finally:
        _cleanup(uid)


def test_delete_send_otp_requires_auth_and_emails(client, monkeypatch):
    sent = {}
    monkeypatch.setattr("app.routers.account.send_otp",
                        lambda to, otp, **kw: sent.update(to=to, otp=otp))
    assert client.post("/api/account/delete/send-otp").status_code == 403

    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        r = client.post("/api/account/delete/send-otp", headers=h)
        assert r.status_code == 200, r.text
        assert sent["to"] == email and len(sent["otp"]) == 5
    finally:
        _cleanup(uid)


def test_last_admin_cannot_delete_self(client, monkeypatch):
    monkeypatch.setattr("app.routers.account._admin_count", lambda db: 1)
    uid, email, pw = _mk_user(ROLE_ADMIN)
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        assert client.post("/api/account/delete/send-otp", headers=h).status_code == 400

        otp = otp_store.generate(f"delete-account:{email}")
        r = client.post("/api/account/delete/verify", headers=h, json={"otp": otp})
        assert r.status_code == 400
        assert _exists(uid)
    finally:
        otp_store.clear(f"delete-account:{email}")
        _cleanup(uid)
