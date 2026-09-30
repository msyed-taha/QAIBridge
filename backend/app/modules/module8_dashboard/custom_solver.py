"""
Custom Problem Solver (Solve page)
Runs user-supplied data through a Classical OR a Quantum algorithm for each
SFOD type. The quantum side executes real circuits on the Module 1 kernel
through the Module 2 suite (Grover, Shor, QAOA, amplitude amplification).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, List, Optional

from ..module2_sfod import classical
from ..module2_sfod.grover import optimal_iterations
from ..module2_sfod.suite import (
    MAX_TSP_CITIES, compare_database, compare_factoring, compare_optimization,
    compare_search, parse_query,
)
from ..module2_sfod.shor import MAX_SHOR_N, qubits_needed
from ..module5_transformer.bridge import distance_matrix_from_cities

MAX_CLASSICAL_EXACT_TSP = 9


# ──────────────────────────────────────────────────────────────────────────────
# Result dataclass
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class SolveResult:
    problem_type:      str
    approach:          str        # "classical" | "quantum"
    algorithm:         str
    result:            Any
    steps:             int
    elapsed_ms:        float
    complexity:        str
    theoretical_steps: int
    input_size:        int
    explanation:       str
    success:           bool
    error:             Optional[str] = None
    steps_label:       str = "steps"

    def to_dict(self) -> dict:
        return {
            "problem_type":      self.problem_type,
            "approach":          self.approach,
            "algorithm":         self.algorithm,
            "result":            self.result,
            "steps":             self.steps,
            "steps_label":       self.steps_label,
            "elapsed_ms":        self.elapsed_ms,
            "complexity":        self.complexity,
            "theoretical_steps": self.theoretical_steps,
            "input_size":        self.input_size,
            "explanation":       self.explanation,
            "success":           self.success,
            "error":             self.error,
        }


def _failed(problem_type: str, approach: str, algorithm: str, complexity: str,
            input_size: int, message: str) -> SolveResult:
    return SolveResult(problem_type, approach, algorithm, {}, 0, 0.0, complexity, 0, input_size,
                       message, False, error=message)


# ══════════════════════════════════════════════════════════════════════════════
# SEARCH
# ══════════════════════════════════════════════════════════════════════════════

def solve_search_classical(dataset: List[str], target: str) -> SolveResult:
    """Linear Search — O(N)"""
    items = [str(x).strip() for x in dataset if str(x).strip()]
    tnorm = str(target).strip().lower()
    r = classical.linear_search(items, lambda s: s.lower() == tnorm)
    idx = r["found_index"]
    n = len(items)
    return SolveResult(
        problem_type="search", approach="classical", algorithm="Linear Search",
        result={"found": idx is not None, "index": idx, "value": items[idx] if idx is not None else None,
                "target": target},
        steps=r["comparisons"], steps_label="comparisons", elapsed_ms=r["time_ms"], complexity="O(N)",
        theoretical_steps=n, input_size=n,
        explanation=(
            f"Scanned {r['comparisons']} of {n} item(s) one by one until the target was "
            f"{'found' if idx is not None else 'ruled out'}. Unsorted data offers no shortcut: "
            f"on average N/2 = {n / 2:g} comparisons, {n} in the worst case."
        ),
        success=idx is not None,
    )


def solve_search_quantum(dataset: List[str], target: str) -> SolveResult:
    """Grover's Algorithm — O(√N), executed on the state-vector kernel."""
    items = [str(x).strip() for x in dataset if str(x).strip()]
    try:
        cmp = compare_search(items=items, target=target)
    except (ValueError, MemoryError) as e:
        return _failed("search", "quantum", "Grover's Algorithm", "O(√N)", len(items), str(e))
    q = cmp["quantum"]
    ans = q["answer"]
    n = len(items)
    found = ans["index"] is not None
    hist = [{"label": items[h["index"]] if h["index"] < n else f"(padding {h['index']})",
             "count": h["count"], "marked": h["marked"]} for h in q["histogram"][:8]]
    return SolveResult(
        problem_type="search", approach="quantum", algorithm="Grover's Algorithm",
        result={
            "found": found, "index": ans["index"], "value": ans["value"], "target": target,
            "grover_iterations": q["iterations"], "success_probability": q["success_probability"],
            "qubits": q["n_qubits"], "gates": q["circuit"]["gates"], "depth": q["circuit"]["depth"],
            "shots": q["shots"], "measured_success_rate": q["measured_success_rate"],
            "histogram": hist, "curve": q["curve"],
        },
        steps=q["iterations"], steps_label="oracle queries", elapsed_ms=q["simulation_ms"],
        complexity="O(√N)", theoretical_steps=max(1, optimal_iterations(2 ** q["n_qubits"], 1)), input_size=n,
        explanation=(
            f"Encoded {n} items into {q['n_qubits']} qubits ({2 ** q['n_qubits']} basis states) and put them in "
            f"equal superposition. {q['iterations']} Grover iteration(s) (oracle + diffuser) raised the target's "
            f"probability from {1 / 2 ** q['n_qubits']:.2%} to {q['success_probability']:.1%}; "
            f"{q['measured_success_rate']:.0%} of {q['shots']} simulated measurements returned it. "
            + ("A final oracle check verified the answer." if found else
               "The measured item failed the final oracle check, so the target is reported as not present.")
        ),
        success=found,
    )


