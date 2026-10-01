"""
Legal promises — test suite.

Run from backend/:  python -m pytest tests/test_legal.py -v

What the Privacy Policy / Terms of Use say must actually happen:
  1. Sign-up needs "I am 13+ and agree to the Terms and Privacy Policy", and
     the acceptance (time + version) is recorded.
  2. A self-deleted account (with its run history) is erased for good after
     30 days; within 30 days signing up again restores it, after that it is a
     brand-new account.
  3. Contact-form messages are erased after 12 months.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.database import SessionLocal
from app.legal import CONTACT_MESSAGE_RETENTION_DAYS, DELETED_ACCOUNT_RETENTION_DAYS, TERMS_VERSION, purge_expired
from app.models.benchmark import BenchmarkRun
from app.models.contact import ContactMessage
from app.models.user import User, ROLE_USER


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


def _mk_user(deleted_days_ago: float | None = None) -> tuple[int, str]:
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email = f"legal_{tag}@example.com"
    u = User(username=f"legal_{tag}", email=email, hashed_password=hash_password("TestPass123"), role=ROLE_USER,
             is_active=deleted_days_ago is None,
             deleted_at=None if deleted_days_ago is None else datetime.now(timezone.utc) - timedelta(days=deleted_days_ago))
    db.add(u); db.commit(); db.refresh(u)
    uid = u.id
    db.close()
    return uid, email


def _add_run(uid: int) -> int:
    db = SessionLocal()
    run = BenchmarkRun(user_id=uid, kind="sfod", title="Factoring — N = 91", summary={})
    db.add(run); db.commit(); db.refresh(run)
    rid = run.id
    db.close()
    return rid


def _add_message(email: str, uid: int | None, days_ago: float = 0) -> int:
    db = SessionLocal()
    m = ContactMessage(name="Test", email=email, message="Hello there, just testing.", user_id=uid,
                       created_at=datetime.now(timezone.utc) - timedelta(days=days_ago))
    db.add(m); db.commit(); db.refresh(m)
    mid = m.id
    db.close()
    return mid


def _get(model, pk):
    db = SessionLocal()
    row = db.get(model, pk)
    db.close()
    return row


def _cleanup(*uids: int, emails: tuple[str, ...] = ()) -> None:
    db = SessionLocal()
    for uid in uids:
        u = db.get(User, uid)
        if u:
            db.delete(u)
    for e in emails:
        db.query(ContactMessage).filter(ContactMessage.email == e).delete()
        db.query(User).filter(User.email == e).delete()
    db.commit()
    db.close()


def _signup(client, monkeypatch, email: str, username: str, accept_terms=True):
    sent = {}
    monkeypatch.setattr("app.routers.auth.send_otp", lambda to, otp, **kw: sent.update(otp=otp))
    assert client.post("/api/auth/send-otp", json={"email": email}).status_code == 200
    assert client.post("/api/auth/verify-otp", json={"email": email, "otp": sent["otp"]}).status_code == 200
    body = {"username": username, "email": email, "password": "FreshPass123"}
    if accept_terms is not None:
        body["accept_terms"] = accept_terms
    return client.post("/api/auth/register", json=body)


# ── 1. Consent at sign-up ───────────────────────────────────────────────────

@pytest.mark.parametrize("accept", [None, False])
def test_sign_up_requires_accepting_the_terms(client, monkeypatch, accept):
    email = f"noterms_{uuid.uuid4().hex[:8]}@example.com"
    try:
        r = _signup(client, monkeypatch, email, f"nt_{uuid.uuid4().hex[:6]}", accept_terms=accept)
        assert r.status_code == 422
        assert "Terms of Use and Privacy Policy" in r.text
        db = SessionLocal()
        assert db.query(User).filter(User.email == email).first() is None
        db.close()
    finally:
        _cleanup(emails=(email,))


def test_acceptance_is_recorded(client, monkeypatch):
    email = f"terms_{uuid.uuid4().hex[:8]}@example.com"
    try:
        before = datetime.now(timezone.utc)
        r = _signup(client, monkeypatch, email, f"t_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 201, r.text
        u = _get(User, r.json()["user"]["id"])
        assert u.terms_version == TERMS_VERSION
        assert u.terms_accepted_at is not None and u.terms_accepted_at >= before - timedelta(seconds=5)
    finally:
        _cleanup(emails=(email,))


# ── 2. Deleted accounts: 30 days, then erased ───────────────────────────────

def test_purge_erases_expired_accounts_and_their_history_only():
    old_uid, old_email = _mk_user(deleted_days_ago=DELETED_ACCOUNT_RETENTION_DAYS + 1)
    new_uid, new_email = _mk_user(deleted_days_ago=DELETED_ACCOUNT_RETENTION_DAYS - 5)
    live_uid, live_email = _mk_user()
    try:
        old_run, live_run = _add_run(old_uid), _add_run(live_uid)
        msg = _add_message(old_email, old_uid)

        erased = purge_expired(SessionLocal())
        assert erased["accounts"] >= 1

        assert _get(User, old_uid) is None
        assert _get(BenchmarkRun, old_run) is None          # history goes with the account
        assert _get(ContactMessage, msg).user_id is None     # message kept (its own 12-month rule), unlinked
        assert _get(User, new_uid) is not None               # still inside the 30-day window
        assert _get(User, live_uid) is not None and _get(BenchmarkRun, live_run) is not None
    finally:
        _cleanup(old_uid, new_uid, live_uid, emails=(old_email, new_email, live_email))


def test_signing_up_after_30_days_creates_a_fresh_account(client, monkeypatch):
    old_uid, email = _mk_user(deleted_days_ago=DELETED_ACCOUNT_RETENTION_DAYS + 2)
    old_run = _add_run(old_uid)
    try:
        r = _signup(client, monkeypatch, email, f"fresh_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 201, r.text
        assert r.json()["user"]["id"] != old_uid
        assert _get(User, old_uid) is None and _get(BenchmarkRun, old_run) is None
    finally:
        _cleanup(old_uid, emails=(email,))


def test_signing_up_within_30_days_restores_the_account(client, monkeypatch):
    uid, email = _mk_user(deleted_days_ago=DELETED_ACCOUNT_RETENTION_DAYS - 1)
    run = _add_run(uid)
    try:
        r = _signup(client, monkeypatch, email, f"back_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 201, r.text
        assert r.json()["user"]["id"] == uid
        assert _get(BenchmarkRun, run) is not None
        assert _get(User, uid).deleted_at is None
    finally:
        _cleanup(uid, emails=(email,))


# ── 3. Contact messages: 12 months ──────────────────────────────────────────

def test_old_contact_messages_are_erased():
    email = f"msg_{uuid.uuid4().hex[:8]}@example.com"
    try:
        old = _add_message(email, None, days_ago=CONTACT_MESSAGE_RETENTION_DAYS + 1)
        recent = _add_message(email, None, days_ago=CONTACT_MESSAGE_RETENTION_DAYS - 30)
        purge_expired(SessionLocal())
        assert _get(ContactMessage, old) is None
        assert _get(ContactMessage, recent) is not None
    finally:
        _cleanup(emails=(email,))
