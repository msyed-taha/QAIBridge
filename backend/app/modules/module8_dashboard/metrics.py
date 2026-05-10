"""
Module 8 – Interactive Performance Dashboard
metrics.py  –  Speedup factor, accuracy, and comparison metrics

All functions are pure (no side-effects) and return JSON-serialisable dicts.
"""

from __future__ import annotations

import math
from typing import Dict, Any, List, Optional


def speedup_factor(classical_time_ms: float, quantum_time_ms: float) -> float:
    """
    Compute speedup: classical_time / quantum_time.
    Returns > 1 if quantum is faster, < 1 if classical is faster.
    """
    if quantum_time_ms <= 0:
        return float("inf")
    return round(classical_time_ms / quantum_time_ms, 4)


def theoretical_speedup(algorithm: str, n: int) -> Dict:
    """
    Return theoretical complexity and speedup for known SFOD algorithms.

    algorithm: one of 'search', 'factoring', 'optimization', 'database'
    n: problem size (e.g. database records, number size in bits, cities)
    """
    table = {
        "search": {
            "classical_complexity": "O(N)",
            "quantum_complexity":   "O(√N)",
            "speedup_type":        "Quadratic",
            "classical_ops":       n,
            "quantum_ops":         math.ceil(math.sqrt(n)),
            "theoretical_speedup": round(n / max(math.sqrt(n), 1), 2),
        },
        "factoring": {
            "classical_complexity": "O(e^(N^{1/3}))",
            "quantum_complexity":   "O(N³)",
            "speedup_type":        "Super-polynomial (exponential for large N)",
            "classical_ops":       int(math.exp(n ** (1/3))) if n < 200 else 9999,
            "quantum_ops":         n ** 3,
            "theoretical_speedup": round(
                math.exp(n ** (1/3)) / max(n ** 3, 1), 4
            ) if n < 200 else "exponential",
        },
        "optimization": {
            "classical_complexity": "O(2^N)  (NP-Hard)",
            "quantum_complexity":   "O(√(2^N))  (QAOA approximate)",
            "speedup_type":        "Quadratic over brute-force",
            "classical_ops":       2 ** min(n, 20),
            "quantum_ops":         int(math.sqrt(2 ** min(n, 20))),
            "theoretical_speedup": round(math.sqrt(2 ** min(n, 20)), 2),
        },
        "database": {
            "classical_complexity": "O(N)",
            "quantum_complexity":   "O(√N)",
            "speedup_type":        "Quadratic (Grover)",
            "classical_ops":       n,
            "quantum_ops":         math.ceil(math.sqrt(n)),
            "theoretical_speedup": round(math.sqrt(n), 2),
        },
    }
    key = algorithm.lower()
    if key not in table:
        return {"error": f"Unknown algorithm '{algorithm}'."}
    result = table[key]
    result["algorithm"] = algorithm
    result["n"] = n
    return result


def accuracy_comparison(quantum_result: Any, classical_result: Any,
                         algorithm: str) -> Dict:
    """
    Compute a normalised accuracy / correctness comparison.

    For search/database: checks whether found indices match.
    For optimization: computes relative distance error.
    """
    if algorithm.lower() in ("search", "database"):
        q_found = quantum_result.get("found", False)
        c_found = classical_result.get("found", False)
        agreement = q_found == c_found
        return {
            "quantum_correct":    q_found,
            "classical_correct":  c_found,
            "agreement":          agreement,
            "accuracy_pct":       100.0 if agreement else 0.0,
        }

    if algorithm.lower() == "optimization":
        q_dist = quantum_result.get("total_distance", 0)
        c_dist = classical_result.get("total_distance", 0)
        if c_dist == 0:
            return {"relative_error": 0.0}
        rel_err = abs(q_dist - c_dist) / c_dist
        return {
            "quantum_distance":   q_dist,
            "classical_distance": c_dist,
            "relative_error":     round(rel_err, 4),
            "accuracy_pct":       round((1 - rel_err) * 100, 2),
        }

    return {"note": "Accuracy comparison not applicable for this algorithm type."}


def build_chart_data(benchmark_runs: List[Dict]) -> Dict:
    """
    Transform a list of benchmark run results into chart-ready data
    for the Plotly charts on the frontend.

    benchmark_runs: list of {n, classical_ms, quantum_ms, speedup}
    """
    if not benchmark_runs:
        return {"labels": [], "classical_times": [], "quantum_times": [], "speedups": []}

    return {
        "labels":           [str(r["n"]) for r in benchmark_runs],
        "classical_times":  [round(r["classical_ms"], 3) for r in benchmark_runs],
        "quantum_times":    [round(r["quantum_ms"], 3) for r in benchmark_runs],
        "speedups":         [round(r.get("speedup", 1.0), 3) for r in benchmark_runs],
    }


def format_complexity_label(complexity: str, n: int) -> str:
    """Return a human-readable label for a complexity expression at size n."""
    try:
        if "√N" in complexity:
            return f"~{math.ceil(math.sqrt(n))} ops"
        if "N²" in complexity:
            return f"~{n**2:,} ops"
        if "2^N" in complexity:
            return f"~{2**min(n,20):,} ops"
        if "N" in complexity:
            return f"~{n:,} ops"
    except Exception:
        pass
    return complexity
