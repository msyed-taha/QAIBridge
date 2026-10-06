"""
Learn progress — test suite.

Run from backend/:  python -m pytest tests/test_learn.py -v

Covers GET/POST /api/learn/progress: sign-in required, saving, best-only
merging (progress never goes down), validation, carrying several lessons over
at once, accounts kept apart, and erasure together with the account.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models.learn import LearnProgress
from app.models.user import User, ROLE_USER

URL = "/api/learn/progress"


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture
def make_user():
    """Creates throwaway accounts and erases them (and their progress) afterwards."""
    made: list[int] = []

    def _make() -> tuple[int, str, str]:
        tag = uuid.uuid4().hex[:10]
        email, pw = f"learn_{tag}@example.com", "TestPass123"
        with SessionLocal() as db:
            u = User(username=f"learn_{tag}", email=email, hashed_password=hash_password(pw), role=ROLE_USER, is_active=True)
            db.add(u)
            db.commit()
            made.append(u.id)
            return u.id, email, pw

    yield _make
    with SessionLocal() as db:
        db.query(User).filter(User.id.in_(made)).delete(synchronize_session=False)
        db.commit()


def _auth(client, email: str, pw: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def signed_in(client, make_user):
    uid, email, pw = make_user()
    return uid, _auth(client, email, pw)


def _save(client, headers, lessons: dict):
    return client.post(URL, json={"lessons": lessons}, headers=headers)


def _rows(uid: int) -> list[LearnProgress]:
    with SessionLocal() as db:
        return db.query(LearnProgress).filter(LearnProgress.user_id == uid).all()


def test_needs_sign_in(client):
    assert client.get(URL).status_code in (401, 403)
    assert client.post(URL, json={"lessons": {"superposition": {"stars": 1}}}).status_code in (401, 403)
    bad = {"Authorization": "Bearer not-a-real-token"}
    assert client.get(URL, headers=bad).status_code == 401


def test_new_account_has_no_progress(client, signed_in):
    _, headers = signed_in
    r = client.get(URL, headers=headers)
    assert r.status_code == 200
    assert r.json() == {"lessons": {}}


def test_saves_a_lesson(client, signed_in):
    uid, headers = signed_in
    r = _save(client, headers, {"superposition": {"stars": 2}})
    assert r.status_code == 200, r.text
    assert r.json()["lessons"] == {"superposition": {"stars": 2, "quiz_score": None, "completed": False}}
    assert client.get(URL, headers=headers).json() == r.json()
    assert len(_rows(uid)) == 1


def test_progress_only_goes_up(client, signed_in):
    _, headers = signed_in
    _save(client, headers, {"measurement": {"stars": 3, "quiz_score": 2, "completed": True}})
    r = _save(client, headers, {"measurement": {"stars": 1, "quiz_score": 1, "completed": False}})
    assert r.json()["lessons"]["measurement"] == {"stars": 3, "quiz_score": 2, "completed": True}
    r = _save(client, headers, {"measurement": {"quiz_score": 3}})
    assert r.json()["lessons"]["measurement"] == {"stars": 3, "quiz_score": 3, "completed": True}


def test_a_missing_quiz_score_keeps_the_saved_one(client, signed_in):
    _, headers = signed_in
    _save(client, headers, {"interference": {"quiz_score": 2, "completed": True}})
    r = _save(client, headers, {"interference": {"stars": 1}})
    assert r.json()["lessons"]["interference"] == {"stars": 1, "quiz_score": 2, "completed": True}


def test_the_first_finish_time_is_kept(client, signed_in):
    uid, headers = signed_in
    _save(client, headers, {"entanglement": {"completed": True, "quiz_score": 1}})
    first = _rows(uid)[0].completed_at
    assert first is not None
    _save(client, headers, {"entanglement": {"completed": True, "quiz_score": 3}})
    assert _rows(uid)[0].completed_at == first


def test_carries_several_lessons_over_at_once(client, signed_in):
    uid, headers = signed_in
    lessons = {
        "bit-vs-qubit": {"stars": 3, "quiz_score": 3, "completed": True},
        "superposition": {"stars": 1},
        "measurement": {"stars": 2, "quiz_score": 1, "completed": True},
    }
    r = _save(client, headers, lessons)
    assert r.status_code == 200, r.text
    got = r.json()["lessons"]
    assert set(got) == set(lessons)
    assert got["bit-vs-qubit"] == {"stars": 3, "quiz_score": 3, "completed": True}
    assert got["superposition"] == {"stars": 1, "quiz_score": None, "completed": False}
    assert len(_rows(uid)) == 3


def test_an_empty_save_changes_nothing(client, signed_in):
    _, headers = signed_in
    _save(client, headers, {"decoherence": {"stars": 2}})
    r = _save(client, headers, {})
    assert r.status_code == 200
    assert r.json()["lessons"] == {"decoherence": {"stars": 2, "quiz_score": None, "completed": False}}


@pytest.mark.parametrize("lessons", [
    {"not-a-lesson": {"stars": 1}},
    {"superposition": {"stars": 4}},
    {"superposition": {"stars": -1}},
    {"superposition": {"quiz_score": 4}},
    {"superposition": {"quiz_score": -1}},
    {"superposition": {"stars": "lots"}},
])
def test_rejects_bad_progress(client, signed_in, lessons):
    uid, headers = signed_in
    r = _save(client, headers, lessons)
    assert r.status_code == 422, r.text
    assert _rows(uid) == []


def test_rejects_too_many_lessons(client, signed_in):
    _, headers = signed_in
    lessons = {f"lesson-{i}": {"stars": 1} for i in range(20)}
    assert _save(client, headers, lessons).status_code == 422


def test_accounts_are_kept_apart(client, make_user):
    a_id, a_email, a_pw = make_user()
    b_id, b_email, b_pw = make_user()
    a, b = _auth(client, a_email, a_pw), _auth(client, b_email, b_pw)
    _save(client, a, {"quantum-gates": {"stars": 3}})
    assert client.get(URL, headers=b).json() == {"lessons": {}}
    _save(client, b, {"quantum-gates": {"stars": 1}})
    assert client.get(URL, headers=a).json()["lessons"]["quantum-gates"]["stars"] == 3
    assert client.get(URL, headers=b).json()["lessons"]["quantum-gates"]["stars"] == 1


def test_progress_is_erased_with_the_account(client, make_user):
    uid, email, pw = make_user()
    _save(client, _auth(client, email, pw), {"quantum-advantage": {"stars": 2}})
    assert len(_rows(uid)) == 1
    with SessionLocal() as db:
        db.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db.commit()
    assert _rows(uid) == []
