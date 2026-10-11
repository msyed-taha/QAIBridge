"""
Quantum Simulator API — test suite.

Run from backend/:  python -m pytest tests/test_kernel_api.py -v

Running the simulator needs a signed-in user, circuits arrive as OpenQASM
text, every example proves itself against the textbook answer, tiny chances
keep their real value, and a run stops as soon as the page asks (or leaves).
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


def _example(client, token, example: str, n: int) -> str:
    r = client.get(f"/api/kernel/examples/{example}", params={"n_qubits": n}, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["qasm"]


def _run(client, token, source: str) -> dict:
    r = client.post("/api/kernel/qasm", headers=_auth(token), json={"source": source})
    assert r.status_code == 200, r.text
    return r.json()["result"]


BELL = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0], q[1];\nmeasure q -> c;\n'


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
    assert client.post("/api/kernel/qasm", json={"source": BELL}).status_code in (401, 403)
    assert client.post("/api/kernel/qasm/inspect", json={"source": BELL}).status_code in (401, 403)
    assert client.get("/api/kernel/examples/ghz").status_code in (401, 403)
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


# ── Examples prove themselves ────────────────────────────────────────────────

@pytest.mark.parametrize("example,n,kind", [
    ("ghz", 2, "outcomes"), ("ghz", 5, "outcomes"), ("ghz", 12, "outcomes"),
    ("qft_pattern", 2, "outcomes"), ("qft_pattern", 3, "outcomes"), ("qft_pattern", 8, "outcomes"),
    ("qft_pattern", 14, "outcomes"),
    ("layered", 4, "norm"), ("layered", 9, "norm"),
    ("random", 3, "norm"), ("random", 10, "norm"),
])
def test_every_example_matches_the_textbook_answer(client, token, example, n, kind):
    result = _run(client, token, _example(client, token, example, n))
    assert result["example"] == example
    assert result["check"]["kind"] == kind
    assert result["check"]["passed"] is True and result["check"]["max_error"] < 1e-6, result["check"]


def test_the_pattern_finder_gives_four_even_peaks(client, token):
    result = _run(client, token, _example(client, token, "qft_pattern", 8))
    assert result["probabilities"] == pytest.approx(
        {"|00000000>": 0.25, "|01000000>": 0.25, "|10000000>": 0.25, "|11000000>": 0.25}, abs=1e-9)


def test_an_example_is_still_recognised_with_other_comments_and_spacing(client, token):
    source = _example(client, token, "ghz", 4).replace("cx q[0], q[1];", "  cx q[0],q[1];   // link\n")
    inspected = client.post("/api/kernel/qasm/inspect", headers=_auth(token), json={"source": source}).json()
    assert inspected["ok"] and inspected["example"] == "ghz"


def test_a_changed_example_is_your_own_circuit(client, token):
    source = _example(client, token, "ghz", 4).replace("cx q[2], q[3];", "x q[3];")
    result = _run(client, token, source)
    assert result["example"] is None and result["check"]["kind"] == "norm"   # no claim about GHZ any more


def test_a_wrong_answer_would_fail_the_check():
    from app.routers.kernel import _theory_check
    fake = {"probabilities": {"|00>": 0.6, "|11>": 0.4}, "summary": {"norm": 1.0}}
    check = _theory_check("ghz", 2, fake)
    assert check["passed"] is False and check["max_error"] == pytest.approx(0.1)


def test_unknown_or_oversized_examples_are_refused(client, token):
    assert client.get("/api/kernel/examples/grover", headers=_auth(token)).status_code == 404
    assert client.get("/api/kernel/examples/ghz", params={"n_qubits": 29}, headers=_auth(token)).status_code == 422


# ── Reading your own circuit ─────────────────────────────────────────────────

def test_inspect_reports_the_size_or_the_line_of_the_problem(client, token):
    ok = client.post("/api/kernel/qasm/inspect", headers=_auth(token), json={"source": BELL}).json()
    assert ok == {"ok": True, "n_qubits": 2, "gate_count": 2, "depth": 2, "required_bytes": 64,
                  "labels": ["q[0]", "q[1]"], "example": "ghz"}            # a Bell pair is the 2-qubit GHZ
    bad = client.post("/api/kernel/qasm/inspect", headers=_auth(token),
                      json={"source": BELL.replace("cx q[0], q[1];", "cx q[0], q[2];")}).json()
    assert bad == {"ok": False, "error": {"line": 6, "message": "q[2] doesn't exist: 'q' has 2 qubits (q[0] to q[1])."}}


def test_a_circuit_with_a_mistake_is_refused_with_its_line(client, token):
    r = client.post("/api/kernel/qasm", headers=_auth(token), json={"source": BELL.replace("h q[0];", "hh q[0];")})
    assert r.status_code == 422 and r.json()["detail"].startswith("Line 5: Unknown gate 'hh'")


def test_results_name_every_qubit(client, token):
    source = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] a;\nqubit b;\nx b;\nh a[1];\n'
    result = _run(client, token, source)
    assert result["labels"] == ["a[0]", "a[1]", "b"]
    assert result["probabilities"] == pytest.approx({"|001>": 0.5, "|011>": 0.5})


# ── Numbers ──────────────────────────────────────────────────────────────────

def test_tiny_chances_keep_their_value(client, token):
    n = 22
    probs = list(_run(client, token, f"OPENQASM 2.0;\ninclude \"qelib1.inc\";\nqreg q[{n}];\nh q;\n")["probabilities"].values())
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
        ws.send_json({"action": "qasm", "payload": {"source": _example(client, token, "ghz", 6)}})
        msg, before = _until(ws, "result", "error")
        assert msg["type"] == "result", msg
        assert any(m["type"] == "progress" for m in before)
        assert msg["result"]["example"] == "ghz" and msg["result"]["check"]["passed"] is True


def test_cancel_stops_a_running_simulation_and_the_socket_stays_usable(client, token):
    with client.websocket_connect(f"/api/kernel/ws/t2?token={token}") as ws:
        ws.send_json({"action": "qasm", "payload": {"source": _example(client, token, "qft_pattern", 22)}})
        ws.send_json({"action": "cancel"})
        msg, _ = _until(ws, "cancelled", "result", "error")
        assert msg["type"] == "cancelled", msg
        ws.send_json({"action": "ping"})
        assert _until(ws, "pong")[0]["type"] == "pong"


def test_a_bad_request_gets_a_plain_error(client, token):
    with client.websocket_connect(f"/api/kernel/ws/t3?token={token}") as ws:
        ws.send_json({"action": "qasm", "payload": {"source": BELL, "shots": 0}})
        msg, _ = _until(ws, "error", "result")
        assert msg["type"] == "error" and msg["detail"].startswith("Invalid request: shots")
        ws.send_json({"action": "qasm", "payload": {"source": BELL.replace("h q[0];", "h q[0]")}})
        msg, _ = _until(ws, "error", "result")
        assert msg == {"type": "error", "detail": "Line 5: Missing ';' at the end of this line.", "line": 5}


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
        ws.send_json({"action": "qasm", "payload": {"source": _example(client, token, "qft_pattern", 22)}})
        _until(ws, "progress")                       # the run has started
    assert stopped.wait(10), "the run kept going after the page left"


# ── Step by step ─────────────────────────────────────────────────────────────

def _steps(client, token, source: str):
    return client.post("/api/kernel/qasm/steps", headers=_auth(token), json={"source": source})


def test_step_by_step_shows_the_chances_after_every_gate(client, token):
    r = _steps(client, token, BELL)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["labels"] == ["q[0]", "q[1]"]
    start, h, cx = body["steps"]
    assert start["gate"] is None and start["probs"] == [1, 0, 0, 0]
    assert (h["gate"], h["qubits"], h["line"]) == ("H", [0], 5) and h["probs"] == [0.5, 0, 0.5, 0]
    assert (cx["gate"], cx["qubits"], cx["line"]) == ("CNOT", [0, 1], 6) and cx["probs"] == [0.5, 0, 0, 0.5]


def test_step_by_step_says_when_a_gate_only_turns_hidden_phases(client, token):
    src = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nh q[0];\nz q[0];\nh q[0];\nz q[0];\n'
    steps = _steps(client, token, src).json()["steps"]
    assert [s["phase_only"] for s in steps] == [False, False, True, False, False]   # the last z acts on a sure 1
    assert steps[3]["probs"] == [0, 1]           # the hidden turn decided where the mix went


def test_a_broadcast_gate_is_one_step_per_qubit_on_the_same_line(client, token):
    steps = _steps(client, token, 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nh q;\n').json()["steps"]
    assert [(s["qubits"], s["line"]) for s in steps[1:]] == [([0], 4), ([1], 4), ([2], 4)]


def test_step_by_step_is_kept_to_small_circuits(client, token):
    r = _steps(client, token, _example(client, token, "ghz", 9))
    assert r.status_code == 422 and "up to 8 qubits" in r.json()["detail"]
    assert client.post("/api/kernel/qasm/steps", json={"source": BELL}).status_code in (401, 403)
