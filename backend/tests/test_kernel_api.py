"""
Quantum Simulator API — test suite.

Run from backend/:  python -m pytest tests/test_kernel_api.py -v

Running the simulator needs a signed-in user, every preset proves itself
against the textbook answer, tiny chances keep their real value, and a run
stops as soon as the page asks (or leaves).
"""
from __future__ import annotations

import math
import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import User, ROLE_USER
from app.modules.module1_kernel import QuantumCircuit, SimulationCancelled


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="module")
def token():
    tag = uuid.uuid4().hex[:10]
    db = SessionLocal()
    u = User(username=f"kern_{tag}", email=f"kern_{tag}@example.com", hashed_password=hash_password("TestPass123"),
             role=ROLE_USER, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    tok = token_for(u)
    yield tok
    db.delete(u); db.commit(); db.close()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _preset(client, token, preset: str, n: int) -> dict:
    r = client.post("/api/kernel/preset", headers=_auth(token), json={"preset": preset, "n_qubits": n})
    assert r.status_code == 200, r.text
    return r.json()["result"]


def _until(ws, *types: str) -> tuple[dict, list[dict]]:
    """Read socket messages until one of `types` arrives; return it and everything before."""
    seen = []
    while True:
        msg = ws.receive_json()
        if msg["type"] in types:
            return msg, seen
        seen.append(msg)


# ── Sign-in ──────────────────────────────────────────────────────────────────

def test_running_the_simulator_needs_sign_in(client):
    assert client.post("/api/kernel/preset", json={"preset": "bell", "n_qubits": 2}).status_code in (401, 403)
    assert client.post("/api/kernel/simulate", json={"n_qubits": 1, "operations": []}).status_code in (401, 403)
    assert client.post("/api/kernel/export/qiskit", json={"n_qubits": 1, "operations": []}).status_code in (401, 403)
    assert client.get("/api/kernel/memory", params={"n_qubits": 4}).status_code in (401, 403)
    # fixed facts stay public
    assert client.get("/api/kernel/gates").status_code == 200
    assert client.get("/api/kernel/ram-table").status_code == 200


def test_the_live_socket_needs_sign_in(client):
    with client.websocket_connect("/api/kernel/ws/abc") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error" and "sign in" in msg["detail"]
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 4401


# ── Every preset matches the maths ───────────────────────────────────────────

@pytest.mark.parametrize("preset,n,kind", [
    ("bell", 2, "outcomes"),
    ("ghz", 2, "outcomes"), ("ghz", 5, "outcomes"), ("ghz", 12, "outcomes"),
    ("grover", 2, "marked"), ("grover", 3, "marked"), ("grover", 6, "marked"), ("grover", 10, "marked"),
    ("qft_pattern", 2, "outcomes"), ("qft_pattern", 3, "outcomes"), ("qft_pattern", 8, "outcomes"),
    ("qft_pattern", 14, "outcomes"),
    ("qft", 3, "uniform"), ("qft", 6, "uniform"),
    ("ansatz", 4, "norm"), ("ansatz", 9, "norm"),
])
def test_every_preset_matches_the_textbook_answer(client, token, preset, n, kind):
    check = _preset(client, token, preset, n)["check"]
    assert check["kind"] == kind
    assert check["passed"] is True and check["max_error"] < 1e-6, check


def test_the_pattern_finder_gives_four_even_peaks(client, token):
    result = _preset(client, token, "qft_pattern", 8)
    assert result["probabilities"] == pytest.approx(
        {"|00000000>": 0.25, "|01000000>": 0.25, "|10000000>": 0.25, "|11000000>": 0.25}, abs=1e-9)


def test_grover_is_checked_against_its_real_success_chance(client, token):
    check = _preset(client, token, "grover", 3)["check"]
    theta = math.asin(1 / math.sqrt(8))
    assert check["expected"]["|111>"] == pytest.approx(math.sin(5 * theta) ** 2)   # 2 rounds → 94.5 %, not 100 %
    assert check["measured"]["|111>"] == pytest.approx(check["expected"]["|111>"], abs=1e-9)


def test_a_wrong_answer_would_fail_the_check():
    from app.routers.kernel import _theory_check
    fake = {"probabilities": {"|00>": 0.6, "|11>": 0.4}, "summary": {"norm": 1.0}}
    check = _theory_check("bell", 2, fake)
    assert check["passed"] is False and check["max_error"] == pytest.approx(0.1)


# ── Numbers ──────────────────────────────────────────────────────────────────

def test_tiny_chances_keep_their_value(client, token):
    n = 22
    r = client.post("/api/kernel/simulate", headers=_auth(token),
                    json={"n_qubits": n, "operations": [{"gate": "H", "qubits": [q]} for q in range(n)]})
    assert r.status_code == 200, r.text
    probs = list(r.json()["result"]["probabilities"].values())
    assert len(probs) == 1024
    assert all(p == pytest.approx(2.0 ** -n, rel=1e-6) for p in probs)   # 2.38e-7, not 2.4e-7


def test_memory_check_reports_exact_sizes_and_the_limit(client, token):
    r = client.get("/api/kernel/memory", params={"n_qubits": 10}, headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["required_bytes"] == 2 ** 10 * 16
    assert 0 < body["limit_bytes"] <= 5e9


# ── Stopping a run ───────────────────────────────────────────────────────────

def test_a_run_stops_between_gates_when_asked():
    circ = QuantumCircuit(3, max_gates=100)
    for _ in range(40):
        circ.h(0)
    asked = []

    def should_stop() -> bool:
        asked.append(1)
        return len(asked) > 5

    with pytest.raises(SimulationCancelled, match="after 5 of 40"):
        circ.run(should_stop=should_stop)


def test_the_socket_streams_progress_and_the_check(client, token):
    with client.websocket_connect(f"/api/kernel/ws/t1?token={token}") as ws:
        ws.send_json({"action": "preset", "payload": {"preset": "ghz", "n_qubits": 6}})
        msg, before = _until(ws, "result", "error")
        assert msg["type"] == "result", msg
        assert any(m["type"] == "progress" for m in before)
        assert msg["result"]["check"]["passed"] is True


def test_cancel_stops_a_running_simulation_and_the_socket_stays_usable(client, token):
    with client.websocket_connect(f"/api/kernel/ws/t2?token={token}") as ws:
        ws.send_json({"action": "preset", "payload": {"preset": "qft_pattern", "n_qubits": 22}})
        ws.send_json({"action": "cancel"})
        msg, _ = _until(ws, "cancelled", "result", "error")
        assert msg["type"] == "cancelled", msg
        ws.send_json({"action": "ping"})
        assert _until(ws, "pong")[0]["type"] == "pong"


def test_a_bad_request_gets_a_plain_error(client, token):
    with client.websocket_connect(f"/api/kernel/ws/t3?token={token}") as ws:
        ws.send_json({"action": "preset", "payload": {"preset": "ghz", "n_qubits": 99}})
        msg, _ = _until(ws, "error", "result")
        assert msg["type"] == "error" and msg["detail"].startswith("Invalid request: n_qubits")


def test_closing_the_page_stops_the_run_on_the_server(client, token, monkeypatch):
    import threading
    stopped = threading.Event()
    original = QuantumCircuit.run

    def watched_run(self, *args, **kwargs):
        try:
            return original(self, *args, **kwargs)
        except SimulationCancelled:
            stopped.set()
            raise

    monkeypatch.setattr(QuantumCircuit, "run", watched_run)
    with client.websocket_connect(f"/api/kernel/ws/t4?token={token}") as ws:
        ws.send_json({"action": "preset", "payload": {"preset": "qft_pattern", "n_qubits": 22}})
        _until(ws, "progress")                       # the run has started
    assert stopped.wait(10), "the run kept going after the page left"
