"""
Circuit Builder API — test suite.

Run from backend/:  python -m pytest tests/test_circuit_builder_api.py -v

The Builder sends its gates in time order and gets back every chance, one
Bloch vector per qubit and which qubits are entangled. Running a circuit needs
a signed-in user, like the Quantum Simulator; the gate list stays public.
"""
from __future__ import annotations

import math
import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import User, ROLE_USER

URL = "/api/module3/simulate"


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="module")
def auth():
    tag = uuid.uuid4().hex[:10]
    db = SessionLocal()
    u = User(username=f"build_{tag}", email=f"build_{tag}@example.com", hashed_password=hash_password("TestPass123"),
             role=ROLE_USER, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    headers = {"Authorization": f"Bearer {token_for(u)}"}
    yield headers
    db.delete(u); db.commit(); db.close()


def _chances(r) -> dict:
    return {s["label"]: s["probability"] for s in r.json()["states"] if s["probability"] > 1e-9}


def test_running_a_circuit_needs_sign_in(client):
    assert client.post(URL, json={"num_qubits": 1, "gates": []}).status_code in (401, 403)


def test_the_gate_list_stays_public(client):
    r = client.get("/api/module3/gates")
    assert r.status_code == 200 and r.json()["single_qubit"][0]["name"] == "H"


def test_bell_pair_is_entangled(client, auth):
    r = client.post(URL, headers=auth, json={"num_qubits": 2, "gates": [
        {"gate": "H", "qubit": 0}, {"gate": "CNOT", "qubit": 1, "control_qubit": 0}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert _chances(r) == pytest.approx({"|00⟩": 0.5, "|11⟩": 0.5})
    assert body["is_entangled"] and body["entangled_qubits"] == [0, 1]
    assert all(b["length"] < 1e-6 for b in body["bloch"])
    assert sum(body["counts"].values()) == 1024


def test_q0_is_the_leftmost_bit(client, auth):
    r = client.post(URL, headers=auth, json={"num_qubits": 2, "gates": [{"gate": "X", "qubit": 0}]})
    assert _chances(r) == pytest.approx({"|10⟩": 1.0})


def test_typed_angles_reach_the_engine(client, auth):
    # RY(θ) gives P(1) = sin²(θ/2); pi/8 is an angle the old slider could not set
    theta = math.pi / 8
    r = client.post(URL, headers=auth, json={"num_qubits": 1, "gates": [{"gate": "RY", "qubit": 0, "angle": theta}]})
    assert _chances(r)["|1⟩"] == pytest.approx(math.sin(theta / 2) ** 2, abs=1e-6)


def test_toffoli_is_a_reversible_and(client, auth):
    r = client.post(URL, headers=auth, json={"num_qubits": 3, "gates": [
        {"gate": "X", "qubit": 0}, {"gate": "X", "qubit": 1},
        {"gate": "CCX", "qubit": 2, "control_qubit": 0, "control2": 1}]})
    assert _chances(r) == pytest.approx({"|111⟩": 1.0})


@pytest.mark.parametrize("body, status", [
    ({"num_qubits": 2, "gates": [{"gate": "CNOT", "qubit": 1, "control_qubit": 1}]}, 400),
    ({"num_qubits": 2, "gates": [{"gate": "H", "qubit": 2}]}, 400),
    ({"num_qubits": 1, "gates": [{"gate": "FOO", "qubit": 0}]}, 400),
    ({"num_qubits": 3, "gates": [{"gate": "CCX", "qubit": 2, "control_qubit": 0, "control2": 0}]}, 400),
    ({"num_qubits": 7, "gates": []}, 422),
])
def test_bad_circuits_are_refused(client, auth, body, status):
    assert client.post(URL, headers=auth, json=body).status_code == status
