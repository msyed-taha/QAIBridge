"""
Module 8 — Interactive Performance Dashboard — tests.

Run from backend/:  python -m pytest tests/test_module8_dashboard.py -v

Covers the benchmark suites (REST and the live WebSocket stream), saving runs
to history, the CSV export, per-user isolation, and that Module 2 runs made
while signed in appear in the history.
"""
from __future__ import annotations

import csv
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password
from app.database import SessionLocal
from app.models.user import User, ROLE_USER
from app.modules.module8_dashboard.benchmarker import run_benchmark, headline

SMALL = {"search_max_qubits": 5, "factoring_max_n": 21, "maxcut_max_nodes": 5, "kernel_max_qubits": 12,
         "ai_iterations": 10}


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


def _mk_user():
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    email, pw = f"dash_{tag}@example.com", "DashPass123"
    u = User(username=f"dash_{tag}", email=email, hashed_password=hash_password(pw), role=ROLE_USER, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    uid = u.id
    db.close()
    return uid, email, pw


def _cleanup(uid):
    db = SessionLocal()
    u = db.query(User).filter(User.id == uid).first()
    if u:
        db.delete(u)
        db.commit()
    db.close()


def _headers(client, email, pw):
    tok = client.post("/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}, tok


def test_benchmark_suites_produce_real_points():
    events = []
    res = run_benchmark(["search", "factoring", "optimization", "kernel"], SMALL, events.append)
    s = res["suites"]
    assert [p["qubits"] for p in s["search"]["points"]] == [2, 3, 4, 5]
    assert all(p["success_probability"] > 0.9 for p in s["search"]["points"])
    assert all(p["success"] for p in s["factoring"]["points"])
    assert all(p["best_is_optimal"] for p in s["optimization"]["points"])
    assert s["kernel"]["points"][-1]["qubits"] == 12
    assert sum(1 for e in events if e["type"] == "point") == sum(len(v["points"]) for v in s.values())
    assert headline(res)["shor_success_rate"] == 1.0


def test_benchmark_history_csv_and_isolation(client):
    uid, email, pw = _mk_user()
    other_uid, other_email, other_pw = _mk_user()
    try:
        h, _ = _headers(client, email, pw)
        assert client.post("/api/dashboard/benchmark", json={"suites": ["search"]}).status_code in (401, 403)
        r = client.post("/api/dashboard/benchmark", json={"suites": ["search", "kernel"], "options": SMALL}, headers=h)
        assert r.status_code == 200, r.text
        run_id = r.json()["run_id"]
        runs = client.get("/api/dashboard/history", headers=h).json()["runs"]
        assert runs[0]["id"] == run_id and runs[0]["kind"] == "benchmark"
        full = client.get(f"/api/dashboard/history/{run_id}", headers=h).json()
        assert "search" in full["payload"]["suites"]
        csv_resp = client.get(f"/api/dashboard/history/{run_id}/csv", headers=h)
        assert csv_resp.status_code == 200 and csv_resp.headers["content-type"].startswith("text/csv")
        rows = list(csv.DictReader(io.StringIO(csv_resp.text)))
        assert {r["suite"] for r in rows} == {"search", "kernel"}
        overview = client.get("/api/dashboard/overview", headers=h).json()
        assert overview["total_runs"] >= 1 and overview["kpi"]["kernel_max_qubits"] == 12

        oh, _ = _headers(client, other_email, other_pw)
        assert client.get(f"/api/dashboard/history/{run_id}", headers=oh).status_code == 404
        assert client.delete(f"/api/dashboard/history/{run_id}", headers=oh).status_code == 404
        assert client.delete(f"/api/dashboard/history/{run_id}", headers=h).status_code == 204
        assert client.get(f"/api/dashboard/history/{run_id}", headers=h).status_code == 404
    finally:
        _cleanup(uid)
        _cleanup(other_uid)


def test_benchmark_websocket_streams_points(client):
    uid, email, pw = _mk_user()
    try:
        _, token = _headers(client, email, pw)
        with client.websocket_connect(f"/api/dashboard/ws/benchmark?token={token}") as ws:
            ws.send_json({"action": "run", "suites": ["search"], "options": {"search_max_qubits": 4}})
            kinds, points = [], 0
            while True:
                msg = ws.receive_json()
                kinds.append(msg["type"])
                points += msg["type"] == "point"
                if msg["type"] in ("done", "error"):
                    break
        assert kinds[0] == "start" and kinds[-1] == "done" and points == 3
        with client.websocket_connect("/api/dashboard/ws/benchmark?token=bad") as ws:
            assert ws.receive_json()["type"] == "error"
    finally:
        _cleanup(uid)


def test_module2_runs_are_recorded_for_signed_in_users(client):
    uid, email, pw = _mk_user()
    try:
        h, _ = _headers(client, email, pw)
        r = client.post("/api/module2/run", json={"algorithm": "factoring", "N": 15, "seed": 1}, headers=h)
        assert r.status_code == 200 and r.json()["run_id"]
        anon = client.post("/api/module2/run", json={"algorithm": "factoring", "N": 15, "seed": 1})
        assert anon.status_code == 200 and "run_id" not in anon.json()
        runs = client.get("/api/dashboard/history?kind=sfod", headers=h).json()["runs"]
        assert len(runs) == 1 and runs[0]["summary"]["quantum_correct"] is True
    finally:
        _cleanup(uid)