# ══════════════════════════════════════════════════════════════════════════════
# FACTORING
# ══════════════════════════════════════════════════════════════════════════════

def solve_factoring_classical(number: int) -> SolveResult:
    """Trial Division (Pollard's rho for very large N)."""
    r = classical.trial_division(number) if number < 10 ** 12 else classical.pollard_rho(number)
    factors = r["factors"]
    steps = r.get("divisions", r.get("iterations", 0))
    return SolveResult(
        problem_type="factoring", approach="classical", algorithm=r["algorithm"],
        result={"number": number, "factors": factors, "factored_form": " × ".join(map(str, factors)),
                "is_prime": len(factors) == 1 and factors[0] == number},
        steps=steps, steps_label="trial divisions" if "divisions" in r else "iterations",
        elapsed_ms=r["time_ms"], complexity=r["complexity"], theoretical_steps=math.isqrt(number),
        input_size=number,
        explanation=(
            f"{r['algorithm']} factored {number:,} = {' × '.join(map(str, factors))} after {steps:,} steps. "
            f"The worst case (a prime or a product of two large primes) needs ~√N = {math.isqrt(number):,} "
            "trial divisions — infeasible for 600-digit RSA moduli."
        ),
        success=True,
    )


def solve_factoring_quantum(number: int) -> SolveResult:
    """Shor's Algorithm — quantum order finding + continued fractions."""
    qn = qubits_needed(number)
    try:
        cmp = compare_factoring(number)
    except (ValueError, MemoryError) as e:
        msg = str(e)
        return _failed("factoring", "quantum", "Shor's Algorithm (QFT)", "O((log N)³)", number,
                       msg + f" (N = {number:,} would need {qn['total']} qubits.)" if "qubits" not in msg else msg)
    q = cmp["quantum"]
    factors = q["answer"]["factors"] or []
    detail = q.get("detail") or {}
    is_prime = q["status"] == "prime"
    return SolveResult(
        problem_type="factoring", approach="quantum", algorithm="Shor's Algorithm (QFT)",
        result={
            "number": number, "factors": factors, "factored_form": " × ".join(map(str, factors)),
            "is_prime": is_prime, "qubits_needed": qn["total"], "status": q["status"],
            "a": q.get("a"), "period": q.get("period"),
            "qubits": detail.get("qubits"), "gates": detail.get("gates"), "depth": detail.get("depth"),
            "measurements": detail.get("measurements", [])[:8],
            "post_processing": detail.get("post_processing", [])[:4],
        },
        steps=q["steps"], steps_label="quantum circuit runs", elapsed_ms=q["time_ms"],
        complexity="O((log N)³)", theoretical_steps=max(1, number.bit_length() ** 3), input_size=number,
        explanation=q.get("message") or "",
        success=bool(factors),
    )


# ══════════════════════════════════════════════════════════════════════════════
# OPTIMIZATION  (Travelling Salesman Problem on real coordinates)
# ══════════════════════════════════════════════════════════════════════════════

def solve_optimization_classical(cities: List[str]) -> SolveResult:
    """Exhaustive search (≤ 9 cities) or Greedy Nearest Neighbour."""
    geo = distance_matrix_from_cities(cities)
    d, names = geo["dist"], geo["names"]
    n = len(names)
    if n <= MAX_CLASSICAL_EXACT_TSP:
        r = classical.tsp_brute_force(d)
        steps, label, optimal = r["tours_evaluated"], "tours evaluated", True
    else:
        r = classical.tsp_nearest_neighbour(d)
        steps, label, optimal = r["comparisons"], "comparisons", False
    tour = [names[c] for c in r["tour"]]
    return SolveResult(
        problem_type="optimization", approach="classical", algorithm=r["algorithm"],
        result={"tour": tour, "total_distance": round(r["length"], 1), "unit": "km", "num_cities": n,
                "is_optimal": optimal, "coords": geo["coords"], "sources": geo["sources"]},
        steps=steps, steps_label=label, elapsed_ms=r["time_ms"], complexity=r["complexity"],
        theoretical_steps=math.factorial(n - 1) if optimal else n * n, input_size=n,
        explanation=(
            f"{r['algorithm']} over real great-circle distances between the cities: "
            + (f"checked all {steps:,} possible tours and kept the shortest ({r['length']:.1f} km)."
               if optimal else f"picked the nearest unvisited city at each stop ({steps} comparisons). "
                               "Fast, but not guaranteed optimal.")
        ),
        success=True,
    )


