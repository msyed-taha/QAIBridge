"""
Module 2 – SFOD Model Comparison Suite
suite.py  –  Side-by-side Classical vs Quantum runs for the four SFOD tasks.

    S  Search        Linear search          vs  Grover's algorithm
    F  Factoring     Trial division         vs  Shor's algorithm
    O  Optimisation  Exhaustive / greedy    vs  QAOA (via the Module 5 Bridge)
    D  Database      Sequential scan        vs  Amplitude amplification

Both sides really run: classical code on the CPU, quantum circuits on the
Module 1 state-vector kernel. The fair speed metric is the number of
problem queries (oracle calls vs comparisons) — wall-clock time of a
simulated quantum circuit measures the cost of *simulating* it, and is
reported separately.

Used by the Module 2 page, the Solve page, the Module 4 advisor ("solve it")
and the Module 8 benchmark dashboard.
"""

from __future__ import annotations

import math
import re
import time
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import classical
from .grover import MAX_GROVER_QUBITS, optimal_iterations, run_grover
from .qaoa import MAX_QAOA_QUBITS, run_qaoa, tsp_feasible_mask
from .shor import MAX_SHOR_N, crypto_resource_table, qubits_needed, run_shor
from ..module5_transformer.bridge import distance_matrix_from_cities, tsp_bridge

MAX_TSP_CITIES = 5          # (5−1)² = 16 qubits


# ── helpers ───────────────────────────────────────────────────────────────────

def _clean(obj: Any) -> Any:
    """Drop private keys ("_circuit") and convert NumPy scalars for JSON."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if not str(k).startswith("_")}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def _ratio(a: float, b: float) -> Optional[float]:
    return round(a / b, 3) if b else None


def grover_qiskit_code(n: int, marked: Sequence[int], iterations: int) -> str:
    return f'''"""
