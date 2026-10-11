"""
Describe a circuit (Circuit Builder) — tests.

Run from backend/:  python -m pytest tests/test_describe_circuit.py -v

A fake Claude answers (see conftest.py): nothing is sent and nothing is paid.
Checks that only circuits the Builder can draw reach the page, that the
simulator's real chances are compared with the AI's (and a wrong guess is
reported, not hidden), and that the person's text and canvas go as data.
"""
from __future__ import annotations

import json
import math
import uuid

import pytest
from fastapi.testclient import TestClient

from app.ai.describe_circuit import angle_from, compare, layout, read_circuit
from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import ROLE_USER, User

BELL = {"on_topic": True, "redirect": "", "qubits": 2,
        "gates": [{"gate": "H", "qubits": [0]}, {"gate": "CNOT", "qubits": [0, 1]}],
        "expected": {"00": 0.5, "11": 0.5},
        "explanation": "H puts q0 in a superposition, then CNOT copies it onto q1: 00 or 11, half the time each."}


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="module")
def auth():
    tag = uuid.uuid4().hex[:10]
    with SessionLocal() as db:
        u = User(username=f"dsc_{tag}", email=f"dsc_{tag}@example.com", hashed_password=hash_password("TestPass123"),
                 role=ROLE_USER, is_active=True)
        db.add(u); db.commit(); db.refresh(u)
        headers = {"Authorization": f"Bearer {token_for(u)}"}
    yield headers
    with SessionLocal() as db:
        db.query(User).filter(User.email == f"dsc_{tag}@example.com").delete()
        db.commit()


def _describe(client, auth, text, **extra):
    return client.post("/api/module3/describe", headers=auth, json={"text": text, **extra})


def test_needs_sign_in(client):
    assert client.post("/api/module3/describe", json={"text": "A Bell pair"}).status_code in (401, 403)


def test_builds_a_circuit_and_the_simulator_agrees(client, auth, fake_ai):
    fake_ai.reply = json.dumps(BELL)
    r = _describe(client, auth, "Make a Bell pair")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["layout"] == {"n": 2, "gates": [
        {"gate": "H", "col": 0, "target": 0, "controls": []},
        {"gate": "CNOT", "col": 1, "target": 1, "controls": [0]},
    ]}
    assert body["check"]["matches"] is True
    assert body["check"]["got"] == [{"outcome": "00", "chance": 0.5}, {"outcome": "11", "chance": 0.5}]
    assert body["explanation"].startswith("H puts q0") and body["ai_status"]["used_today"] == 1
    sent = fake_ai.calls[0]
    assert "<data>\nTheir description:\nMake a Bell pair" in sent["user"] and "Their canvas is empty." in sent["user"]
    assert "CCX (Toffoli)" in sent["system"] and "q0 first" in sent["system"] and sent["think"] is True


def test_a_wrong_guess_is_reported_not_hidden(client, auth, fake_ai):
    fake_ai.reply = json.dumps(BELL | {"expected": {"01": 0.5, "10": 0.5}})
    check = _describe(client, auth, "Make a Bell pair").json()["check"]
    assert check["matches"] is False
    assert [c["outcome"] for c in check["expected"]] == ["01", "10"] and [c["outcome"] for c in check["got"]] == ["00", "11"]


def test_the_outcomes_are_written_with_q0_first(client, auth, fake_ai):
    fake_ai.reply = json.dumps({"qubits": 3, "gates": [{"gate": "X", "qubits": [0]}], "expected": {"|100⟩": 1}})
    body = _describe(client, auth, "Flip the first of three qubits").json()
    assert body["check"]["matches"] is True and body["check"]["got"] == [{"outcome": "100", "chance": 1.0}]


def test_a_change_to_the_canvas_sends_the_circuit_too(client, auth, fake_ai):
    fake_ai.reply = json.dumps(BELL)
    qasm = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\nmeasure q -> c;\n'
    _describe(client, auth, "Now entangle q1 with q0", current_qasm=qasm)
    assert "The circuit on their canvas now (OpenQASM):\n" + qasm.strip() in fake_ai.calls[0]["user"]


def test_off_topic_gets_a_polite_redirect(client, auth, fake_ai):
    fake_ai.reply = json.dumps({"on_topic": False, "redirect": "This box builds quantum circuits, such as a Bell pair."})
    body = _describe(client, auth, "What should I cook tonight?").json()
    assert body["off_topic"] is True and body["message"].startswith("This box builds") and "layout" not in body


def test_gibberish_never_reaches_the_ai(client, auth, fake_ai):
    body = _describe(client, auth, "sdfgh qwrtz xcvbn").json()
    assert body["unavailable"].startswith("That doesn't look like a description") and fake_ai.calls == []


def test_without_the_ai_it_says_so(client, auth):
    body = _describe(client, auth, "A Bell pair").json()
    assert body["unavailable"] == "AI isn't set up on this server." and body["ai_status"]["available"] is False


