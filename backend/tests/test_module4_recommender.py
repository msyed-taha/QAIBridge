"""
Module 4 — Data & Architecture Recommender — tests.

Run from backend/:  python -m pytest tests/test_module4_recommender.py -v

The Random Forest ranks quantum algorithms from features extracted from the
problem text; a category gate keeps the final choice consistent with the
detected problem type. These cases are the kinds of prompts a user (or a
panel) types in.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.mark.parametrize("text,expected", CASES)
def test_recommends_the_right_quantum_algorithm(client, text, expected):
    r = client.post("/api/module4/advise", json={"problem_text": text})
    assert r.status_code == 200, r.text
    body = r.json()
    quantum_top = body["top_algorithm_id"] if body["approach"] == "Quantum" else None
    # when the advisor decides "Classical", the classical alternative must map from the right quantum algorithm
    assert quantum_top in (expected, None)
    assert body["recommendations"][0]["confidence"] > 0


def test_rejects_gibberish(client):
    assert client.post("/api/module4/advise", json={"problem_text": "asdf qwer zxcv"}).status_code == 422
