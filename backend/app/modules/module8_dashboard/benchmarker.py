"""
Module 8 – Interactive Performance Dashboard
benchmarker.py  –  Side-by-side Quantum vs Classical benchmark suites.

Every point is a real run: classical code on the CPU and quantum circuits on
the Module 1 kernel. Points are streamed one by one through `emit` so the
dashboard charts update live (FE-1, FE-3).

Suites
  search        Grover vs linear search, 2 … n qubits           (Module 2)
  factoring     Shor vs trial division, N = 15 … 91             (Module 2)
  optimization  QAOA vs exhaustive search on random Max-Cut graphs (Modules 2 + 5)
  kernel        the "Memory Wall": simulation cost vs qubits    (Module 1)
  ai            quantum vs classical learning                    (Modules 6 + 7)
"""

from __future__ import annotations

import math
import time
from typing import Any, Callable, Dict, List, Optional

import numpy as np

from ..module1_kernel import CircuitLibrary, check_memory
from ..module2_sfod import classical
from ..module2_sfod.grover import run_grover
from ..module2_sfod.qaoa import run_qaoa
from ..module2_sfod.shor import run_shor
from ..module5_transformer.bridge import maxcut_bridge

Emit = Callable[[Dict[str, Any]], None]

SUITES: Dict[str, Dict[str, str]] = {
    "search":       {"title": "Search — Grover vs linear search", "module": "Quantum vs Classical"},
    "factoring":    {"title": "Factoring — Shor vs trial division", "module": "Quantum vs Classical"},
    "optimization": {"title": "Optimisation — QAOA vs exhaustive search (Max-Cut)", "module": "Quantum vs Classical + Code to Quantum"},
    "kernel":       {"title": "Memory wall — simulation cost vs qubits", "module": "Quantum Simulator"},
    "ai":           {"title": "AI — quantum vs classical learning", "module": "Neural Optimizer + Neural Network Converter"},
}

DEFAULT_OPTIONS = {"search_max_qubits": 12, "factoring_max_n": 91, "maxcut_max_nodes": 10,
                   "kernel_max_qubits": 22, "qaoa_layers": 2, "ai_iterations": 30, "seed": 7}
LIMITS = {"search_max_qubits": (4, 16), "factoring_max_n": (15, 127), "maxcut_max_nodes": (4, 14),
          "kernel_max_qubits": (10, 26), "qaoa_layers": (1, 3), "ai_iterations": (10, 60)}

SHOR_NS = [15, 21, 33, 35, 39, 51, 55, 57, 65, 69, 77, 85, 87, 91, 93, 95, 111, 115, 119, 123]


