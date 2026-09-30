"""
Module 5 — Classical → Quantum Logic Transformer — tests.

Run from backend/:  python -m pytest tests/test_module5_transformer.py -v

Covers the offline analyzer on every built-in example, the Boolean-logic
translation (reversible circuit verified on all inputs, exact Hamiltonian),
the end-to-end pipeline with verification against classical answers, the
LLM engine (with a mocked provider — no network), and the sandbox.
"""
from __future__ import annotations

import itertools
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.modules.module5_transformer import llm as llm_mod
from app.modules.module5_transformer.analyzer import analyze_code
from app.modules.module5_transformer.boolean_logic import (
    algebraic_normal_form, hamiltonian_terms, run_logic_pipeline, truth_table,
)
from app.modules.module5_transformer.examples import EXAMPLES
from app.modules.module5_transformer.pipeline import analyze, execute
from app.modules.module5_transformer.sandbox import run_python, static_check


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


EXPECTED_TYPES = {"search": "search", "factoring": "factoring", "tsp": "tsp", "knapsack": "knapsack",
                  "maxcut": "maxcut", "boolean": "boolean", "database": "database", "partition": "partition",
                  "portfolio": "portfolio", "sorting": "unsupported"}


@pytest.mark.parametrize("example", EXAMPLES, ids=[e["id"] for e in EXAMPLES])
def test_offline_analyzer_understands_every_example(example):
    spec = analyze_code(example["code"])
    assert spec["problem_type"] == EXPECTED_TYPES[example["id"]]
    assert spec["engine"] == "local"
    if spec["problem_type"] != "unsupported":
        assert spec["parameters"] and not spec["incomplete"]


def test_extracted_parameters_are_the_real_data():
    by_id = {e["id"]: analyze_code(e["code"]) for e in EXAMPLES}
    assert by_id["factoring"]["parameters"] == {"N": 91}
    assert by_id["search"]["parameters"]["target"] == "23"
    assert by_id["knapsack"]["parameters"]["capacity"] == 1000
    assert by_id["database"]["parameters"]["query"] == "age > 50"
    assert len(by_id["maxcut"]["parameters"]["edges"]) == 7
    assert by_id["portfolio"]["parameters"]["k"] == 3 and len(by_id["portfolio"]["parameters"]["returns"]) == 6


@pytest.mark.parametrize("expr", [
    "(a and not b) or c", "a xor b xor c", "(x1 or x2) and (!x1 or x3) and (!x2 or !x3)",
    "a -> b", "A' B + A B'", "(p ∧ q) → r", "a nand b", "a and not a", "a or not a",
])
def test_reversible_circuit_reproduces_truth_table(expr):
    r = run_logic_pipeline(expr, shots=256, seed=1)
    assert r["verification"]["verified"], r["verification"]
    if r["satisfiable"] and not r["tautology"] and r["n_solutions"] < 2 ** r["n_variables"] / 2:
        assert r["grover"]["found_solution"] is not None


def test_random_truth_tables_anf_and_hamiltonian():
    rng = np.random.default_rng(3)
    for n in (2, 3, 4, 5):
        values = rng.integers(0, 2, 2 ** n).astype(bool)
        anf = algebraic_normal_form(values.astype(np.uint8))
        # evaluate the ANF back: f(x) = XOR over monomials S ⊆ x
        for x in range(2 ** n):
            acc = 0
            for mask in range(2 ** n):
                if anf[mask] and (mask & x) == mask:
                    acc ^= 1
            assert acc == int(values[x])
        # Hamiltonian energies = 1 − f(x)
        ham = hamiltonian_terms(values, [f"v{i}" for i in range(n)])
        for x in range(2 ** n):
            e = 0.0
            for t in ham["terms"]:
                sign = 1
                for q in t["qubits"]:
                    sign *= -1 if (x >> (n - 1 - q)) & 1 else 1
                e += t["coeff"] * sign
            assert e == pytest.approx(1 - float(values[x]), abs=1e-9)


def test_logic_parser_errors():
    for bad in ["a and", "(a or b", "2 and a", "a $ b", ""]:
        with pytest.raises(ValueError):
            truth_table(bad)


@pytest.mark.parametrize("example", [e for e in EXAMPLES if e["id"] != "sorting"], ids=lambda e: e["id"])
def test_pipeline_verifies_quantum_against_classical(example):
    spec = analyze(example["code"], mode="local")
    result = execute(spec, layers=2, shots=1024, seed=5)
    assert result["supported"]
    assert result["verification"]["match"], result["verification"]
    assert result["qiskit"]
    compile(result["qiskit"], "<qiskit>", "exec")