@pytest.mark.parametrize("bad", [
    BELL | {"qubits": 7},
    BELL | {"gates": [{"gate": "U3", "qubits": [0]}]},
    BELL | {"gates": [{"gate": "CNOT", "qubits": [0, 0]}]},
    BELL | {"gates": [{"gate": "H", "qubits": [2]}]},
    BELL | {"gates": [{"gate": "RY", "qubits": [0]}]},
    BELL | {"gates": [{"gate": "RY", "qubits": [0], "angle": "__import__('os')"}]},
    BELL | {"gates": [{"gate": "H", "qubits": [0]}] * 121},
])
def test_a_circuit_the_builder_cant_draw_never_reaches_the_page(client, auth, fake_ai, bad):
    fake_ai.replies = [json.dumps(bad), json.dumps(BELL)]
    body = _describe(client, auth, "A Bell pair").json()
    assert body["unavailable"] == "The AI wrote a circuit the Builder can't use. Try saying it another way."
    # the unusable answer isn't kept: asking again goes back to the AI
    assert _describe(client, auth, "A Bell pair").json()["check"]["matches"] is True and len(fake_ai.calls) == 2


def test_not_json_is_unavailable(client, auth, fake_ai):
    fake_ai.reply = "Sure! First put an H on q0, then a CNOT."
    assert "can't use" in _describe(client, auth, "A Bell pair").json()["unavailable"]


def test_too_long_a_description_is_refused(client, auth):
    assert _describe(client, auth, "a" * 501).status_code == 422


# ── The parts on their own ───────────────────────────────────────────────────

@pytest.mark.parametrize("text, value", [
    (0.5, 0.5), (2, 2.0), ("pi/2", math.pi / 2), ("-3*pi/4", -3 * math.pi / 4), ("2pi/3", 2 * math.pi / 3),
    ("π/8", math.pi / 8), ("(pi+1)/2", (math.pi + 1) / 2), ("0.25", 0.25),
])
def test_angles_are_read_the_way_people_write_them(text, value):
    assert angle_from(text) == pytest.approx(value)


@pytest.mark.parametrize("text", ["", "pi/0", "os.system", "1e999", "pi pi)", True, "2**3"])
def test_anything_else_is_not_an_angle(text):
    with pytest.raises(ValueError):
        angle_from(text)


def test_aliases_and_toffoli():
    out = read_circuit(json.dumps({"qubits": 3, "gates": [
        {"gate": "cx", "qubits": [0, 1]}, {"gate": "Toffoli", "qubits": [0, 1, 2]}, {"gate": "S†", "qubits": 2},
        {"gate": "rz", "qubits": [1], "angle": "pi/4"}]}))
    assert [g["gate"] for g in out["gates"]] == ["CNOT", "CCX", "SDG", "RZ"] and out["expected"] is None


def test_percentages_are_read_as_chances_and_bad_ones_ignored():
    assert read_circuit(json.dumps(BELL | {"expected": {"00": 50, "11": 50}}))["expected"] == {"00": 0.5, "11": 0.5}
    assert read_circuit(json.dumps(BELL | {"expected": {"000": 1}}))["expected"] is None
    assert read_circuit(json.dumps(BELL | {"expected": {"00": 0.3}}))["expected"] is None


def test_layout_keeps_the_order_and_shares_steps():
    gates = [{"gate": "H", "qubits": [0]}, {"gate": "H", "qubits": [2]},          # side by side in step 1
             {"gate": "CNOT", "qubits": [0, 2]},                                    # its line crosses q1
             {"gate": "X", "qubits": [1]},                                          # so this waits for it
             {"gate": "SWAP", "qubits": [3, 1]}]
    cols = [(g["gate"], g["col"]) for g in layout(4, gates)["gates"]]
    assert cols == [("H", 0), ("H", 0), ("CNOT", 1), ("X", 2), ("SWAP", 3)]
    swap = layout(4, gates)["gates"][-1]
    assert swap["controls"] == [3] and swap["target"] == 1


def test_long_circuits_up_to_the_builders_limit_are_fine():
    assert len(read_circuit(json.dumps(BELL | {"gates": [{"gate": "H", "qubits": [0]}] * 120}))["gates"]) == 120


def test_kets_in_the_explanation_use_the_pages_bracket():
    out = read_circuit(json.dumps(BELL | {"explanation": "It flips the sign of |101>, and |+> stays; 2 > 1."}))
    assert out["explanation"] == "It flips the sign of |101⟩, and |+⟩ stays; 2 > 1."


def test_equal_chances_are_listed_in_order():
    noisy = {"101": 0.9453, "110": 0.0078125000001, "001": 0.0078124999999, "000": 0.00781250000005}
    assert [c["outcome"] for c in compare(None, noisy)["got"]] == ["101", "000", "001", "110"]


def test_compare_allows_rounding():
    assert compare({"0": 0.33, "1": 0.67}, {"0": 1 / 3, "1": 2 / 3})["matches"] is True
    assert compare({"0": 0.5, "1": 0.5}, {"0": 0.75, "1": 0.25})["matches"] is False
    assert compare(None, {"0": 1.0, "1": 0.0}) == {"matches": None, "expected": [], "got": [{"outcome": "0", "chance": 1.0}]}
