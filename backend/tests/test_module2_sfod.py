"""
Module 2 — SFOD Model Comparison Suite — tests.

Run from backend/:  python -m pytest tests/test_module2_sfod.py -v

These check that the quantum side is a real simulation: Grover's measured
success probability equals sin²((2k+1)θ), Shor's algorithm returns correct
factors from a quantum-measured period, QAOA's best sample is the true
optimum, and the HTTP endpoints return both sides of the comparison.
"""
from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from app.modules.module2_sfod.grover import run_grover
from app.modules.module2_sfod.qaoa import build_qaoa_circuit, QAOAEvaluator, run_qaoa, tsp_feasible_mask
from app.modules.module2_sfod.shor import run_shor
from app.modules.module2_sfod.suite import (
    compare_database, compare_factoring, compare_optimization, compare_search, parse_query,
)
from app.modules.module1_kernel import QuantumStateVector
from app.modules.module5_transformer.bridge import maxcut_bridge, tsp_bridge


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.mark.parametrize("n", [2, 3, 5, 8, 10])
def test_grover_matches_theory(n):
    target = (2 ** n) // 3
    r = run_grover(n, [target], shots=512, seed=1)
    assert r["success_probability"] == pytest.approx(r["theoretical_success"], abs=1e-9)
    assert r["success_probability"] > 0.9
    assert r["most_frequent"] == target
    theta = math.asin(math.sqrt(1 / 2 ** n))
    for point in r["curve"]:
        assert point["success_probability"] == pytest.approx(math.sin((2 * point["iteration"] + 1) * theta) ** 2, abs=1e-6)


def test_amplitude_amplification_multiple_matches():
    r = run_grover(6, [1, 7, 30, 50], shots=256, seed=2)
    assert r["iterations"] == 3
    assert r["success_probability"] > 0.9


@pytest.mark.parametrize("N,expected", [(15, [3, 5]), (21, [3, 7]), (33, [3, 11]), (35, [5, 7]), (91, [7, 13])])
def test_shor_factors(N, expected):
    r = run_shor(N, seed=11)
    assert r["status"] == "factored"
    assert r["factors"] == expected
    ok = [a for a in r["attempts"] if a.get("success")][0]
    assert ok["found_period"] % ok["true_period"] == 0 or ok["true_period"] % ok["found_period"] == 0
    assert pow(ok["a"], ok["found_period"], N) == 1


def test_shor_classical_prechecks():
    assert run_shor(22)["status"] == "trivial"
    assert run_shor(97)["status"] == "prime"
    assert run_shor(49)["status"] == "prime_power"
    with pytest.raises(ValueError):
        run_shor(143 * 7)


def test_qaoa_fused_cost_layer_equals_gate_circuit():
    b = maxcut_bridge(5, [(0, 1, 1), (1, 2, 2), (2, 3, 1), (3, 4, 1.5), (4, 0, 1), (1, 3, 1)])
    ev = QAOAEvaluator(b.ising)
    gammas, betas = [0.7, 1.1], [0.3, 0.6]
    fused = ev.state(gammas, betas).state
    sv = QuantumStateVector(5)
    build_qaoa_circuit(b.ising, gammas, betas, ev.scale).execute(sv)
    overlap = abs((fused.conj() * sv.state).sum())
    assert overlap == pytest.approx(1.0, abs=1e-10)


def test_qaoa_maxcut_finds_optimum():
    b = maxcut_bridge(6, [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 4, 1), (4, 5, 1), (5, 0, 1), (0, 3, 1)])
    r = run_qaoa(b, p=2, objective="expectation", seed=3)
    assert r["best_sampled"]["cut_value"] == b.solve_exactly()["cut_value"]
    assert r["p_optimal"] > 3 * r["random_p_optimal"]


def test_qaoa_tsp_is_better_than_random():
    d = [[0, 3, 4, 2], [3, 0, 4, 6], [4, 4, 0, 5], [2, 6, 5, 0]]
    b = tsp_bridge(d)
    r = run_qaoa(b, p=2, seed=4, feasible_mask=tsp_feasible_mask(4))
    assert r["best_sampled"]["feasible"]
    assert r["best_sampled"]["length"] == pytest.approx(b.solve_exactly()["length"])
    assert r["p_optimal"] > 5 * r["random_p_optimal"]
    assert r["p_feasible"] > 5 * r["random_p_feasible"]


def test_query_parser():
    m, _ = parse_query("age > 40")
    assert m("Ali · Age 41 · Lahore") and not m("Ali · Age 40 · Lahore")
    m, _ = parse_query("city = Lahore")
    assert m("x · Lahore") and not m("x · Karachi")
    m, _ = parse_query("Engineer")
    assert m("John - Engineer")


def test_suite_comparisons_are_correct():
    s = compare_search(n_qubits=7, target_index=100, seed=5)
    assert s["classical"]["correct"] and s["quantum"]["correct"]
    assert s["quantum"]["answer"]["index"] == 100 and s["quantum"]["steps"] < s["classical"]["steps"]
    missing = compare_search(items=["a", "b", "c"], target="z", seed=1)
    assert missing["quantum"]["answer"]["index"] is None and missing["quantum"]["correct"]
    db = compare_database(n_records=300, query="age > 60", seed=2)
    assert db["quantum"]["correct"] and db["input"]["n_matches"] > 0
    f = compare_factoring(77, seed=6)
    assert f["quantum"]["answer"]["factors"] == [7, 11] and f["classical"]["answer"]["factors"] == [7, 11]
    o = compare_optimization(["Islamabad", "Lahore", "Karachi", "Peshawar"], p=2, seed=7)
    assert o["quantum"]["answer"]["length_km"] == pytest.approx(o["classical"]["answer"]["length_km"])


def test_module2_endpoint(client):
    r = client.post("/api/module2/run", json={"algorithm": "search", "n_qubits": 5, "target_index": 9, "seed": 1})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["quantum"]["answer"]["index"] == 9 and "qiskit" in body
    assert client.post("/api/module2/run", json={"algorithm": "factoring", "N": 10403}).status_code == 422
    assert client.post("/api/module2/run", json={"algorithm": "optimization", "cities": ["A", "B"]}).status_code == 422
    legacy = client.post("/api/module2/run", json={"algorithm": "database", "input_size": 64})
    assert legacy.status_code == 200


def test_solve_endpoint_quantum_runs_circuits(client):
    r = client.post("/api/dashboard/solve", json={"problem_type": "factoring", "approach": "quantum", "number": 35})
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["success"] and res["result"]["factors"] == [5, 7] and res["result"]["qubits"] == 18
    too_big = client.post("/api/dashboard/solve", json={
        "problem_type": "optimization", "approach": "quantum",
        "cities": ["Islamabad", "Lahore", "Karachi", "Peshawar", "Quetta", "Multan"]}).json()["result"]
    assert not too_big["success"] and "25 qubits" in too_big["error"]
