"""
Email addresses are not case-sensitive — test suite.

Run from backend/:  python -m pytest tests/test_email_case.py -v

"Ali@Gmail.com" and "ali@gmail.com" are the same person: signing in, signing up
and an admin creating an account must all treat them as one address, including
accounts saved with capitals before emails were lower-cased.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models.user import User, ROLE_ADMIN, ROLE_USER


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


def _mk_user(email: str, role: str = ROLE_USER) -> int:
    db = SessionLocal()
    u = User(username=f"case_{uuid.uuid4().hex[:10]}", email=email, hashed_password=hash_password("TestPass123"),
             role=role, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    uid = u.id
    db.close()
    return uid


def _cleanup(*uids: int) -> None:
    db = SessionLocal()
    db.query(User).filter(User.id.in_(uids)).delete(synchronize_session=False)
    db.commit()
    db.close()


def _login(client, email: str):
    return client.post("/api/auth/login", json={"email": email, "password": "TestPass123"})


def test_sign_in_works_whichever_way_the_email_is_typed(client):
    tag = uuid.uuid4().hex[:8]
    uid = _mk_user(f"case_{tag}@example.com")
    try:
        for typed in (f"case_{tag}@example.com", f"CASE_{tag}@Example.COM", f"Case_{tag}@example.com"):
            r = _login(client, typed)
            assert r.status_code == 200, (typed, r.text)
            assert r.json()["user"]["id"] == uid
    finally:
        _cleanup(uid)


def test_older_account_saved_with_capitals_still_signs_in(client):
    tag = uuid.uuid4().hex[:8]
    uid = _mk_user(f"Old_{tag}@Example.com")          # saved before emails were lower-cased
    try:
        assert _login(client, f"old_{tag}@example.com").status_code == 200
        assert _login(client, f"Old_{tag}@Example.com").status_code == 200
    finally:
        _cleanup(uid)


def test_sign_up_refuses_the_same_email_in_other_capitals(client):
    tag = uuid.uuid4().hex[:8]
    uid = _mk_user(f"taken_{tag}@example.com")
    try:
        # Refused before any code is generated or emailed.
        r = client.post("/api/auth/send-otp", json={"email": f"TAKEN_{tag}@Example.com"})
        assert r.status_code == 400 and "already exists" in r.json()["detail"]
    finally:
        _cleanup(uid)


def test_admin_cannot_create_a_duplicate_in_other_capitals(client):
    tag = uuid.uuid4().hex[:8]
    admin_id = _mk_user(f"case_admin_{tag}@example.com", role=ROLE_ADMIN)
    taken_id = _mk_user(f"dup_{tag}@example.com")
    try:
        tok = _login(client, f"case_admin_{tag}@example.com").json()["access_token"]
        r = client.post("/api/admin/users", headers={"Authorization": f"Bearer {tok}"},
                        json={"username": f"dup2_{tag}", "email": f"DUP_{tag}@example.com", "password": "TestPass123"})
        assert r.status_code == 400 and "already exists" in r.json()["detail"]
        # and a new account is saved in lower case
        r = client.post("/api/admin/users", headers={"Authorization": f"Bearer {tok}"},
                        json={"username": f"new_{tag}", "email": f"New_{tag}@Example.com", "password": "TestPass123"})
        assert r.status_code == 201 and r.json()["email"] == f"new_{tag}@example.com"
        _cleanup(r.json()["id"])
    finally:
        _cleanup(admin_id, taken_id)
