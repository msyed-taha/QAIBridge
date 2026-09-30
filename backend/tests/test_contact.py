"""
Contact form — test suite.

Run from backend/:  python -m pytest tests/test_contact.py -v

Covers the public POST /api/contact (validation, honeypot, rate limit, signed-in
sender) and the admin inbox (/api/admin/messages: list, read/unread, delete).
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models.contact import ContactMessage
from app.models.user import User, ROLE_ADMIN, ROLE_USER
from app.routers import contact as contact_router


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_rate_limit():
    contact_router._recent.clear()
    yield
    contact_router._recent.clear()


def _mk_user(role: str = ROLE_USER) -> tuple[int, str, str]:
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email, pw = f"contact_{tag}@example.com", "TestPass123"
    u = User(username=f"contact_{tag}", email=email, hashed_password=hash_password(pw), role=role, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    uid = u.id
    db.close()
    return uid, email, pw


def _auth(client, email, pw) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _messages_from(email: str) -> list[ContactMessage]:
    db = SessionLocal()
    rows = db.query(ContactMessage).filter(ContactMessage.email == email).all()
    db.close()
    return rows


def _cleanup(email: str, *uids: int) -> None:
    db = SessionLocal()
    db.query(ContactMessage).filter(ContactMessage.email == email).delete()
    for uid in uids:
        u = db.query(User).filter(User.id == uid).first()
        if u:
            db.delete(u)
    db.commit()
    db.close()


def _body(email: str, **over) -> dict:
    return {**{"name": "Ayesha Khan", "email": email, "subject": "Pricing",
               "message": "Hello, can my university use QAIbridge for a course?"}, **over}


def test_guest_can_send_a_message(client):
    email = f"guest_{uuid.uuid4().hex[:8]}@example.com"
    try:
        r = client.post("/api/contact", json=_body(email))
        assert r.status_code == 201, r.text
        [m] = _messages_from(email)
        assert m.name == "Ayesha Khan" and m.subject == "Pricing" and not m.is_read and m.user_id is None
    finally:
        _cleanup(email)


def test_signed_in_sender_is_linked(client):
    uid, email, pw = _mk_user()
    try:
        r = client.post("/api/contact", json=_body(email, subject="  "), headers=_auth(client, email, pw))
        assert r.status_code == 201
        [m] = _messages_from(email)
        assert m.user_id == uid and m.subject is None
    finally:
        _cleanup(email, uid)


@pytest.mark.parametrize("over", [
    {"email": "not-an-email"}, {"name": ""}, {"name": "   "}, {"message": "too short"},
    {"message": "x" * 5001}, {"subject": "s" * 151},
])
def test_invalid_messages_are_rejected(client, over):
    email = f"bad_{uuid.uuid4().hex[:8]}@example.com"
    try:
        assert client.post("/api/contact", json={**_body(email), **over}).status_code == 422
        assert _messages_from(email) == []
    finally:
        _cleanup(email)


def test_honeypot_looks_successful_but_stores_nothing(client):
    email = f"bot_{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/contact", json=_body(email, website="http://spam.example"))
    assert r.status_code == 201
    assert _messages_from(email) == []


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(contact_router, "RATE_LIMIT", 2)
    email = f"flood_{uuid.uuid4().hex[:8]}@example.com"
    try:
        assert client.post("/api/contact", json=_body(email)).status_code == 201
        assert client.post("/api/contact", json=_body(email)).status_code == 201
        assert client.post("/api/contact", json=_body(email)).status_code == 429
        # a different address is not affected
        r = client.post("/api/contact", json=_body(email), headers={"X-Forwarded-For": "203.0.113.9"})
        assert r.status_code == 201
        assert len(_messages_from(email)) == 3
    finally:
        _cleanup(email)


def test_admin_inbox(client):
    admin_id, a_email, a_pw = _mk_user(ROLE_ADMIN)
    email = f"inbox_{uuid.uuid4().hex[:8]}@example.com"
    try:
        h = _auth(client, a_email, a_pw)
        before = client.get("/api/admin/stats", headers=h).json()["unread_messages"]
        client.post("/api/contact", json=_body(email))
        assert client.get("/api/admin/stats", headers=h).json()["unread_messages"] == before + 1

        msg = next(m for m in client.get("/api/admin/messages", headers=h).json() if m["email"] == email)
        assert not msg["is_read"]
        assert any(m["id"] == msg["id"] for m in client.get("/api/admin/messages?unread=true", headers=h).json())

        r = client.patch(f"/api/admin/messages/{msg['id']}", json={"is_read": True}, headers=h)
        assert r.status_code == 200 and r.json()["is_read"]
        assert all(m["id"] != msg["id"] for m in client.get("/api/admin/messages?unread=true", headers=h).json())

        assert client.delete(f"/api/admin/messages/{msg['id']}", headers=h).status_code == 204
        assert client.delete(f"/api/admin/messages/{msg['id']}", headers=h).status_code == 404
        assert _messages_from(email) == []
    finally:
        _cleanup(email, admin_id)


def test_normal_users_cannot_read_the_inbox(client):
    uid, email, pw = _mk_user()
    try:
        h = _auth(client, email, pw)
        assert client.get("/api/admin/messages", headers=h).status_code == 403
        assert client.get("/api/admin/messages").status_code == 403
    finally:
        _cleanup(email, uid)
