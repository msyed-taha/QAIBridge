"""
AI Advisor — tests.

Run from backend/:  python -m pytest tests/test_module4_recommender.py -v

The Random Forest ranks quantum algorithms from features read from the
problem text; a category gate keeps the final choice consistent with the
detected problem type. The features come from the AI (a fake Claude here,
see conftest.py: nothing is sent or paid) or, when the AI can't answer or the
user picks it, from the built-in keyword reader. The CASES are the kinds of
prompts a user (or a panel) types in.
"""
from __future__ import annotations

import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import ROLE_USER, User

CASES = [
    ("Find the shortest delivery route through 5 cities in Punjab for our truck fleet (travelling salesman).", "qaoa"),
    ("Optimize the delivery routes of 40 trucks visiting 200 stores every day", "qaoa"),
    ("Choose which projects to fund to maximise profit without exceeding a budget of 5 million (knapsack)", "qaoa"),
    ("Build a stock portfolio of 50 assets that maximises return for a given risk", "qaoa"),
    ("Search 10 million unsorted customer records to find one customer ID", "grovers"),
    ("Find a specific password hash in an unsorted list of 1 billion hashes", "grovers"),
    ("Query a database of 2 million patients for all records matching several conditions", "amplitude_amp"),
    ("Factor a 2048-bit RSA modulus to break the encryption", "shors"),
    ("Find the prime factors of a large integer used as a public key", "shors"),
    ("Simulate the ground state energy of a caffeine molecule for drug discovery", "vqe"),
    ("Estimate the eigenvalues of a Hamiltonian describing a quantum system with high precision", "qpe"),
]

BAKERY = ("Our bakery has 12 ovens and 40 cake orders each morning. Which oven should bake which order so that "
          "everything is ready as early as possible?")
BAKERY_READ = json.dumps({
    "on_topic": True, "summary": "Assign 40 cake orders to 12 ovens so all are ready as early as possible.",
    "problem_category": "optimisation", "data_size": 40, "unstructured_data": False, "needs_exact_answer": False,
    "has_graph_structure": False, "is_security_related": False, "continuous_vars": False,
    "periodic_structure": False, "multi_solution": True, "redirect": "",
})
EXPLANATION = ("This is a scheduling problem: 40 orders shared between 12 ovens. The model chose QAOA, because "
               "combinatorial optimisation is where its polynomial speed-up helps.")


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="module")
def auth():
    tag = uuid.uuid4().hex[:10]
    with SessionLocal() as db:
        u = User(username=f"adv_{tag}", email=f"adv_{tag}@example.com", hashed_password=hash_password("TestPass123"),
                 role=ROLE_USER, is_active=True)
        db.add(u); db.commit(); db.refresh(u)
        headers = {"Authorization": f"Bearer {token_for(u)}"}
    yield headers
    with SessionLocal() as db:
        db.query(User).filter(User.email == f"adv_{tag}@example.com").delete()
        db.commit()


def _advise(client, auth, text, **extra):
    return client.post("/api/module4/advise", headers=auth, json={"problem_text": text, **extra})


@pytest.mark.parametrize("text,expected", CASES)
def test_the_built_in_reader_recommends_the_right_quantum_algorithm(client, auth, text, expected):
    r = _advise(client, auth, text)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["engine"] == "built-in" and body["ai_note"].startswith("AI isn't set up on this server.")
    quantum_top = body["top_algorithm_id"] if body["approach"] == "Quantum" else None
    # when the advisor decides "Classical", the classical alternative must map from the right quantum algorithm
    assert quantum_top in (expected, None)
    assert body["recommendations"][0]["confidence"] > 0


def test_needs_sign_in(client):
    assert client.post("/api/module4/advise", json={"problem_text": CASES[0][0]}).status_code in (401, 403)
    assert client.post("/api/module4/advise-file", files={"file": ("p.txt", b"Search 1 million records")}).status_code in (401, 403)


def test_rejects_gibberish(client, auth):
    assert _advise(client, auth, "asdf qwer zxcv").status_code == 422


