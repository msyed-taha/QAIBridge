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
    return _get(uid) is not None


def _get(uid: int) -> User | None:
    db = SessionLocal()
    u = db.query(User).filter(User.id == uid).first()
    db.close()
    return u


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


def test_username_is_trimmed_before_it_is_checked(client):
    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        # "  ab  " is 2 characters once trimmed: too short, not saved as "ab"
        assert client.patch("/api/account/profile", headers=h, json={"username": "  ab  "}).status_code == 422
        name = f"trim_{uuid.uuid4().hex[:8]}"
        r = client.patch("/api/account/profile", headers=h, json={"username": f"  {name}  "})
        assert r.status_code == 200 and r.json()["username"] == name
    finally:
        _cleanup(uid)


def test_usernames_are_unique_whatever_the_capitals(client, monkeypatch):
    uid1, e1, p1 = _mk_user()
    uid2, e2, p2 = _mk_user()
    try:
        other = _get(uid2).username
        h1 = {"Authorization": f"Bearer {_token(client, e1, p1)}"}
        assert client.patch("/api/account/profile", headers=h1, json={"username": other.upper()}).status_code == 400
        # changing only the capitals of your own name is fine
        mine = _get(uid1).username
        assert client.patch("/api/account/profile", headers=h1, json={"username": mine.upper()}).status_code == 200
        # and sign-up refuses a lookalike too
        r = _signup(client, monkeypatch, f"look_{uuid.uuid4().hex[:8]}@example.com", other.upper(), "LookPass123")
        assert r.status_code == 400 and "taken" in r.json()["detail"]
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
    # An admin may only delete their account while another admin exists
    # (the last-admin guard) — create one so the test doesn't depend on the DB contents.
    other_admin = _mk_user(ROLE_ADMIN)[0] if role == ROLE_ADMIN else None
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}

        # wrong OTP is rejected
        otp = otp_store.generate(f"delete-account:{email}")
        assert client.post("/api/account/delete/verify", headers=h, json={"otp": "00000"}).status_code == 400

        # correct OTP → deactivated (soft delete): the row stays, marked deleted
        otp = otp_store.generate(f"delete-account:{email}")
        r = client.post("/api/account/delete/verify", headers=h, json={"otp": otp})
        assert r.status_code == 200, r.text
        u = _get(uid)
        assert u is not None and not u.is_active and u.deleted_at is not None and u.role == ROLE_USER
        assert client.get("/api/account/me", headers=h).status_code == 401
        # login answers exactly as for an email that never existed
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        never = client.post("/api/auth/login", json={"email": f"never_{uuid.uuid4().hex[:8]}@example.com", "password": pw})
        assert (r.status_code, r.json()) == (never.status_code, never.json()) == (401, {"detail": "Invalid email or password."})
    finally:
        _cleanup(uid)
        if other_admin:
            _cleanup(other_admin)


def _signup(client, monkeypatch, email: str, username: str, password: str):
    """Run the real sign-up flow (send-otp → verify-otp → register) with email capture."""
    sent = {}
    monkeypatch.setattr("app.routers.auth.send_otp", lambda to, otp, **kw: sent.update(otp=otp))
    r = client.post("/api/auth/send-otp", json={"email": email})
    if r.status_code != 200:
        return r
    assert client.post("/api/auth/verify-otp", json={"email": email, "otp": sent["otp"]}).status_code == 200
    return client.post("/api/auth/register", json={"username": username, "email": email, "password": password,
                                                   "accept_terms": True})


def test_signing_up_again_restores_a_deleted_account(client, monkeypatch):
    uid, email, pw = _mk_user()
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        otp = otp_store.generate(f"delete-account:{email}")
        assert client.post("/api/account/delete/verify", headers=h, json={"otp": otp}).status_code == 200
        # forgot-password doesn't bring a deleted account back — signing up does
        mailed = []
        monkeypatch.setattr("app.routers.auth.send_otp", lambda to, otp, **kw: mailed.append(to))
        assert client.post("/api/auth/forgot-password/send-otp", json={"email": email}).status_code == 200
        assert mailed == []

        new_name = f"back_{uuid.uuid4().hex[:8]}"
        r = _signup(client, monkeypatch, email, new_name, "ReturnPass123")
        assert r.status_code == 201, r.text
        assert r.json()["user"]["id"] == uid and r.json()["user"]["username"] == new_name

        u = _get(uid)
        assert u.is_active and u.deleted_at is None and u.username == new_name and u.role == ROLE_USER
        assert client.post("/api/auth/login", json={"email": email, "password": pw}).status_code == 401
        assert client.post("/api/auth/login", json={"email": email, "password": "ReturnPass123"}).status_code == 200
        # and it's an ordinary account again: a second sign-up is refused
        assert _signup(client, monkeypatch, email, f"x_{uuid.uuid4().hex[:6]}", "ReturnPass123").status_code == 400
    finally:
        _cleanup(uid)


def test_restored_account_may_keep_its_old_username(client, monkeypatch):
    uid, email, pw = _mk_user()
    try:
        old_name = _get(uid).username
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        otp = otp_store.generate(f"delete-account:{email}")
        client.post("/api/account/delete/verify", headers=h, json={"otp": otp})
        r = _signup(client, monkeypatch, email, old_name, "ReturnPass123")
        assert r.status_code == 201, r.text
    finally:
        _cleanup(uid)


def test_admin_deactivated_account_cannot_sign_up_again(client, monkeypatch):
    uid, email, pw = _mk_user()
    try:
        db = SessionLocal()
        db.get(User, uid).is_active = False
        db.commit(); db.close()
        r = _signup(client, monkeypatch, email, f"x_{uuid.uuid4().hex[:6]}", "ReturnPass123")
        assert r.status_code == 400
        assert client.post("/api/auth/login", json={"email": email, "password": pw}).json()["detail"] == "Account is disabled."
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
