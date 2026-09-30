"""
Module 5 – Classical → Quantum Logic Transformer
pipeline.py  –  The end-to-end transformation:

    classical code ──(1) understand──▶ problem spec            (LLM engine or offline analyzer)
                   ──(2) bridge──────▶ QUBO / Ising / oracle    (bridge.py, boolean_logic.py)
                   ──(3) circuit─────▶ gates on the kernel      (Module 1)
                   ──(4) run─────────▶ measured answer          (Grover · Shor · QAOA)
                   ──(5) verify──────▶ compared with the exact classical answer
                   ──(6) export──────▶ runnable Qiskit code
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np

from ..module2_sfod import classical
from ..module2_sfod.qaoa import knapsack_feasible_mask, run_qaoa, tsp_feasible_mask
from ..module2_sfod.suite import (
    _clean, compare_database, compare_factoring, compare_optimization, compare_search,
)
from .analyzer import ALGORITHM_FOR, analyze_code
from .boolean_logic import run_logic_pipeline
from .bridge import (
    Bridge, _bit_matrix, knapsack_bridge, maxcut_bridge, number_partition_bridge, portfolio_bridge, tsp_bridge,
)
from .llm import LLMError, analyze_with_llm, llm_status

QAOA_KINDS = ("tsp", "knapsack", "maxcut", "partition", "portfolio")


# ── (1) understand ────────────────────────────────────────────────────────────

def analyze(code: str, mode: str = "auto") -> Dict[str, Any]:
    """mode: 'auto' (LLM when configured, else offline), 'llm' (LLM only), 'local' (offline only)."""
    note = None
    if mode in ("auto", "llm") and llm_status()["enabled"]:
        try:
            spec, meta = analyze_with_llm(code)
            spec["llm"] = meta
            return spec
        except (LLMError, Exception) as e:           # network, auth, quota, bad JSON …
            if mode == "llm":
                raise ValueError(f"The LLM engine failed: {e}")
            note = f"LLM engine unavailable ({str(e)[:160]}) — used the offline analyzer instead."
    elif mode == "llm":
        raise ValueError("The LLM engine is not configured. Add LLM_API_KEY to backend/.env, or use offline mode.")
    spec = analyze_code(code)
    if note:
        spec["evidence"].insert(0, note)
    return spec


# ── (2)–(6) bridge, circuit, run, verify, export ──────────────────────────────

def _stage(title: str, detail: str) -> Dict[str, str]:
    return {"title": title, "detail": detail}


def _bridge_for(kind: str, p: Dict[str, Any]) -> Bridge:
    if kind == "knapsack":
        return knapsack_bridge(p["values"], p["weights"], int(p["capacity"]), p.get("names"))
    if kind == "maxcut":
        edges = [(int(e[0]), int(e[1]), float(e[2]) if len(e) > 2 else 1.0) for e in p["edges"]]
        n = int(p.get("n_nodes") or (max(max(a, b) for a, b, _ in edges) + 1))
        return maxcut_bridge(n, edges)
    if kind == "partition":
        return number_partition_bridge(p["numbers"])
    if kind == "portfolio":
        return portfolio_bridge(p["names"], p["returns"], int(p["k"]), cov=p.get("cov"),
                                volatility=p.get("volatility"), risk_aversion=float(p.get("risk_aversion", 0.5)))
    if kind == "tsp":
        return tsp_bridge(p["distance_matrix"], p.get("names"))
    raise ValueError(f"No bridge for {kind}.")


def _run_qaoa_problem(kind: str, p: Dict[str, Any], layers: int, shots: int, seed: Optional[int]) -> Dict[str, Any]:
    bridge = _bridge_for(kind, p)
    n = bridge.qubo.n
    if kind == "knapsack":
        mask = knapsack_feasible_mask(p["weights"], int(p["capacity"]), n)
    elif kind == "tsp":
        mask = tsp_feasible_mask(len(p["distance_matrix"]))
    elif kind == "portfolio":
        mask = _bit_matrix(n).sum(axis=1) == int(p["k"])
    else:
        mask = None
    t0 = time.perf_counter()
    exact = bridge.solve_exactly()
    classical_ms = (time.perf_counter() - t0) * 1000
    q = run_qaoa(bridge, p=layers, shots=shots, seed=seed, feasible_mask=mask)
    best = q["best_sampled"]
    # energies are reported rounded (6 / 8 decimals), so compare with a matching tolerance
    match = bool(best.get("feasible", True)) and abs(best["energy"] - exact["energy"]) < 1e-5
    circuit = q.pop("_circuit")
    summary = bridge.summary()
    return {
        "bridge": summary,
        "exact": {**exact, "time_ms": round(classical_ms, 4), "method": f"Exhaustive search over all 2^{n} bit-strings"},
        "qaoa": q,
        "verification": {
            "match": match,
            "detail": ("QAOA's best measured answer has exactly the minimum energy found by exhaustive search."
                       if match else
                       "QAOA's best measured answer is not the exact optimum — try more layers (p) or more shots."),
        },
        "qiskit": circuit.to_qiskit(),
        "qubits": n,
    }


def execute(spec: Dict[str, Any], layers: int = 2, shots: int = 1024, seed: Optional[int] = None) -> Dict[str, Any]:
    kind = spec.get("problem_type")
    p = dict(spec.get("parameters") or {})
    if kind not in ALGORITHM_FOR:
        raise ValueError(f"Unknown problem type '{kind}'.")
    t_start = time.perf_counter()
    out: Dict[str, Any] = {"problem_type": kind, "algorithm": ALGORITHM_FOR[kind]}

    if kind == "unsupported":
        out.update({"supported": False, "reason": p.get("reason") or spec.get("explanation", ""),
                    "stages": [_stage("Understand", "No quantum formulation with a genuine advantage applies.")]})
        return out

    out["supported"] = True
    if kind == "search":
        items, target = p.get("items"), p.get("target")
        if not items or target is None:
            raise ValueError("Search needs 'items' (a list) and a 'target'.")
        r = compare_search(items=[str(x) for x in items], target=str(target), shots=shots, seed=seed)
        q = r["quantum"]
        out.update({
            "details": r,
            "stages": [
                _stage("Bridge", f"Each of the {r['input']['n_items']} items gets a basis state of "
                                 f"{r['input']['qubits']} qubits; the comparison `item == {target!r}` becomes a phase "
                                 f"oracle O|x⟩ = −|x⟩ on the {r['input']['n_marked']} matching state(s)."),
                _stage("Circuit", f"H on every qubit, then {q['iterations']} × (oracle + diffuser): "
                                  f"{q['circuit']['gates']} gates, depth {q['circuit']['depth']}."),
                _stage("Run", f"Success probability {q['success_probability']:.1%}; the most frequent measurement "
                              f"was item #{q['answer']['measured_index']}."),
            ],
            "verification": {"match": bool(q["correct"] and r["classical"]["correct"]),
                             "detail": "Grover's answer equals the linear search result." if q["correct"] else
                                       "The measured item did not pass the oracle check."},
            "qiskit": r["qiskit"],
        })
    elif kind == "database":
        records, query = p.get("records"), p.get("query")
        if not records or not query:
            raise ValueError("Database needs 'records' and a 'query'.")
        r = compare_database(records=[str(x) for x in records], query=str(query), shots=shots, seed=seed)
        q = r["quantum"]
        match = set(x["index"] for x in q["retrieved"]).issubset(set(r["classical"]["matches"]))
        out.update({
            "details": r,
            "stages": [
                _stage("Bridge", f"The filter '{query}' becomes an oracle marking {r['input']['n_matches']} of "
                                 f"{r['input']['n_records']} records ({r['input']['qubits']} qubits)."),
                _stage("Circuit", f"{q['iterations']} amplitude-amplification round(s), {q['circuit']['gates']} gates."),
                _stage("Run", f"A match is measured with probability {q['success_probability']:.1%}; "
                              f"{len(q['retrieved'])} distinct matching record(s) seen in {q['shots']} shots."),
            ],
            "verification": {"match": bool(match), "detail": "Every retrieved record satisfies the query "
                                                             "(checked against the classical full scan)."
                             if match else "Some retrieved records do not match."},
            "qiskit": r["qiskit"],
        })
    elif kind == "factoring":
        N = int(p.get("N") or 0)
        r = compare_factoring(N, shots=shots, seed=seed)
        q = r["quantum"]
        d = q.get("detail") or {}
        stages = [_stage("Bridge", f"Factoring N = {N} becomes period finding: the modular multiplication "
                                   f"y → a·y mod N is a permutation unitary on {r['input']['qubits_needed']['work']} "
                                   "work qubits.")]
        if d:
            stages += [
                _stage("Circuit", f"{d.get('counting_qubits')} counting qubits + {d.get('work_qubits')} work qubits: "
                                  f"H layer, {d.get('counting_qubits')} controlled-U^(2^j), inverse QFT — "
                                  f"{d.get('gates')} gates, depth {d.get('depth')}."),
                _stage("Run", f"Measured phases gave the period r = {q.get('period')} of a = {q.get('a')}."),
            ]
        else:
            stages.append(_stage("Run", q.get("message") or ""))
        out.update({
            "details": r, "stages": stages,
            "verification": {"match": bool(q["correct"]),
                             "detail": f"Quantum factors {q['answer']['factors']} multiply back to {N}; trial division "
                                       f"found {r['classical']['answer']['factors']}."},
            "qiskit": r["qiskit"],
        })
    elif kind == "tsp" and p.get("cities"):
        r = compare_optimization(cities=p["cities"], p=layers, shots=max(shots, 2048), seed=seed)
        q = r["quantum"]
        out.update({
            "details": r,
            "stages": [
                _stage("Bridge", f"{len(r['input']['cities'])} cities → QUBO with {q['bridge']['qubo']['n']} binary "
                                 f"variables → Ising Hamiltonian ({len(q['bridge']['ising']['terms'])} Pauli terms)."),
                _stage("Circuit", f"QAOA with p = {q['layers']}: {q['circuit']['gates']} gates on {q['qubits']} qubits."),
                _stage("Run", f"COBYLA tuned γ, β over {q['circuit_evaluations']} circuit runs; "
                              f"P(optimal route) = {q['p_optimal']:.2%}."),
            ],
            "verification": {"match": bool(q["correct"]),
                             "detail": "QAOA's best route equals the exhaustive-search optimum." if q["correct"]
                                       else "QAOA's best route is longer than the optimum."},
            "qiskit": r["qiskit"],
        })
    elif kind in QAOA_KINDS:
        if kind == "tsp" and not p.get("distance_matrix"):
            raise ValueError("TSP needs 'cities' or a 'distance_matrix'.")
        res = _run_qaoa_problem(kind, p, layers, max(shots, 2048), seed)
        q = res["qaoa"]
        out.update({
            "details": res,
            "stages": [
                _stage("Bridge", f"{res['bridge']['title']} → QUBO over {res['qubits']} binary variables → Ising "
                                 f"Hamiltonian with {len(res['bridge']['ising']['terms'])} Pauli terms."),
                _stage("Circuit", f"QAOA p = {q['layers']}: RZ / RZZ cost layer + RX mixer, "
                                  f"{q['circuit']['gates']} gates."),
                _stage("Run", f"{q['circuit_evaluations']} circuit runs to tune γ, β; the optimum is now "
                              f"{q['amplification']:.1f}× more likely than random guessing."),
            ],
            "verification": res["verification"],
            "qiskit": res.pop("qiskit"),
        })
    elif kind == "boolean":
        expr = str(p.get("expression") or "").strip()
        if not expr:
            raise ValueError("Boolean mapping needs an 'expression'.")
        r = run_logic_pipeline(expr, shots=shots, seed=seed)
        circuit = r.pop("_circuit")
        g = r["grover"]
        out.update({
            "details": r,
            "stages": [
                _stage("Bridge", f"{r['n_variables']} variables → truth table (2^{r['n_variables']} rows) → algebraic "
                                 f"normal form → reversible circuit with {r['reversible_circuit']['gates']} gate(s), "
                                 f"and Hamiltonian with {r['hamiltonian']['n_terms']} Pauli-Z term(s)."),
                _stage("Verify", r["verification"]["method"]),
                _stage("Run", (f"Grover with the phase-kickback oracle: {g['iterations']} iteration(s), P(satisfying) = "
                               f"{g['success_probability']:.1%}.") if r["satisfiable"] else
                              "The formula is unsatisfiable — the oracle marks nothing, so there is nothing to find."),
            ],
            "verification": {"match": bool(r["verification"]["verified"] and
                                           (not r["satisfiable"] or g["found_solution"] is not None)),
                             "detail": r["verification"]["method"]},
            "qiskit": circuit.to_qiskit(),
        })

    out["total_ms"] = round((time.perf_counter() - t_start) * 1000, 3)
    return _clean(out)


def transform(code: str, mode: str = "auto", layers: int = 2, shots: int = 1024,
              seed: Optional[int] = None) -> Dict[str, Any]:
    spec = analyze(code, mode)
    result = execute(spec, layers=layers, shots=shots, seed=seed)
    return {"spec": spec, "result": result, "engine": llm_status()}