Grover's search exported from QAIBridge — {n} qubits, {len(marked)} marked item(s), {iterations} iteration(s).
Run:  pip install qiskit qiskit-aer   then   python grover.py
"""
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

n = {n}
marked = {list(marked)[:64]}      # basis states to find (QAIBridge big-endian labels)
iterations = {iterations}

def mcz(qc):
    qc.h(n - 1)
    qc.mcx(list(range(n - 1)), n - 1)
    qc.h(n - 1)

def oracle(qc):
    for m in marked:
        zeros = [q for q, b in enumerate(format(m, f"0{{n}}b")) if b == "0"]
        for q in zeros:
            qc.x(q)
        mcz(qc)
        for q in zeros:
            qc.x(q)

def diffuser(qc):
    qc.h(range(n))
    qc.x(range(n))
    mcz(qc)
    qc.x(range(n))
    qc.h(range(n))

qc = QuantumCircuit(n, n)
qc.h(range(n))
for _ in range(iterations):
    oracle(qc)
    diffuser(qc)
qc.measure(range(n), range(n))

sim = AerSimulator()
counts = sim.run(transpile(qc, sim), shots=1024).result().get_counts()
counts = {{int(k[::-1], 2): v for k, v in counts.items()}}   # back to QAIBridge indices
print(sorted(counts.items(), key=lambda kv: -kv[1])[:5])
'''


def search_scaling(max_exp: int = 40) -> List[Dict[str, float]]:
    rows = []
    for e in range(2, max_exp + 1, 2):
        N = 2 ** e
        rows.append({"n_items": N, "classical_expected": (N + 1) / 2, "classical_worst": N,
                     "quantum": optimal_iterations(N, 1)})
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# S — Search
# ══════════════════════════════════════════════════════════════════════════════

def compare_search(n_qubits: Optional[int] = None, target_index: Optional[int] = None,
                   items: Optional[Sequence[str]] = None, target: Optional[str] = None,
                   shots: int = 1024, seed: Optional[int] = None) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)
    if items is not None:
        items = [str(x).strip() for x in items if str(x).strip()]
        if not items:
            raise ValueError("The dataset is empty.")
        if target is None or not str(target).strip():
            raise ValueError("Enter the item to search for.")
        n_real = len(items)
        n_qubits = max(1, math.ceil(math.log2(n_real)))
        if n_qubits > MAX_GROVER_QUBITS:
            raise ValueError(f"Grover simulation here supports up to {2 ** MAX_GROVER_QUBITS:,} items "
                             f"({MAX_GROVER_QUBITS} qubits); your dataset has {n_real:,}.")
        tnorm = str(target).strip().lower()
        is_target = lambda s: str(s).strip().lower() == tnorm  # noqa: E731
        marked = [i for i, s in enumerate(items) if is_target(s)]
        labels = list(items)
    else:
        n_qubits = int(n_qubits or 4)
        if not 1 <= n_qubits <= MAX_GROVER_QUBITS:
            raise ValueError(f"Choose 1–{MAX_GROVER_QUBITS} qubits.")
        n_real = 2 ** n_qubits
        if target_index is None:
            target_index = int(rng.integers(0, n_real))
        if not 0 <= int(target_index) < n_real:
            raise ValueError(f"Target must be between 0 and {n_real - 1}.")
        labels = [str(i) for i in range(n_real)]
        target = str(int(target_index))
        is_target = lambda s: s == target  # noqa: E731
        marked = [int(target_index)]

    cl = classical.linear_search(labels, is_target)
    q = run_grover(n_qubits, marked, shots=shots, seed=seed)
    N = 2 ** n_qubits
    k = q["iterations"]
    # Grover ends with one verification query: the measured item is checked by the oracle.
    measured_idx = q["most_frequent"]
    verified = measured_idx is not None and measured_idx in set(marked)
    answer_idx = measured_idx if verified else None
    q_correct = verified if marked else answer_idx is None
    cl_correct = (cl["found_index"] in set(marked)) if marked else cl["found_index"] is None

    expected_classical = (n_real + 1) / 2 if marked else n_real
    notes = [
        "Queries are the fair metric: each classical comparison and each quantum oracle call asks the same "
        "question ('is this the item?'). Simulation time is the cost of emulating the quantum computer on a CPU.",
    ]
    if n_real < N:
        notes.append(f"{n_real} items were padded to 2^{n_qubits} = {N} basis states; padding slots are never marked.")
    if not marked:
        notes.append("The target is not in the dataset, so there is nothing for the oracle to mark — Grover's "
                     "algorithm leaves the uniform superposition unchanged and a measurement returns a random item.")
    elif len(marked) > 1:
        notes.append(f"The target occurs {len(marked)} times; Grover marks every occurrence (M = {len(marked)}).")

    return _clean({
        "algorithm": "search",
        "title": "Unstructured search",
        "input": {"n_items": n_real, "search_space": N, "qubits": n_qubits, "target": target,
                  "marked": marked[:64], "n_marked": len(marked)},
        "classical": {
            **cl, "answer": {"index": cl["found_index"],
                             "value": labels[cl["found_index"]] if cl["found_index"] is not None else None},
            "steps": cl["comparisons"], "steps_label": "comparisons", "correct": cl_correct,
        },
        "quantum": {
            **q, "algorithm": "Grover's Algorithm", "complexity": "O(√N)",
            "answer": {"index": answer_idx,
                       "value": labels[answer_idx] if answer_idx is not None and answer_idx < n_real else None,
                       "measured_index": measured_idx, "verified": verified},
            "steps": k, "steps_label": "oracle queries", "correct": q_correct,
            "time_ms": q["simulation_ms"],
        },
        "comparison": {
            "classical_steps": cl["comparisons"], "quantum_steps": k,
            "classical_expected": expected_classical, "classical_worst": n_real,
            "query_speedup_expected": _ratio(expected_classical, max(k, 1)),
            "query_speedup_worst": _ratio(n_real, max(k, 1)),
            "scaling": search_scaling(),
            "notes": notes,
        },
        "qiskit": grover_qiskit_code(n_qubits, marked, k),
    })


# ══════════════════════════════════════════════════════════════════════════════
# D — Database (amplitude amplification with several matching records)
# ══════════════════════════════════════════════════════════════════════════════

_FIRST = ["Ayesha", "Bilal", "Hamza", "Fatima", "Usman", "Zainab", "Ali", "Maryam", "Omar", "Hira",
          "Saad", "Noor", "Taha", "Maqdad", "Sana", "Imran", "Aiman", "Hassan", "Iqra", "Danish"]
_LAST = ["Khan", "Raza", "Malik", "Ahmed", "Qureshi", "Siddiqui", "Butt", "Shah", "Chaudhry", "Iqbal"]
_DEPTS = ["Research", "Engineering", "Finance", "Marketing", "Operations", "Security", "Data Science", "HR"]
_CITIES = ["Islamabad", "Lahore", "Karachi", "Peshawar", "Quetta", "Multan", "Faisalabad", "Sialkot"]


def synthetic_records(n: int, seed: int = 7) -> List[str]:
    """A reproducible employee table rendered as one text line per record."""
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        rows.append(f"#{i:04d} {rng.choice(_FIRST)} {rng.choice(_LAST)} · {rng.choice(_DEPTS)} · "
                    f"Age {int(rng.integers(21, 65))} · {rng.choice(_CITIES)}")
    return rows


_QUERY_RE = re.compile(r"^\s*([A-Za-z][\w ]*?)\s*(>=|<=|!=|=|>|<)\s*(.+?)\s*$")


def parse_query(query: str) -> Tuple[Callable[[str], bool], str]:
    """
    'Engineer'        → records containing the keyword (case-insensitive)
    'age > 40'        → numeric comparison on the number after 'age'
    'city = Lahore'   → records whose text contains 'Lahore'
    """
    q = (query or "").strip()
    if not q:
        raise ValueError("Enter a query.")
    m = _QUERY_RE.match(q)
    if m:
        field, op, value = m.group(1).strip(), m.group(2), m.group(3).strip()
        try:
            num = float(value)
        except ValueError:
            num = None
        if num is not None and op in (">", "<", ">=", "<=", "=", "!="):
            pattern = re.compile(rf"{re.escape(field)}\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)", re.IGNORECASE)
            ops = {">": lambda a: a > num, "<": lambda a: a < num, ">=": lambda a: a >= num,
                   "<=": lambda a: a <= num, "=": lambda a: a == num, "!=": lambda a: a != num}

            def matches(rec: str) -> bool:
                hit = pattern.search(rec)
                return bool(hit) and ops[op](float(hit.group(1)))
            return matches, f"records where {field} {op} {value}"
        needle = value.lower()
        if op == "!=":
            return (lambda rec: needle not in rec.lower()), f"records without '{value}'"
        return (lambda rec: needle in rec.lower()), f"records where {field} is '{value}'"
    needle = q.lower()
    return (lambda rec: needle in rec.lower()), f"records containing '{q}'"


def compare_database(records: Optional[Sequence[str]] = None, query: str = "Research",
                     n_records: Optional[int] = None, shots: int = 1024,
                     seed: Optional[int] = None) -> Dict[str, Any]:
    if records is None:
        n_records = int(n_records or 256)
        if not 4 <= n_records <= 2 ** MAX_GROVER_QUBITS:
            raise ValueError(f"Use 4–{2 ** MAX_GROVER_QUBITS:,} records.")
        records = synthetic_records(n_records)
    records = [str(r).strip() for r in records if str(r).strip()]
    if not records:
        raise ValueError("The database is empty.")
    n_real = len(records)
    n_qubits = max(1, math.ceil(math.log2(n_real)))
    if n_qubits > MAX_GROVER_QUBITS:
        raise ValueError(f"Amplitude amplification here supports up to {2 ** MAX_GROVER_QUBITS:,} records.")
    matcher, described = parse_query(query)

    cl = classical.sequential_scan(records, matcher)
    first = classical.linear_search(records, matcher)
    marked = cl["matches"]
    M = len(marked)
    q = run_grover(n_qubits, marked, shots=shots, seed=seed)
    N = 2 ** n_qubits
    k = q["iterations"]

    retrieved = {}
    for h in q["histogram"]:
        if h["marked"] and h["index"] < n_real:
            retrieved[h["index"]] = retrieved.get(h["index"], 0) + h["count"]
    retrieved_list = [{"index": i, "record": records[i], "count": c}
                      for i, c in sorted(retrieved.items(), key=lambda kv: -kv[1])]

    expected_first = (n_real + 1) / (M + 1) if M else n_real
    notes = [
        "One amplitude-amplification run returns ONE matching record with probability ≈ "
        f"{q['success_probability']:.1%}. Finding a match costs ≈ π/4·√(N/M) oracle queries versus "
        "≈ N/(M+1) reads for a classical scan that stops at the first hit.",
        "Retrieving all M matches needs repeated runs (≈ √(N·M) queries in total) — still fewer than the "
        "N reads of a full classical scan when M ≪ N.",
    ]
    if M == 0:
        notes.append("No record matches, so the oracle marks nothing and amplification has no effect.")
    elif M >= N / 2:
        notes.append("More than half of the records match — amplification is unnecessary (0 iterations); "
                     "a single random measurement already succeeds with probability ≥ 50%.")
    if n_real < N:
        notes.append(f"{n_real} records were padded to 2^{n_qubits} = {N} basis states.")

    return _clean({
        "algorithm": "database",
        "title": "Unstructured database query",
        "input": {"n_records": n_real, "search_space": N, "qubits": n_qubits, "query": query,
                  "query_meaning": described, "n_matches": M, "sample_records": records[:12]},
        "classical": {
            **cl, "matching_records": [{"index": i, "record": records[i]} for i in marked[:50]],
            "answer": {"matches": M, "first": records[marked[0]] if M else None},
            "first_match_reads": first["comparisons"],
            "steps": first["comparisons"] if M else n_real,
            "steps_label": "record reads (to first match)", "correct": True,
        },
        "quantum": {
            **q, "algorithm": "Amplitude Amplification", "complexity": "O(√(N/M))",
            "retrieved": retrieved_list[:64],
            "answer": {"matches_seen": len(retrieved_list),
                       "first": retrieved_list[0]["record"] if retrieved_list else None},
            "steps": k, "steps_label": "oracle queries", "correct": bool(retrieved_list) or M == 0,
            "time_ms": q["simulation_ms"],
        },
        "comparison": {
            "classical_steps": first["comparisons"] if M else n_real, "quantum_steps": k,
            "classical_expected": round(expected_first, 2),
            "full_scan_reads": n_real,
            "query_speedup_expected": _ratio(expected_first, max(k, 1)),
            "notes": notes,
        },
        "qiskit": grover_qiskit_code(n_qubits, marked, k),
    })


# ══════════════════════════════════════════════════════════════════════════════
# F — Factoring
# ══════════════════════════════════════════════════════════════════════════════

def compare_factoring(N: int, a: Optional[int] = None, shots: int = 1024,
                      seed: Optional[int] = None) -> Dict[str, Any]:
    N = int(N)
    if N < 3:
        raise ValueError("Enter an integer ≥ 3.")
    cl = classical.trial_division(N) if N < 10 ** 12 else classical.pollard_rho(N)
    cl_factors = cl["factors"]
    q = run_shor(N, a=a, shots=shots, seed=seed)
    success_attempt = next((att for att in q.get("attempts", []) if att.get("success") and "peaks" in att), None)
    last_attempt = q["attempts"][-1] if q.get("attempts") else None
    shown = success_attempt or last_attempt
    qiskit = shown["_circuit"].to_qiskit() if shown and "_circuit" in shown else None

    q_factors = q.get("factors")
    q_correct = bool(q_factors) and math.prod(q_factors) == N
    runs = sum(1 for att in q.get("attempts", []) if "peaks" in att)
    notes = [
        "Shor's speed-up is asymptotic: for tiny N trial division is instant. The cryptography chart shows why the "
        "algorithm matters — the chart shows that at RSA sizes the classical cost explodes while the quantum cost grows polynomially.",
        f"Exact simulation needs 3·n qubits (n = bit length); this kernel handles N ≤ {MAX_SHOR_N} (21 qubits).",
    ]
    if q["status"] in ("trivial", "prime", "prime_power"):
        notes.insert(0, q["message"])

    return _clean({
        "algorithm": "factoring",
        "title": "Integer factoring",
        "input": {"N": N, "bits": N.bit_length(), "qubits_needed": qubits_needed(N)},
        "classical": {
            **cl, "answer": {"factors": cl_factors},
            "steps": cl.get("divisions", cl.get("iterations")),
            "steps_label": "trial divisions" if "divisions" in cl else "iterations",
            "correct": math.prod(cl_factors) == N,
        },
        "quantum": {
            "algorithm": "Shor's Algorithm", "complexity": "O((log N)³)",
            "status": q["status"], "message": q.get("message"), "a": q.get("a"), "period": q.get("period"),
            "answer": {"factors": q_factors},
            "attempts": [
                {k: v for k, v in att.items() if k not in ("peaks", "measurements", "post_processing", "ops")}
                for att in q.get("attempts", [])
            ],
            "detail": shown,
            "steps": runs, "steps_label": "quantum order-finding runs",
            "correct": q_correct, "time_ms": q.get("simulation_ms", 0.0), "shots": shots,
        },
        "comparison": {
            "classical_steps": cl.get("divisions", cl.get("iterations")), "quantum_steps": runs,
            "crypto_table": crypto_resource_table(),
            "notes": notes,
        },
        "qiskit": qiskit,
    })


# ══════════════════════════════════════════════════════════════════════════════
# O — Optimisation (Travelling Salesman via QAOA)
# ══════════════════════════════════════════════════════════════════════════════

DEFAULT_CITIES = ["Islamabad", "Lahore", "Karachi", "Peshawar", "Quetta"]


def compare_optimization(cities: Optional[Sequence[str]] = None, p: int = 2, shots: int = 2048,
                         seed: Optional[int] = None, objective: str = "cvar",
                         warm_start: Optional[Dict[str, Sequence[float]]] = None) -> Dict[str, Any]:
    lines = [c for c in (cities or DEFAULT_CITIES[:4]) if str(c).strip()]
    if len(lines) < 3:
        raise ValueError("Enter at least 3 cities.")
    if len(lines) > MAX_TSP_CITIES:
        raise ValueError(f"QAOA on this simulator handles up to {MAX_TSP_CITIES} cities "
                         f"({(MAX_TSP_CITIES - 1) ** 2} qubits); {len(lines)} cities would need "
                         f"{(len(lines) - 1) ** 2} qubits.")
    geo = distance_matrix_from_cities(lines)
    d = geo["dist"]
    names = geo["names"]
    n = len(names)

    exact = classical.tsp_brute_force(d)
    greedy = classical.tsp_nearest_neighbour(d)
    bridge = tsp_bridge(d, names)
    t0 = time.perf_counter()
    q = run_qaoa(bridge, p=p, shots=shots, seed=seed, objective=objective,
                 feasible_mask=tsp_feasible_mask(n), init=warm_start)
    total_ms = (time.perf_counter() - t0) * 1000.0
    best = q["best_sampled"]
    q_len = best.get("length")
    q_correct = bool(best.get("feasible")) and q_len is not None and abs(q_len - exact["length"]) < 1e-6

    def named(tour):
        return [names[c] for c in tour] if tour else None

    notes = [
        f"Real distances: great-circle kilometres between the cities' latitude/longitude "
        f"({', '.join(f'{nm} ({src})' for nm, src in zip(names, geo['sources']))}).",
        f"QAOA made the optimal tour {q['amplification']:.1f}× more likely than random guessing "
        f"(P = {q['p_optimal']:.2%} vs {q['random_p_optimal']:.3%}).",
        "QAOA is a heuristic: its value is concentrating probability on good answers with shallow circuits. "
        "Exhaustive search is exact but grows as (N−1)! — hopeless beyond ~15 cities.",
    ]

    return _clean({
        "algorithm": "optimization",
        "title": "Travelling Salesman (route optimisation)",
        "input": {"cities": names, "coords": geo["coords"], "sources": geo["sources"],
                  "distance_km": np.round(d, 1).tolist(), "qubits": (n - 1) ** 2, "layers": p},
        "classical": {
            **exact, "tour_names": named(exact["tour"]),
            "greedy": {**greedy, "tour_names": named(greedy["tour"])},
            "answer": {"tour": named(exact["tour"]), "length_km": exact["length"]},
            "steps": exact["tours_evaluated"], "steps_label": "tours evaluated", "correct": True,
        },
        "quantum": {
            **q, "algorithm": "QAOA", "complexity": "O(p·N²) gates per circuit",
            "answer": {"tour": best.get("tour_names"), "length_km": q_len},
            "steps": q["circuit_evaluations"], "steps_label": "circuit evaluations",
            "correct": q_correct, "time_ms": round(total_ms, 3),
            "bridge": bridge.summary(),
        },
        "comparison": {
            "classical_steps": exact["tours_evaluated"], "quantum_steps": q["circuit_evaluations"],
            "greedy_length": greedy["length"], "optimal_length": exact["length"], "quantum_length": q_len,
            "greedy_gap_pct": round(100 * (greedy["length"] - exact["length"]) / exact["length"], 2),
            "notes": notes,
        },
        "qiskit": q["_circuit"].to_qiskit(),
    })


RUNNERS = {
    "search": compare_search,
    "factoring": compare_factoring,
    "optimization": compare_optimization,
    "database": compare_database,
}