def test_the_ai_reads_the_problem_and_the_model_still_chooses(client, auth, fake_ai):
    fake_ai.replies = [BAKERY_READ, EXPLANATION]
    body = _advise(client, auth, BAKERY).json()
    assert body["engine"] == "ai" and body["top_algorithm_id"] == "qaoa"
    assert body["summary"].startswith("Assign 40 cake orders") and body["explanation"] == EXPLANATION
    assert body["detected_features"]["category_label"] == "Optimisation" and body["detected_features"]["data_size"] == 40
    assert body["ai_status"]["used_today"] == 2 and "ai_note" not in body
    read, explain = fake_ai.calls
    assert "<data>\n" + BAKERY in read["user"] and "Fill in the facts" in read["system"]
    # the explanation is built on the model's real decision, not made up
    assert "QAOA" in explain["user"] and "Model decision: Quantum approach" in explain["user"]


def test_the_built_in_reader_can_not_read_what_the_ai_can(client, auth):
    # no keyword or number cue the rules know: without the AI this is turned away
    r = _advise(client, auth, "Our bakery wants to plan which cakes each oven makes so mornings go smoothly")
    assert r.status_code == 422


def test_a_missing_size_gets_the_usual_default(client, auth, fake_ai):
    read = json.loads(BAKERY_READ) | {"data_size": None}
    fake_ai.replies = [json.dumps(read), EXPLANATION]
    assert _advise(client, auth, BAKERY).json()["detected_features"]["data_size"] == 100


def test_off_topic_text_gets_a_polite_redirect(client, auth, fake_ai):
    fake_ai.reply = json.dumps({"on_topic": False, "redirect": "This tool recommends an approach for a computing "
                                                               "problem. Describe a task and its size."})
    body = _advise(client, auth, "What should I cook for dinner tonight with my family?").json()
    assert body["off_topic"] and body["message"].startswith("This tool recommends") and len(fake_ai.calls) == 1


def test_when_the_ai_fails_the_built_in_reader_takes_over(client, auth, fake_ai):
    from app.ai.service import AIServiceError
    fake_ai.error = AIServiceError("HTTP 529 overloaded_error")
    body = _advise(client, auth, CASES[4][0]).json()
    assert body["engine"] == "built-in" and body["top_algorithm_id"] in ("grovers", "binary_search")
    assert body["ai_note"] == "The AI couldn't answer just now. The built-in reader was used instead."
    assert "explanation" not in body


def test_an_unusable_reading_falls_back_and_is_asked_again(client, auth, fake_ai):
    fake_ai.replies = ['{"problem_category": "astrology"}', BAKERY_READ, EXPLANATION]
    first = _advise(client, auth, CASES[1][0]).json()
    assert first["engine"] == "built-in" and "couldn't be used" in first["ai_note"]
    assert _advise(client, auth, CASES[1][0]).json()["engine"] == "ai"


def test_a_missing_explanation_still_gives_the_recommendation(client, auth, fake_ai):
    fake_ai.replies = [BAKERY_READ, "   "]
    body = _advise(client, auth, BAKERY).json()
    assert body["engine"] == "ai" and body["explanation"] is None and body["top_algorithm_id"] == "qaoa"


def test_the_built_in_choice_never_calls_the_ai(client, auth, fake_ai):
    body = _advise(client, auth, CASES[4][0], mode="local").json()
    assert body["engine"] == "built-in" and fake_ai.calls == [] and "ai_note" not in body


def test_gibberish_never_reaches_the_ai(client, auth, fake_ai):
    assert _advise(client, auth, "sdfgh qwrtz xcvbn plkjh mnbvc").status_code == 422 and fake_ai.calls == []


def test_a_file_is_read_by_the_ai_too(client, auth, fake_ai):
    fake_ai.replies = [BAKERY_READ, EXPLANATION]
    r = client.post("/api/module4/advise-file", headers=auth, data={"mode": "auto"},
                    files={"file": ("bakery.txt", io.BytesIO(BAKERY.encode()), "text/plain")})
    body = r.json()
    assert r.status_code == 200 and body["engine"] == "ai" and body["filename"] == "bakery.txt"
