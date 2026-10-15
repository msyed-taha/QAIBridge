"""
AI Advisor — tests.

Run from backend/:  python -m pytest tests/test_module4_recommender.py -v

The Random Forest ranks quantum algorithms from features read from the
problem text; a category gate keeps the choice consistent with the detected
problem type. A reality check then gives an honest answer in two parts: the
best approach today (with real classical methods and the limits of today's
hardware) and what a future, error-corrected quantum computer could offer. The features come from the AI (a fake Claude here,
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
def test_the_built_in_reader_finds_the_right_quantum_algorithm(client, auth, text, expected):
    r = _advise(client, auth, text)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["engine"] == "built-in" and body["ai_note"].startswith("AI isn't set up on this server.")
    assert body["quantum"]["algorithm_id"] == expected and body["recommendations"][0]["confidence"] > 0
    # today, every one of these is a job for a classical method, and the page says what stops quantum
    assert body["approach"] == "Classical" and body["today"]["algorithm"]["algorithm_id"] == body["top_algorithm_id"]
    assert body["today"]["reason"].startswith("Quantum isn't ready for this yet") and len(body["limits"]) >= 3


ROUTING = ("I need to plan delivery routes for 60 stops across a city, with time windows for each stop, a fleet of 5 "
           "vans, and a limit on total driving time. I need a route that is good enough within a few minutes, not a "
           "proven best route. The data is about 60 stops, so an exact answer would be very costly. Should I use a "
           "quantum or classical approach, which algorithm would you pick, and what are the limits of your "
           "recommendation on today's hardware?")


def test_a_real_routing_problem_gets_an_honest_answer(client, auth):
    body = _advise(client, auth, ROUTING).json()
    assert body["approach"] == "Classical" and body["top_algorithm_id"] == "routing_heuristics"
    q = body["quantum"]
    assert q["algorithm_id"] == "qaoa" and not q["proven"] and q["verdict"] == "Classical" and q["qubits_needed"] == 3481
    assert "no proven speed-up" in body["today"]["reason"] and "3,481 qubits" in body["today"]["reason"]
    assert any("(59 × 59)" in line and "5 vehicles and the time windows" in line for line in body["limits"])
    assert body["try_here"]["path"] == "/module2?type=optimization" and body["solve"]["kind"] == "tsp"


def test_no_speed_up_is_claimed_for_heuristics(client, auth):
    for text in (ROUTING, CASES[2][0], CASES[9][0]):
        body = _advise(client, auth, text).json()
        said = json.dumps(body).lower()
        assert "polynomial speedup" not in said and "polynomial speed-up" not in said and "favours quantum" not in said
        assert body["quantum"]["speedup"].startswith("None proven")


@pytest.mark.parametrize("text, today, future, qubits", [
    (CASES[4][0], "linear_search", "Quantum", 25),          # Grover: proven, but needs error correction
    (CASES[7][0], "number_field_sieve", "Quantum", 4099),   # Shor on RSA-2048
    (CASES[9][0], "classical_chemistry", "Classical", 50),  # VQE: no proven speed-up
    (CASES[2][0], "optimisation_solver", "Classical", None),  # "5 million" is the budget, not 5 million items
    ("Find the exact shortest route through 5 cities in Punjab (travelling salesman), it must be the proven optimum.",
     "dynamic_programming", "Classical", 16),
])
def test_today_and_future(client, auth, text, today, future, qubits):
    body = _advise(client, auth, text).json()
    assert body["top_algorithm_id"] == today and body["quantum"]["verdict"] == future
    assert body["quantum"]["qubits_needed"] == qubits


def test_needs_sign_in(client):
    assert client.post("/api/module4/advise", json={"problem_text": CASES[0][0]}).status_code in (401, 403)
    assert client.post("/api/module4/advise-file", files={"file": ("p.txt", b"Search 1 million records")}).status_code in (401, 403)


def test_rejects_gibberish(client, auth):
    assert _advise(client, auth, "asdf qwer zxcv").status_code == 422


def test_the_ai_reads_the_problem_and_the_model_still_chooses(client, auth, fake_ai):
    fake_ai.replies = [BAKERY_READ, EXPLANATION]
    body = _advise(client, auth, BAKERY).json()
    assert body["engine"] == "ai" and body["quantum"]["algorithm_id"] == "qaoa" and body["approach"] == "Classical"
    assert body["summary"].startswith("Assign 40 cake orders") and body["explanation"] == EXPLANATION
    assert body["detected_features"]["category_label"] == "Optimisation" and body["detected_features"]["data_size"] == 40
    assert body["ai_status"]["used_today"] == 2 and "ai_note" not in body
    read, explain = fake_ai.calls
    assert "<data>\n" + BAKERY in read["user"] and "Fill in the facts" in read["system"]
    # the explanation is built on the Advisor's real verdict and limits, not made up, and sees the person's own words
    assert "Best approach today: Classical" in explain["user"] and "Limits today:" in explain["user"]
    assert "QAOA" in explain["user"] and BAKERY in explain["user"]


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
    assert body["engine"] == "built-in" and body["quantum"]["algorithm_id"] == "grovers"
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
    assert body["engine"] == "ai" and body["explanation"] is None and body["quantum"]["algorithm_id"] == "qaoa"


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
    assert body["data_lines"] == [] and body["problem_text"] == BAKERY      # sentences describe the problem; they aren't data


# ── The model itself (module4_recommender/model.py) ─────────────────────────────

def _facts(category, size, **flags):
    from app.modules.module4_recommender.model import FLAGS
    return {"problem_category": category, "data_size": size, **{k: flags.get(k, False) for k in FLAGS}}


def test_public_keys_fall_to_shor_and_brute_force_to_grover():
    from app.modules.module4_recommender import model
    from app.routers.recommender import _clf
    for size in (256, 2048, 10 ** 6):                  # key bits or a key space: the kind of attack decides
        assert model.rank(_clf, _facts(7, size, is_security_related=True, needs_exact_answer=True))[0][0] == "shors"
        assert model.rank(_clf, _facts(7, size, is_security_related=True, needs_exact_answer=True,
                                       unstructured_data=True))[0][0] == "grovers"


def test_the_confidence_is_the_models_own_probability():
    from app.modules.module4_recommender import model
    from app.routers.recommender import _clf
    ranked = model.rank(_clf, _facts(0, 10 ** 6, unstructured_data=True, multi_solution=True))
    allowed = model.CATEGORY_ALLOWED[0]
    assert ranked[0][0] in allowed and sum(c for a, c in ranked if a in allowed) == pytest.approx(100, abs=0.5)


def test_it_is_tested_on_problems_it_never_tuned_on(client):
    from app.routers.recommender import MODEL_TEST
    held = MODEL_TEST["held_out"]
    assert held["facts"]["total"] == 24 and held["facts"]["right"] >= 23
    assert held["built_in_reader"]["right"] >= 17          # the keyword reader is the fallback, and less exact
    assert MODEL_TEST["labelled"]["facts"]["total"] == 48
    info = client.get("/api/module4/model-info").json()
    assert info["test"]["held_out"]["facts"]["pct"] == held["facts"]["pct"] and "speedup_priority" not in info["features"]


# ── Solving it here (FE-3): the problem's own data, solved with the SFOD suite ─────

from app.modules.module4_recommender import data_reader  # noqa: E402


@pytest.mark.parametrize("kind,text,source,params", [
    ("search", "Find 'Grace' in this list: Alice, Bob, Charlie, Grace and Henry.", "your problem",
     {"items": ["Alice", "Bob", "Charlie", "Grace", "Henry"], "target": "Grace"}),
    ("factoring", "Please factorise 91.", "your problem", {"N": 91}),
    ("factoring", "Factor 1,000,003 please.", "your problem", {"N": 1000003}),
    ("factoring", "I need to factorise a large RSA-2048 integer.", "example", {"N": 91}),
    ("tsp", "Our van delivers to Lahore, Multan, Faisalabad and Sialkot. Shortest route?", "your problem",
     {"cities": ["Lahore", "Multan", "Faisalabad", "Sialkot"]}),
    ("tsp", "Find the shortest route visiting 500 cities.", "example", {"cities": data_reader.EXAMPLE_CITIES}),
])
def test_the_built_in_rules_read_the_data_or_say_it_is_an_example(kind, text, source, params):
    out = data_reader.read(text, [], kind, "local", None)
    assert out["source"] == source and out["spec"]["parameters"] == params
    assert (source == "example") == any("small example" in n for n in out["notes"])


def test_a_query_is_read_and_a_missing_one_is_asked_for():
    rows = ["name: Ali · age: 34", "name: Sara · age: 45"]
    older = data_reader.read("Which staff are older than 40?", rows, "database", "local", None)
    assert older["spec"]["parameters"] == {"records": rows, "query": "age > 40"} and older["source"] == "your problem"
    none = data_reader.read("Search our staff table.", rows, "database", "local", None)
    assert none["spec"]["parameters"]["query"] == "" and any("Say what to look for" in n for n in none["notes"])
    table = data_reader.read("Find Sara.", rows, "search", "local", None)      # a table is searched with a query
    assert table["spec"]["problem_type"] == "database" and any("solved as a query" in n for n in table["notes"])


def test_the_advice_says_how_it_will_be_solved(client, auth):
    plan = _advise(client, auth, "Search 10 million unsorted customer records to find one customer ID", mode="local").json()["solve"]
    assert plan["kind"] == "search" and plan["quantum"] == "Grover's Search Algorithm"
    route = _advise(client, auth, CASES[0][0], mode="local").json()["solve"]
    assert route["kind"] == "tsp" and route["quantum"] == "QAOA"
    assert _advise(client, auth, CASES[9][0], mode="local").json()["solve"] is None     # chemistry: not an SFOD problem


def test_the_ai_reads_the_data_and_a_file_is_the_data(client, auth, fake_ai):
    fake_ai.reply = json.dumps({"problem_type": "database", "parameters": {"records": ["a", "b"], "query": "age > 40"},
                                "explanation": "A staff query.", "confidence": 0.9, "example_data": False})
    rows = ["name: Ali · age: 34", "name: Sara · age: 45", "name: Omar · age: 52"]
    r = client.post("/api/module4/read-data", headers=auth,
                    json={"problem_text": "Who is older than 40?", "data_lines": rows, "kind": "database", "mode": "auto"})
    body = r.json()
    assert r.status_code == 200 and body["source"] == "your problem" and body["spec"]["engine"] == "llm"
    assert body["spec"]["parameters"] == {"records": rows, "query": "age > 40"}      # the AI saw a sample; the file is the data
    assert "AI Advisor matched this to a database query problem" in fake_ai.calls[0]["user"]


def test_an_ai_example_is_called_an_example(client, auth, fake_ai):
    fake_ai.reply = json.dumps({"problem_type": "factoring", "parameters": {"N": 77}, "explanation": "An example.",
                                "confidence": 0.8, "example_data": True})
    body = client.post("/api/module4/read-data", headers=auth,
                       json={"problem_text": "Break RSA-2048.", "kind": "factoring"}).json()
    assert body["source"] == "example" and body["spec"]["parameters"] == {"N": 77}


def test_solving_runs_both_sides_and_is_saved(client, auth):
    spec = {"problem_type": "search", "parameters": {"items": ["Alice", "Bob", "Grace", "Henry"], "target": "Grace"}}
    body = client.post("/api/module4/solve", headers=auth, json={"spec": spec}).json()
    assert body["supported"] and body["verification"]["match"]
    assert body["details"]["quantum"]["answer"]["value"] == "Grace" and body["details"]["classical"]["steps"] == 3
    runs = client.get("/api/dashboard/history", headers=auth).json()["runs"]
    assert runs[0]["kind"] == "advisor" and runs[0]["title"] == "AI Advisor — solved a search problem"


def test_too_big_for_the_simulator_still_gets_the_classical_answer(client, auth):
    body = client.post("/api/module4/solve", headers=auth,
                       json={"spec": {"problem_type": "factoring", "parameters": {"N": 143}}}).json()
    assert body["classical_only"] and "24 qubits" in body["reason"]
    assert body["classical"]["result"]["factors"] == [11, 13]
    bad = client.post("/api/module4/solve", headers=auth,
                      json={"spec": {"problem_type": "tsp", "parameters": {"cities": ["Lahore", "Karachi", "Atlantis"]}}})
    assert bad.status_code == 422 and "Atlantis" in bad.json()["detail"]


def test_an_uploaded_table_comes_back_as_the_data(client, auth):
    csv_bytes = b"name,dept,age\nAli,Research,34\nSara,Finance,45\n"
    r = client.post("/api/module4/advise-file", headers=auth, data={"mode": "local"},
                    files={"file": ("staff.csv", io.BytesIO(csv_bytes), "text/csv")})
    assert r.status_code == 200 and r.json()["data_lines"] == ["name: Ali · dept: Research · age: 34",
                                                             "name: Sara · dept: Finance · age: 45"]
    assert r.json()["problem_text"] == ""        # nothing in the summary is taken as the user's query
    big = client.post("/api/module4/advise-file", headers=auth, data={"mode": "local"},
                      files={"file": ("big.txt", io.BytesIO(b"x" * (5 * 1024 * 1024 + 1)), "text/plain")})
    assert big.status_code == 413
    old = client.post("/api/module4/advise-file", headers=auth, data={"mode": "local"},
                      files={"file": ("old.doc", io.BytesIO(b"x"), "application/msword")})
    assert old.status_code == 400