def test_sorting_gets_an_honest_answer():
    spec = analyze(next(e for e in EXAMPLES if e["id"] == "sorting")["code"], mode="local")
    result = execute(spec)
    assert not result["supported"] and "no quantum speed-up" in result["reason"].lower()


def test_llm_engine_with_mocked_provider(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-ant-test")
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"content": [{"type": "text", "text": json.dumps({
                "problem_type": "factoring", "parameters": {"N": 35},
                "explanation": "Trial division of 35.", "confidence": 0.9})}]}

    calls = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        calls["url"], calls["model"] = url, json["model"]
        return FakeResponse()

    monkeypatch.setattr(llm_mod.httpx, "post", fake_post)
    assert llm_mod.llm_status()["enabled"] and llm_mod.llm_status()["provider"] == "anthropic"
    spec = analyze("n = 35\nfor i in range(2, n): ...", mode="auto")
    assert spec["engine"] == "llm" and spec["parameters"] == {"N": 35}
    assert calls["url"].endswith("/v1/messages") and calls["model"] == "claude-opus-5-5"

    # A broken reply falls back to the offline analyzer in auto mode …
    monkeypatch.setattr(llm_mod.httpx, "post", lambda *a, **k: type("R", (), {"status_code": 500, "text": "boom"})())
    spec = analyze(EXAMPLES[1]["code"], mode="auto")
    assert spec["engine"] == "local" and "LLM engine unavailable" in spec["evidence"][0]
    # … but is an error when the LLM is explicitly required.
    with pytest.raises(ValueError):
        analyze(EXAMPLES[1]["code"], mode="llm")


def test_llm_disabled_without_key(monkeypatch):
    for k in ("LLM_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LLM_PROVIDER"):
        monkeypatch.delenv(k, raising=False)
    status = llm_mod.llm_status()
    assert not status["enabled"] and status["how_to_enable"]
    with pytest.raises(ValueError):
        analyze("x = 1", mode="llm")


@pytest.mark.parametrize("code", [
    "import os", "import subprocess", "from socket import socket", "open('/etc/passwd')",
    "__import__('os')", "eval('1+1')", "getattr(object, 'x')", "().__class__.__bases__",
])
def test_sandbox_blocks_dangerous_code(code):
    ok, _ = static_check(code)
    assert not ok
    assert run_python(code)["blocked"]


def test_sandbox_runs_normal_code_and_limits_memory():
    good = run_python("import math\nprint(math.factorial(10))")
    assert good["success"] and good["output"].strip() == "3628800"
    hog = run_python("a = [0] * (10 ** 9)")
    assert not hog["success"]


def test_module5_api(client):
    assert client.get("/api/module5/status").status_code == 200
    ex = client.get("/api/module5/examples").json()["examples"]
    assert len(ex) >= 9
    spec = client.post("/api/module5/analyze", json={"code": ex[0]["code"], "mode": "local"}).json()["spec"]
    result = client.post("/api/module5/execute", json={"spec": spec, "seed": 2}).json()
    assert result["verification"]["match"]
    logic = client.post("/api/module5/logic", json={"expression": "(a or b) and not c"}).json()
    assert logic["verification"]["verified"] and "qiskit" in logic
    bad = client.post("/api/module5/execute", json={"spec": {"problem_type": "knapsack", "parameters": {}}})
    assert bad.status_code == 422
    assert client.post("/api/module5/run-classical", json={"code": "print(1)"}).status_code in (401, 403)


def test_portfolio_bridge_matches_brute_force():
    from app.modules.module5_transformer.bridge import portfolio_bridge
    rng = np.random.default_rng(9)
    for n, k in ((5, 2), (6, 3), (7, 3)):
        mu = rng.uniform(0.02, 0.2, n)
        A = rng.normal(size=(n, n)) * 0.1
        cov = A @ A.T + np.eye(n) * 0.01
        b = portfolio_bridge([f"A{i}" for i in range(n)], mu, k, cov=cov, risk_aversion=0.7)
        exact = b.solve_exactly()
        best = max(itertools.combinations(range(n), k),
                   key=lambda c: mu[list(c)].sum() / k - 0.7 * cov[np.ix_(c, c)].sum() / k ** 2)
        assert exact["feasible"] and sorted(exact["selected"]) == sorted(f"A{i}" for i in best)
