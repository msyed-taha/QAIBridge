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


def _mk_user(role: str = ROLE_USER, active: bool = True) -> tuple[User, str, str]:
    """Create a throwaway account directly in the DB. Returns (user, email, password)."""
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email = f"test_{tag}@example.com"
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