def solve_optimization_quantum(cities: List[str]) -> SolveResult:
    """QAOA — Travelling Salesman encoded as an Ising Hamiltonian."""
    n = len(cities)
    if n > MAX_TSP_CITIES:
        return _failed("optimization", "quantum", "QAOA", "variational", n,
                       f"QAOA on the local simulator handles up to {MAX_TSP_CITIES} cities: the TSP encoding needs "
                       f"(N−1)² qubits, so {n} cities would need {(n - 1) ** 2} qubits. Remove some cities or use "
                       "the classical solver.")
    try:
        cmp = compare_optimization(cities=cities, p=2)
    except (ValueError, MemoryError) as e:
        return _failed("optimization", "quantum", "QAOA", "variational", n, str(e))
    q = cmp["quantum"]
    best = q["best_sampled"]
    return SolveResult(
        problem_type="optimization", approach="quantum", algorithm="QAOA",
        result={
            "tour": best.get("tour_names") or [], "total_distance": round(best["length"], 1) if best.get("length") else None,
            "unit": "km", "num_cities": n, "qaoa_layers": q["layers"],
            "is_optimal": q["correct"], "qubits": q["qubits"], "gates": q["circuit"]["gates"],
            "p_optimal": q["p_optimal"], "random_p_optimal": q["random_p_optimal"],
            "amplification": q["amplification"], "p_feasible": q["p_feasible"],
            "gammas": q["gammas"], "betas": q["betas"], "coords": cmp["input"]["coords"],
            "hamiltonian": q["bridge"]["ising"]["hamiltonian"],
        },
        steps=q["circuit_evaluations"], steps_label="circuit evaluations", elapsed_ms=q["time_ms"],
        complexity="variational", theoretical_steps=q["circuit_evaluations"], input_size=n,
        explanation=(
            f"The route problem was translated into a {q['qubits']}-qubit Ising Hamiltonian (one qubit per "
            f"city/position pair, with penalty terms enforcing a valid tour). A classical optimiser tuned "
            f"{2 * q['layers']} QAOA angles over {q['circuit_evaluations']} circuit runs; the final circuit makes "
            f"the optimal tour {q['amplification']:.1f}× more likely than random guessing, and the best measured tour "
            f"{'is' if q['correct'] else 'is not'} the true optimum."
        ),
        success=bool(best.get("feasible")),
    )


# ══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════════════════════

def solve_database_classical(records: List[str], query: str) -> SolveResult:
    """Sequential Scan — O(N)"""
    recs = [str(r).strip() for r in records if str(r).strip()]
    try:
        matcher, described = parse_query(query)
    except ValueError as e:
        return _failed("database", "classical", "Sequential Scan", "O(N)", len(recs), str(e))
    r = classical.sequential_scan(recs, matcher)
    matches = [{"index": i, "value": recs[i]} for i in r["matches"]]
    n = len(recs)
    return SolveResult(
        problem_type="database", approach="classical", algorithm="Sequential Scan",
        result={"query": query, "query_meaning": described, "total_records": n,
                "matches_found": len(matches), "matches": matches[:100]},
        steps=n, steps_label="record reads", elapsed_ms=r["time_ms"], complexity="O(N)",
        theoretical_steps=n, input_size=n,
        explanation=(f"Read all {n} records once (no index exists) and found {len(matches)} {described}."),
        success=True,
    )


def solve_database_quantum(records: List[str], query: str) -> SolveResult:
    """Amplitude Amplification (generalised Grover) — O(√(N/M))"""
    recs = [str(r).strip() for r in records if str(r).strip()]
    try:
        cmp = compare_database(records=recs, query=query)
    except (ValueError, MemoryError) as e:
        return _failed("database", "quantum", "Amplitude Amplification", "O(√(N/M))", len(recs), str(e))
    q = cmp["quantum"]
    n = len(recs)
    matches = [{"index": m["index"], "value": m["record"], "count": m["count"]} for m in q["retrieved"]]
    return SolveResult(
        problem_type="database", approach="quantum", algorithm="Amplitude Amplification",
        result={"query": query, "query_meaning": cmp["input"]["query_meaning"], "total_records": n,
                "matches_found": len(matches), "matches": matches, "true_matches": cmp["input"]["n_matches"],
                "quantum_queries": q["iterations"], "success_probability": q["success_probability"],
                "qubits": q["n_qubits"], "shots": q["shots"]},
        steps=q["iterations"], steps_label="oracle queries", elapsed_ms=q["simulation_ms"],
        complexity="O(√(N/M))", theoretical_steps=max(1, math.ceil(math.sqrt(n))), input_size=n,
        explanation=(
            f"Loaded {n} records into {q['n_qubits']} qubits. The oracle marks the "
            f"{cmp['input']['n_matches']} matching record(s); {q['iterations']} amplification round(s) raised the "
            f"chance that a measurement returns a match to {q['success_probability']:.1%}. Across {q['shots']} "
            f"simulated measurements, {len(matches)} distinct matching record(s) were retrieved."
        ),
        success=cmp["input"]["n_matches"] == 0 or bool(matches),
    )
