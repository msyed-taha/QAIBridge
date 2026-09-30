"""
Admin actor — test suite.

Run from backend/:  python -m pytest tests/test_admin.py -v

Covers:
  1. Role plumbing        (JWT carries role, UserOut exposes it)
  2. get_current_admin    (normal user -> 403, admin -> 200)
  3. User management      (list / filter / create / activate / role change / delete)
  4. Self-lockout guards  (can't demote / deactivate / delete yourself; last admin protected)
  5. First-admin setup    (/api/auth/admin-setup only works while no admin exists)
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models.user import User, ROLE_ADMIN, ROLE_USER
from app.auth.security import hash_password


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


def _mk_user(role: str = ROLE_USER, active: bool = True, email: str | None = None) -> tuple[User, str, str]:
    """Create a throwaway account directly in the DB. Returns (user, email, password)."""
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email = email or f"test_{tag}@example.com"
    password = "TestPass123"
    user = User(
        username=f"test_{tag}",
        email=email,
        hashed_password=hash_password(password),
        role=role,
        is_active=active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user, email, password


def _token(client: TestClient, email: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _cleanup(*user_ids: int) -> None:
    db = SessionLocal()
    for uid in user_ids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            db.delete(u)
    db.commit()
    db.close()


# ── 1. Role plumbing ────────────────────────────────────────────────────────

def test_login_response_and_me_include_role(client):
    admin, email, pw = _mk_user(role=ROLE_ADMIN)
    try:
        login = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert login.json()["user"]["role"] == "admin"
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
        assert me.json()["role"] == "admin"
    finally:
        _cleanup(admin.id)


# ── 2. get_current_admin ────────────────────────────────────────────────────

def test_normal_user_is_forbidden_from_admin_api(client):
    user, email, pw = _mk_user(role=ROLE_USER)
    try:
        tok = _token(client, email, pw)
        for path in ("/api/admin/stats", "/api/admin/users"):
            assert client.get(path, headers={"Authorization": f"Bearer {tok}"}).status_code == 403
    finally:
        _cleanup(user.id)


def test_admin_can_reach_admin_api(client):
    admin, email, pw = _mk_user(role=ROLE_ADMIN)
    try:
        tok = _token(client, email, pw)
        assert client.get("/api/admin/stats", headers={"Authorization": f"Bearer {tok}"}).status_code == 200
        assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    finally:
        _cleanup(admin.id)


def test_unauthenticated_admin_api_is_rejected(client):
    assert client.get("/api/admin/users").status_code == 403


# ── 3. User management ──────────────────────────────────────────────────────

def test_admin_lists_and_filters_users(client):
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    target, _, _ = _mk_user(role=ROLE_USER)
    try:
        tok = _token(client, a_email, a_pw)
        h = {"Authorization": f"Bearer {tok}"}

        all_users = client.get("/api/admin/users", headers=h).json()
        assert any(u["id"] == target.id for u in all_users)

        found = client.get(f"/api/admin/users?search={target.username}", headers=h).json()
        assert [u["id"] for u in found] == [target.id]

        admins_only = client.get("/api/admin/users?role=admin", headers=h).json()
        assert all(u["role"] == "admin" for u in admins_only)
    finally:
        _cleanup(admin.id, target.id)


def test_admin_creates_user_and_admin_accounts(client):
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    made_ids = []
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        tag = uuid.uuid4().hex[:8]

        r = client.post("/api/admin/users", headers=h, json={
            "username": f"cu_{tag}", "email": f"cu_{tag}@example.com",
            "password": "MadePass123", "role": "user",
        })
        assert r.status_code == 201, r.text
        made_ids.append(r.json()["id"])
        assert r.json()["role"] == "user"

        # the created user can actually log in
        assert client.post("/api/auth/login", json={"email": f"cu_{tag}@example.com", "password": "MadePass123"}).status_code == 200

        r = client.post("/api/admin/users", headers=h, json={
            "username": f"ca_{tag}", "email": f"ca_{tag}@example.com",
            "password": "MadePass123", "role": "admin",
        })
        assert r.status_code == 201 and r.json()["role"] == "admin"
        made_ids.append(r.json()["id"])

        # weak password rejected
        assert client.post("/api/admin/users", headers=h, json={
            "username": f"cw_{tag}", "email": f"cw_{tag}@example.com", "password": "weak",
        }).status_code == 422

        # duplicate email rejected
        assert client.post("/api/admin/users", headers=h, json={
            "username": f"dup_{tag}", "email": f"cu_{tag}@example.com", "password": "MadePass123",
        }).status_code == 400
    finally:
        _cleanup(admin.id, *made_ids)


def test_non_admin_cannot_create_accounts(client):
    user, email, pw = _mk_user(role=ROLE_USER)
    try:
        tok = _token(client, email, pw)
        r = client.post("/api/admin/users", headers={"Authorization": f"Bearer {tok}"}, json={
            "username": "nope", "email": "nope@example.com", "password": "MadePass123",
        })
        assert r.status_code == 403
    finally:
        _cleanup(user.id)


def test_admin_setup_is_disabled_once_an_admin_exists(client):
    # The test DB already has at least one admin (demo admin / other test fixtures),
    # so the one-time setup route must refuse.
    admin, _, _ = _mk_user(role=ROLE_ADMIN)
    try:
        assert client.get("/api/auth/admin-setup-status").json()["needs_setup"] is False
        r = client.post("/api/auth/admin-setup", json={
            "username": "firstadmin", "email": "firstadmin@example.com", "password": "SetupPass123",
        })
        assert r.status_code == 403
    finally:
        _cleanup(admin.id)


def test_admin_toggles_active_and_role(client):
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    target, _, _ = _mk_user(role=ROLE_USER)
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}

        r = client.patch(f"/api/admin/users/{target.id}", json={"is_active": False}, headers=h)
        assert r.status_code == 200 and r.json()["is_active"] is False

        r = client.patch(f"/api/admin/users/{target.id}", json={"role": "admin"}, headers=h)
        assert r.status_code == 200 and r.json()["role"] == "admin"

        r = client.patch(f"/api/admin/users/{target.id}", json={"role": "superuser"}, headers=h)
        assert r.status_code == 400
    finally:
        _cleanup(admin.id, target.id)


def test_admin_cannot_change_a_self_deleted_account(client):
    from datetime import datetime, timezone
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    target, t_email, t_pw = _mk_user(role=ROLE_USER, active=False)
    try:
        with SessionLocal() as db:
            db.get(User, target.id).deleted_at = datetime.now(timezone.utc)
            db.commit()
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        row = next(u for u in client.get("/api/admin/users", headers=h).json() if u["id"] == target.id)
        assert row["deleted_at"] and not row["is_active"]
        for body in ({"is_active": True}, {"is_active": False}, {"role": "admin"}):
            assert client.patch(f"/api/admin/users/{target.id}", json=body, headers=h).status_code == 403
        with SessionLocal() as db:
            u = db.get(User, target.id)
            assert not u.is_active and u.deleted_at is not None
        assert client.post("/api/auth/login", json={"email": t_email, "password": t_pw}).status_code == 401
    finally:
        _cleanup(admin.id, target.id)


def test_admin_deletes_a_user(client):
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    target, _, _ = _mk_user(role=ROLE_USER)
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        assert client.delete(f"/api/admin/users/{target.id}", headers=h).status_code == 204
        assert client.get(f"/api/admin/users?search={target.username}", headers=h).json() == []
    finally:
        _cleanup(admin.id, target.id)


# ── 4. Self-lockout guards ──────────────────────────────────────────────────

def test_admin_cannot_demote_deactivate_or_delete_self(client):
    admin, email, pw = _mk_user(role=ROLE_ADMIN)
    try:
        h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
        assert client.patch(f"/api/admin/users/{admin.id}", json={"role": "user"}, headers=h).status_code == 400
        assert client.patch(f"/api/admin/users/{admin.id}", json={"is_active": False}, headers=h).status_code == 400
        assert client.delete(f"/api/admin/users/{admin.id}", headers=h).status_code == 400
    finally:
        _cleanup(admin.id)


# ── 5. Admin allowlist (ADMIN_EMAILS) ───────────────────────────────────────

def test_role_admin_in_db_is_not_enough_without_allowlisted_email(client):
    """A row flipped to role='admin' straight in the DB must still be denied."""
    outsider, email, pw = _mk_user(role=ROLE_ADMIN, email=f"outsider_{uuid.uuid4().hex[:8]}@outsider-not-admin.com")
    try:
        tok = _token(client, email, pw)
        h = {"Authorization": f"Bearer {tok}"}
        assert client.get("/api/admin/stats", headers=h).status_code == 403
        assert client.get("/api/admin/users", headers=h).status_code == 403
    finally:
        _cleanup(outsider.id)


def test_cannot_create_admin_with_non_allowlisted_email(client):
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        tag = uuid.uuid4().hex[:8]
        r = client.post("/api/admin/users", headers=h, json={
            "username": f"out_{tag}", "email": f"out_{tag}@outsider-not-admin.com",
            "password": "MadePass123", "role": "admin",
        })
        assert r.status_code == 403, r.text
        # same email as a plain user is fine
        r = client.post("/api/admin/users", headers=h, json={
            "username": f"out_{tag}", "email": f"out_{tag}@outsider-not-admin.com",
            "password": "MadePass123", "role": "user",
        })
        assert r.status_code == 201, r.text
        _cleanup(r.json()["id"])
    finally:
        _cleanup(admin.id)


def test_cannot_promote_user_to_admin_outside_allowlist(client):
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    target, _, _ = _mk_user(role=ROLE_USER, email=f"out_{uuid.uuid4().hex[:8]}@outsider-not-admin.com")
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        r = client.patch(f"/api/admin/users/{target.id}", json={"role": "admin"}, headers=h)
        assert r.status_code == 403, r.text
        assert client.patch(f"/api/admin/users/{target.id}", json={"is_active": False}, headers=h).status_code == 200
    finally:
        _cleanup(admin.id, target.id)


# ── 6. Owner (OWNER_EMAIL) ──────────────────────────────────────────────────

@pytest.fixture
def owner(monkeypatch):
    """A plain, disabled account set as OWNER_EMAIL — deliberately NOT on ADMIN_EMAILS."""
    user, email, pw = _mk_user(role=ROLE_USER, active=False,
                               email=f"owner_{uuid.uuid4().hex[:8]}@owner-not-listed.com")
    monkeypatch.setattr("app.config.OWNER_EMAIL", email)
    yield user, email, pw
    _cleanup(user.id)


def test_owner_is_made_an_active_admin(client, owner):
    from app.routers.auth import sync_owner_account
    o, email, pw = owner
    with SessionLocal() as db:           # startup sync
        sync_owner_account(db)
        assert db.get(User, o.id).role == ROLE_ADMIN

    with SessionLocal() as db:           # login re-fixes a row edited in the DB
        u = db.get(User, o.id)
        u.role, u.is_active = ROLE_USER, False
        db.commit()
    login = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert login.status_code == 200, login.text
    assert login.json()["user"]["role"] == "admin" and login.json()["user"]["is_owner"] is True
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/admin/users", headers=h).status_code == 200


def test_other_admins_cannot_change_or_delete_the_owner(client, owner):
    o, o_email, o_pw = owner
    _token(client, o_email, o_pw)
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        row = next(u for u in client.get("/api/admin/users", headers=h).json() if u["id"] == o.id)
        assert row["is_owner"] and row["role"] == "admin"
        for body in ({"role": "user"}, {"is_active": False}, {"role": "admin"}):
            assert client.patch(f"/api/admin/users/{o.id}", json=body, headers=h).status_code == 403
        assert client.delete(f"/api/admin/users/{o.id}", headers=h).status_code == 403
        with SessionLocal() as db:
            u = db.get(User, o.id)
            assert u.role == ROLE_ADMIN and u.is_active
    finally:
        _cleanup(admin.id)


def test_owner_cannot_delete_own_account(client, owner):
    from app.auth import otp_store
    o, email, pw = owner
    h = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    assert client.post("/api/account/delete/send-otp", headers=h).status_code == 403
    otp = otp_store.generate(f"delete-account:{email}")   # even with a valid code
    assert client.post("/api/account/delete/verify", headers=h, json={"otp": otp}).status_code == 403
    with SessionLocal() as db:
        assert db.get(User, o.id) is not None


def test_admin_cannot_create_an_account_with_the_owner_email(client, monkeypatch):
    email = f"owner_{uuid.uuid4().hex[:8]}@owner-not-listed.com"
    monkeypatch.setattr("app.config.OWNER_EMAIL", email)
    admin, a_email, a_pw = _mk_user(role=ROLE_ADMIN)
    try:
        h = {"Authorization": f"Bearer {_token(client, a_email, a_pw)}"}
        for role in ("user", "admin"):
            r = client.post("/api/admin/users", headers=h, json={
                "username": f"imp_{uuid.uuid4().hex[:6]}", "email": email, "password": "MadePass123", "role": role,
            })
            assert r.status_code == 403, r.text
    finally:
        _cleanup(admin.id)