def normalise_options(options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(DEFAULT_OPTIONS)
    for k, v in (options or {}).items():
        if k in LIMITS:
            lo, hi = LIMITS[k]
            out[k] = int(min(max(int(v), lo), hi))
        elif k == "seed" and v is not None:
            out["seed"] = int(v)
    return out


# ── suites ────────────────────────────────────────────────────────────────────

def _search(opt: Dict[str, Any], emit: Emit) -> Dict[str, Any]:
    rng = np.random.default_rng(opt["seed"])
    points = []
    for n in range(2, opt["search_max_qubits"] + 1):
        N = 2 ** n
        target = int(rng.integers(0, N))
        data = rng.permutation(N)                     # unsorted data set
        cl = classical.linear_search(data, lambda v, t=target: v == t)
        q = run_grover(n, [int(np.flatnonzero(data == target)[0])], shots=256, seed=int(rng.integers(1 << 30)))
        k = max(q["iterations"], 1)
        point = {
            "qubits": n, "items": N,
            "classical_comparisons": cl["comparisons"], "classical_expected": (N + 1) / 2,
            "classical_ms": cl["time_ms"],
            "grover_queries": q["iterations"], "success_probability": q["success_probability"],
            "measured_success_rate": q["measured_success_rate"],
            "quantum_sim_ms": q["simulation_ms"], "gates": q["circuit"]["gates"], "depth": q["circuit"]["depth"],
            "query_speedup": round(((N + 1) / 2) / k, 3),
        }
        points.append(point)
        emit(point)
    last = points[-1]
    return {"points": len(points), "max_items": last["items"], "best_query_speedup": last["query_speedup"],
            "min_success_probability": min(p["success_probability"] for p in points)}


def _factoring(opt: Dict[str, Any], emit: Emit) -> Dict[str, Any]:
    points = []
    for i, N in enumerate(n for n in SHOR_NS if n <= opt["factoring_max_n"]):
        cl = classical.trial_division(N)
        r = run_shor(N, seed=opt["seed"] + i, shots=512)
        ok = [a for a in r["attempts"] if a.get("success")]
        att = ok[0] if ok else (r["attempts"][-1] if r["attempts"] else {})
        point = {
            "N": N, "bits": N.bit_length(), "qubits": att.get("qubits"), "gates": att.get("gates"),
            "depth": att.get("depth"), "quantum_sim_ms": r.get("simulation_ms"),
            "success": r["status"] == "factored", "attempts": len(r["attempts"]),
            "a": r.get("a"), "period": r.get("period"),
            "factors": "×".join(map(str, r.get("factors") or [])),
            "classical_divisions": cl["divisions"], "classical_ms": cl["time_ms"],
        }
        points.append(point)
        emit(point)
    succ = sum(p["success"] for p in points)
    return {"points": len(points), "success_rate": round(succ / max(len(points), 1), 3),
            "max_qubits": max((p["qubits"] or 0) for p in points) if points else 0}


def _random_graph(n: int, rng: np.random.Generator):
    """Connected random graph with average degree ≈ 3 (ring + random chords)."""
    edges = {(i, (i + 1) % n) for i in range(n)}
    extra = max(0, int(round(1.5 * n)) - n)
    while extra > 0:
        a, b = sorted(map(int, rng.choice(n, 2, replace=False)))
        if (a, b) not in edges and (b, a) not in edges:
            edges.add((a, b))
            extra -= 1
    return [(min(a, b), max(a, b), 1.0) for a, b in sorted(edges)]


def _optimization(opt: Dict[str, Any], emit: Emit) -> Dict[str, Any]:
    rng = np.random.default_rng(opt["seed"])
    points = []
    for n in range(4, opt["maxcut_max_nodes"] + 1):
        edges = _random_graph(n, rng)
        b = maxcut_bridge(n, edges)
        t0 = time.perf_counter()
        exact = b.solve_exactly()
        brute_ms = (time.perf_counter() - t0) * 1000
        q = run_qaoa(b, p=opt["qaoa_layers"], objective="expectation", shots=1024, seed=int(rng.integers(1 << 30)))
        max_cut = exact["cut_value"]
        expected_cut = -q["expected_energy"]
        point = {
            "nodes": n, "edges": len(edges), "qubits": n, "max_cut": max_cut,
            "expected_cut": round(expected_cut, 4), "approx_ratio": round(expected_cut / max_cut, 4),
            "best_sampled_cut": q["best_sampled"]["cut_value"], "best_is_optimal": q["best_sampled"]["optimal"],
            "p_optimal": q["p_optimal"], "random_p_optimal": q["random_p_optimal"], "amplification": q["amplification"],
            "circuit_evaluations": q["circuit_evaluations"], "quantum_ms": q["optimisation_ms"],
            "brute_force_evaluations": 2 ** n, "classical_ms": round(brute_ms, 4), "gates": q["circuit"]["gates"],
        }
        points.append(point)
        emit(point)
    return {"points": len(points),
            "mean_approx_ratio": round(float(np.mean([p["approx_ratio"] for p in points])), 4),
            "optimal_found": sum(p["best_is_optimal"] for p in points)}


def _kernel(opt: Dict[str, Any], emit: Emit) -> Dict[str, Any]:
    points = []
    for n in range(10, opt["kernel_max_qubits"] + 1, 2):
        mem = check_memory(n)
        if not mem.is_safe:
            emit({"qubits": n, "skipped": True, "reason": mem.warning})
            break
        ghz = CircuitLibrary.ghz_state(n)
        t0 = time.perf_counter()
        ghz.run(shots=128)
        ghz_ms = (time.perf_counter() - t0) * 1000
        qft = CircuitLibrary.qft_circuit(n)
        t0 = time.perf_counter()
        qft.run(shots=128)
        qft_ms = (time.perf_counter() - t0) * 1000
        point = {"qubits": n, "amplitudes": 2 ** n, "memory_mb": round(mem.required_gb * 1000, 3),
                 "ghz_gates": ghz.gate_count(), "ghz_ms": round(ghz_ms, 2),
                 "qft_gates": qft.gate_count(), "qft_ms": round(qft_ms, 2)}
        points.append(point)
        emit(point)
    return {"points": len(points), "max_qubits": points[-1]["qubits"] if points else 0,
            "max_memory_mb": points[-1]["memory_mb"] if points else 0}


def _ai(opt: Dict[str, Any], emit: Emit) -> Dict[str, Any]:
    from ..module6_optimizer import race
    from ..module7_qnn import compare
    from ..module7_qnn.trainer import DEFAULT_LAYERS

    iters = opt["ai_iterations"]
    # The Neural Network Converter: a classical network (2 layers of 4) and the quantum network it becomes, one seed.
    t0 = time.perf_counter()
    rep = compare(DEFAULT_LAYERS, "xor", steps=iters, seeds=1)
    m7_ms = (time.perf_counter() - t0) * 1000
    cl, qn = rep["methods"]["classical"], rep["methods"]["quantum"]
    p1 = {"experiment": "qnn_vs_mlp", "label": "Classical network vs the quantum network it becomes (XOR, 2 layers of 4)",
          "classical_accuracy": cl["test_accuracy"]["mean"], "quantum_accuracy": qn["test_accuracy"]["mean"],
          "classical_params": cl["params"], "quantum_params": qn["params"],
          "classical_curve": cl["curve_mean"], "quantum_curve": qn["curve_mean"],
          "total_ms": round(m7_ms, 1), "qubits": rep["conversion"]["qnn"]["n_qubits"]}
    emit(p1)
    # The Neural Optimizer's fair race on a deep circuit (6 qubits, 12 layers, 1,000 shots), one seed.
    t0 = time.perf_counter()
    rep = race(6, 12, 1000, steps=iters, seeds=1)
    m6_ms = (time.perf_counter() - t0) * 1000
    rand, neural = rep["methods"]["random"], rep["methods"]["neural"]
    learned = lambda m: m["steps_to_target"][0] if m["steps_to_target"][0] is not None else iters   # noqa: E731
    p2 = {"experiment": "angle_optimizer", "label": "Random start vs Neural Angle Optimizer (fair race, 6 qubits, 12 layers)",
          "classical_accuracy": rand["test_accuracy"], "quantum_accuracy": neural["test_accuracy"],
          "classical_curve": rand["curve_mean"], "quantum_curve": neural["curve_mean"],
          "classical_iters_to_converge": learned(rand), "neural_iters_to_converge": learned(neural),
          "plateau_events": len(rand["events"][0]),
          "total_ms": round(m6_ms, 1), "qubits": rep["n_qubits"]}
    emit(p2)
    return {"points": 2, "qnn_accuracy": p1["quantum_accuracy"], "mlp_accuracy": p1["classical_accuracy"],
            "qnn_params": p1["quantum_params"], "mlp_params": p1["classical_params"],
            "neural_optimizer_accuracy": neural["test_accuracy"]}


RUNNERS: Dict[str, Callable[[Dict[str, Any], Emit], Dict[str, Any]]] = {
    "search": _search, "factoring": _factoring, "optimization": _optimization, "kernel": _kernel, "ai": _ai,
}


def run_benchmark(suites: List[str], options: Optional[Dict[str, Any]] = None,
                  on_event: Optional[Emit] = None) -> Dict[str, Any]:
    """Run the chosen suites in order; on_event receives every progress event."""
    opt = normalise_options(options)
    suites = [s for s in suites if s in RUNNERS] or list(RUNNERS)
    events = on_event or (lambda e: None)
    results: Dict[str, Any] = {}
    t_start = time.perf_counter()
    events({"type": "start", "suites": suites, "options": opt})
    for s in suites:
        points: List[Dict[str, Any]] = []
        events({"type": "suite_start", "suite": s, "title": SUITES[s]["title"]})
        t0 = time.perf_counter()

        def emit(point: Dict[str, Any], _s=s, _pts=points) -> None:
            _pts.append(point)
            events({"type": "point", "suite": _s, "index": len(_pts) - 1, "data": point})

        try:
            summary = RUNNERS[s](opt, emit)
            summary["duration_ms"] = round((time.perf_counter() - t0) * 1000, 1)
            results[s] = {"title": SUITES[s]["title"], "module": SUITES[s]["module"],
                          "points": points, "summary": summary}
            events({"type": "suite_done", "suite": s, "summary": summary})
        except MemoryError as e:
            results[s] = {"title": SUITES[s]["title"], "points": points, "summary": {"error": str(e)}}
            events({"type": "suite_error", "suite": s, "detail": str(e)})
    duration = round((time.perf_counter() - t_start) * 1000, 1)
    return {"suites": results, "options": opt, "duration_ms": duration}


def headline(results: Dict[str, Any]) -> Dict[str, Any]:
    """Small KPI dict stored with the run (history list / overview cards)."""
    out: Dict[str, Any] = {}
    s = results.get("suites", {})
    if "search" in s and "best_query_speedup" in s["search"]["summary"]:
        out["grover_speedup"] = s["search"]["summary"]["best_query_speedup"]
        out["grover_items"] = s["search"]["summary"]["max_items"]
    if "factoring" in s and "success_rate" in s["factoring"]["summary"]:
        out["shor_success_rate"] = s["factoring"]["summary"]["success_rate"]
    if "optimization" in s and "mean_approx_ratio" in s["optimization"]["summary"]:
        out["qaoa_approx_ratio"] = s["optimization"]["summary"]["mean_approx_ratio"]
    if "kernel" in s and "max_qubits" in s["kernel"]["summary"]:
        out["kernel_max_qubits"] = s["kernel"]["summary"]["max_qubits"]
    if "ai" in s and "qnn_accuracy" in s["ai"]["summary"]:
        out["qnn_accuracy"] = s["ai"]["summary"]["qnn_accuracy"]
        out["mlp_accuracy"] = s["ai"]["summary"]["mlp_accuracy"]
    return out
