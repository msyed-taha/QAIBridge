"""
AI Advisor — checking a recommendation against today's quantum hardware.

The Random Forest picks which quantum algorithm fits a problem. This module then
asks what a careful engineer would: does that algorithm have a proven speed-up,
how many qubits would this problem need, can today's machines run it, and what
is the best classical method meanwhile? The answer has two parts: the best
approach today, and what a future, error-corrected quantum computer could offer.

The hardware figures are rounded on purpose; update them here as machines improve.
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional

TODAY_QUBITS = 1_000          # roughly the largest machines today, and their qubits are noisy
SIMULATOR_QUBITS = 28         # what QAIbridge's own simulator holds

# Does the algorithm have a proven speed-up, and does it need error-corrected qubits at a useful size?
QUANTUM_FACTS: Dict[str, Dict[str, Any]] = {
    "grovers":       {"proven": True,  "error_corrected": True,  "speedup": "Quadratic: about √N steps instead of N"},
    "amplitude_amp": {"proven": True,  "error_corrected": True,  "speedup": "Quadratic: about √N steps instead of N"},
    "shors":         {"proven": True,  "error_corrected": True,  "speedup": "Exponential over the best known classical method"},
    "qpe":           {"proven": True,  "error_corrected": True,  "speedup": "Exponential in the precision"},
    "qaoa":          {"proven": False, "error_corrected": False, "speedup": "None proven: QAOA is a heuristic"},
    "vqe":           {"proven": False, "error_corrected": False, "speedup": "None proven: VQE is a heuristic"},
}

ROUTING_WORDS = ("route", "routing", "tsp", "travelling", "traveling", "deliver", "van", "vehicle", "truck",
                 "stops", "cities", "city", "tour", "courier")


def is_routing(category: int, text: str) -> bool:
    return category in (2, 6) and any(w in text for w in ROUTING_WORDS)


def _vehicles(text: str) -> int:
    m = re.search(r"(\d+)\s*(?:vans?|trucks?|vehicles?|couriers?|drivers?)\b", text)
    return max(1, int(m.group(1))) if m else 1


def _bits(text: str, n: int) -> int:
    """The size of the number to factor, in bits."""
    m = re.search(r"(\d{2,5})[- ]?bits?\b", text)
    if m:
        return int(m.group(1))
    if "rsa" in text:
        return 2048
    return max(2, math.ceil(math.log2(max(n, 2))))


def qubits_needed(qid: str, category: int, n: int, text: str) -> Optional[int]:
    """A rough count of the qubits this problem would need with this algorithm (None: depends on details we don't have)."""
    if qid in ("grovers", "amplitude_amp"):
        return math.ceil(math.log2(max(n, 2))) + 1
    if qid == "shors":
        return 2 * _bits(text, n) + 3
    if qid == "qaoa":
        if is_routing(category, text):
            return (n - 1) ** 2                                    # a route: one qubit per (stop, position), start fixed
        return n if n <= 10_000 else None                          # one per item; a bigger number is likely money, not items
    if qid == "vqe":
        return n
    return None


def classical_options(qid: str, category: int, n: int, exact: bool, text: str) -> List[str]:
    """The classical methods to use today, best first."""
    if qid == "qaoa" or category in (2, 6):
        if is_routing(category, text):
            return ["dynamic_programming", "routing_heuristics"] if n <= 12 and exact else ["routing_heuristics", "optimisation_solver"]
        if "partition" in text or "cut" in text:
            return ["hillclimbing", "optimisation_solver"]
        return ["optimisation_solver", "hillclimbing"]
    if qid == "shors" or category in (1, 7):
        return ["number_field_sieve", "trial_division"] if _bits(text, n) > 64 else ["trial_division", "number_field_sieve"]
    if qid == "amplitude_amp" or category == 3:
        return ["index_lookup", "linear_search"]
    if qid == "grovers" or category == 0:
        return ["linear_search", "index_lookup"]
    if qid == "qpe":
        return ["eigensolver", "classical_simulation"]
    if qid == "vqe" or category == 4:
        return ["classical_chemistry", "classical_simulation"]
    return ["hillclimbing", "optimisation_solver"]


def _try_here(qid: str, category: int, text: str) -> Dict[str, str]:
    if is_routing(category, text):
        return {"label": "Try a small route with QAOA", "path": "/module2?type=optimization"}
    if qid == "qaoa":
        for example in ("portfolio", "knapsack", "partition", "maxcut"):
            if example in text or (example == "maxcut" and "cut" in text) or (example == "knapsack" and "budget" in text):
                return {"label": f"Try a small {'max-cut' if example == 'maxcut' else example} problem with QAOA",
                        "path": f"/module5?example={example}"}
        return {"label": "Try a small knapsack problem with QAOA", "path": "/module5?example=knapsack"}
    if qid == "shors":
        return {"label": "Factor a small number with Shor's algorithm", "path": "/module2?type=factoring"}
    if qid == "amplitude_amp":
        return {"label": "Try a small database query", "path": "/module2?type=database"}
    if qid == "grovers":
        return {"label": "Try Grover's search on a small list", "path": "/module2?type=search"}
    return {"label": "Explore small circuits in the Simulator", "path": "/simulator"}


def assess(qid: str, name: str, features: Dict[str, Any], text: str) -> Dict[str, Any]:
    """Best approach today, what future quantum computers could offer, and the limits, for this problem."""
    t = text.lower()
    category, n, exact = features["problem_category"], int(features["data_size"]), bool(features["needs_exact_answer"])
    facts = QUANTUM_FACTS[qid]
    q = qubits_needed(qid, category, n, t)
    classical = classical_options(qid, category, n, exact, t)
    routing = is_routing(category, t)
    steps = math.isqrt(n)

    # ── Today: quantum only with a proven speed-up that today's machines can actually run (nothing yet). ──
    blockers = []
    if not facts["proven"]:
        blockers.append(f"{name} has no proven speed-up over classical methods")
    if q is not None and q > TODAY_QUBITS:
        kind = "error-corrected qubits" if facts["error_corrected"] else "qubits"
        blockers.append(f"this problem needs about {q:,} {kind}, far more than today's machines have")
    elif facts["error_corrected"]:
        blockers.append(f"{name} needs error-corrected qubits to run at a useful size, and those don't exist yet")
    quantum_today = not blockers
    today = {
        "approach": "Quantum" if quantum_today else "Classical",
        "reason": "Quantum isn't ready for this yet: " + ", and ".join(blockers) + "." if blockers else
                  f"{name} has a proven speed-up and fits on today's machines.",
    }

    # ── Future: a large, error-corrected quantum computer. ──
    bits = _bits(t, n)
    big_enough = {"grovers": n >= 10 ** 6, "amplitude_amp": n >= 10 ** 6, "shors": bits >= 512, "qpe": True}.get(qid, False)
    if facts["proven"] and big_enough:
        future_reason = {
            "grovers": f"A large error-corrected quantum computer would need about {steps:,} search steps instead of up "
                       f"to {n:,}, as long as each item can be checked by a quantum circuit.",
            "amplitude_amp": f"A large error-corrected quantum computer would find matches in about {steps:,} steps "
                             f"instead of scanning all {n:,} records, as long as the records can be checked by a quantum circuit.",
            "shors": f"A large error-corrected quantum computer could factor a {bits}-bit number in a practical time, which "
                     "classical computers can't. This is why new, quantum-safe encryption is being adopted now.",
            "qpe": "With error-corrected qubits, phase estimation finds eigenvalues to high precision far faster than "
                   "classical methods for large quantum systems.",
        }[qid]
        future = {"approach": "Quantum", "reason": future_reason}
    elif facts["proven"]:
        future = {"approach": "Classical",
                  "reason": f"Even on a future quantum computer, at N = {n:,} the speed-up is too small to beat a simple classical method."}
    elif qid == "vqe":
        future = {"approach": "Classical",
                  "reason": "VQE has no proven speed-up. In the longer term, error-corrected computers using phase "
                            "estimation are expected to help with some hard molecules."}
    else:
        future = {"approach": "Classical",
                  "reason": f"{name} is still a research method: no speed-up over the best classical solvers has been "
                            "shown, so it is worth watching, not relying on."}

    # ── Limits on today's hardware, in plain words. ──
    limits: List[str] = []
    if q is not None:
        if qid == "qaoa" and routing:
            vehicles = _vehicles(t)
            extra = [f"{vehicles} vehicles"] if vehicles > 1 else []
            if "time window" in t:
                extra.append("the time windows")
            limits.append(f"{name} would need about {q:,} qubits for one vehicle: one per (stop, position) pair with "
                          f"the start fixed ({n - 1} × {n - 1})"
                          + (f", and more for {' and '.join(extra)}." if extra else "."))
        elif qid == "shors":
            limits.append(f"Shor's algorithm would need about {q:,} error-corrected qubits for a {bits}-bit number; "
                          "recent estimates put that at around a million of today's noisy qubits.")
        elif qid in ("grovers", "amplitude_amp"):
            limits.append(f"{name} needs only about {q} qubits to label {n:,} items, but about {steps:,} rounds of the "
                          "search step: far too long a circuit for today's machines.")
        else:
            limits.append(f"{name} would need about {q:,} qubits for this problem.")
    elif qid == "qaoa":
        limits.append("QAOA needs one qubit for every item you can choose, plus extra qubits to enforce the limits "
                      "(such as a budget).")
    limits.append(f"Today's quantum computers have roughly 100 to {TODAY_QUBITS:,} qubits, and errors build up after a short circuit.")
    limits.append({
        "grovers": "If your data is stored records, loading them into a quantum computer takes about N steps, which "
                   "cancels the gain for a one-off search.",
        "amplitude_amp": "If your data is stored records, loading them into a quantum computer takes about N steps, which "
                         "cancels the gain for a one-off query.",
        "shors": "The largest numbers factored with Shor's algorithm on real machines are tiny, such as 15 and 21.",
        "qpe": "Phase estimation needs long, precise circuits, which need error correction.",
        "qaoa": "Runs on real machines so far have only handled very small examples, and haven't beaten classical solvers.",
        "vqe": "So far VQE hasn't beaten classical chemistry methods for molecules that matter in practice.",
    }[qid])
    limits.append(f"QAIbridge's simulator holds up to {SIMULATOR_QUBITS} qubits, so you can try a small version here.")

    return {
        "today": today,
        "future": future,
        "classical": classical,
        "qubits_needed": q,
        "speedup": facts["speedup"],
        "proven": facts["proven"],
        "limits": limits,
        "try_here": _try_here(qid, category, t),
        "routing": routing,
    }
