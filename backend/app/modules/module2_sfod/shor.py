"""
Module 2 – SFOD Model Comparison Suite
shor.py  –  Shor's factoring algorithm, with the quantum order-finding
subroutine executed on the Module 1 kernel.

Registers:  t = 2n counting qubits (top) + n work qubits, n = bit length of N.

    1. |0…0⟩|0…01⟩                        work register starts at |1⟩
    2. H^⊗t on the counting register     uniform superposition over x
    3. controlled-U^{2^j}  for every j   U|y⟩ = |a·y mod N⟩  (modular multiplication)
       → Σ_x |x⟩ |a^x mod N⟩
    4. inverse QFT on the counting register
    5. measure y  ≈  s · 2^t / r          (peaks at multiples of 2^t / r)

Classical post-processing: continued fractions turn y / 2^t into s / r,
then  gcd(a^{r/2} ± 1, N)  gives the factors (when r is even and
a^{r/2} ≢ −1 mod N — otherwise another base a is tried).

The modular multipliers are exact permutation unitaries (as in Qiskit's
textbook implementation); everything else is ordinary gates.
"""

from __future__ import annotations

import math
import random
import time
from fractions import Fraction
from typing import Any, Dict, List, Optional

import numpy as np

from ..module1_kernel import QuantumCircuit, QuantumStateVector, check_memory
from .classical import is_probable_prime, perfect_power, gnfs_operations

MAX_SHOR_N = 127          # 7-bit N → 14 counting + 7 work = 21 qubits (32 MB)


def modmul_permutation(a: int, N: int, n_bits: int) -> List[int]:
    """U|y⟩ = |a·y mod N⟩ for y < N, identity on the unused states y ≥ N."""
    return [(a * y) % N if y < N else y for y in range(2 ** n_bits)]


def qubits_needed(N: int) -> Dict[str, int]:
    n = N.bit_length()
    return {"work": n, "counting": 2 * n, "total": 3 * n}


def build_order_finding_circuit(a: int, N: int) -> QuantumCircuit:
    n = N.bit_length()
    t = 2 * n
    counting = list(range(t))
    work = list(range(t, t + n))
    circ = QuantumCircuit(t + n, f"Shor order finding (a={a}, N={N})", max_gates=50_000)
    circ.x(work[-1])                          # work register = |1⟩
    for q in counting:
        circ.h(q)
    circ.barrier("superposition")
    for j, q in enumerate(counting):
        power = 2 ** (t - 1 - j)              # counting qubit 0 is the most significant bit
        a_pow = pow(a, power, N)
        circ.cperm([q], work, modmul_permutation(a_pow, N, n), label=f"U^{power} (×{a_pow} mod {N})")
    circ.barrier("modular exponentiation")
    circ.iqft(counting)
    circ.barrier("inverse QFT")
    return circ


def _order_from_measurement(y: int, t: int, a: int, N: int) -> Dict[str, Any]:
    """Continued-fraction step: y/2^t ≈ s/r → candidate period r (checked classically)."""
    phase = y / 2 ** t
    frac = Fraction(y, 2 ** t).limit_denominator(N)
    r = frac.denominator
    info: Dict[str, Any] = {
        "measured": y, "phase": round(phase, 8),
        "fraction": f"{frac.numerator}/{frac.denominator}", "candidate_r": r,
    }
    if y == 0:
        info.update({"period": None, "note": "y = 0 carries no information about r"})
        return info
    # s/r may be reduced (gcd(s, r) > 1) — try small multiples of r
    for mult in range(1, 8):
        rr = r * mult
        if rr < N and pow(a, rr, N) == 1:
            info["period"] = rr
            info["note"] = "a^r ≡ 1 (mod N) verified" + (f" (×{mult} of the denominator)" if mult > 1 else "")
            return info
    info.update({"period": None, "note": "denominator is not a period of a"})
    return info


def _factors_from_period(a: int, r: int, N: int) -> Optional[List[int]]:
    if r % 2:
        return None
    x = pow(a, r // 2, N)
    if x == N - 1:
        return None
    p, q = math.gcd(x - 1, N), math.gcd(x + 1, N)
    for f in (p, q):
        if 1 < f < N:
            return sorted([f, N // f])
    return None


def run_shor(N: int, a: Optional[int] = None, shots: int = 1024, max_attempts: int = 10,
             seed: Optional[int] = None, time_budget_s: float = 20.0) -> Dict[str, Any]:
    """Factor N with Shor's algorithm (quantum order finding on the kernel)."""
    if N < 3:
        raise ValueError("N must be at least 3.")
    base: Dict[str, Any] = {"N": N, "bits": N.bit_length(), "qubits_needed": qubits_needed(N)}

    # ── Classical pre-checks (Shor's algorithm assumes an odd composite, non-prime-power N) ──
    if N % 2 == 0:
        return {**base, "status": "trivial", "factors": [2, N // 2], "attempts": [],
                "message": f"{N} is even — the factor 2 is found classically; no quantum step is needed."}
    if is_probable_prime(N):
        return {**base, "status": "prime", "factors": [N], "attempts": [],
                "message": f"{N} is prime, so it has no non-trivial factors (Miller–Rabin test)."}
    pp = perfect_power(N)
    if pp:
        b, k = pp
        return {**base, "status": "prime_power", "factors": [b] * k, "attempts": [],
                "message": f"{N} = {b}^{k} is a perfect power — detected classically before Shor's quantum step."}
    if N > MAX_SHOR_N:
        q = qubits_needed(N)
        raise ValueError(
            f"N = {N} needs {q['total']} qubits for exact simulation; this laptop-scale kernel runs Shor's "
            f"algorithm for N ≤ {MAX_SHOR_N} (21 qubits). Try 15, 21, 33, 35, 51, 55, 77, 85, 91 or 119."
        )
    n_total = qubits_needed(N)["total"]
    mem = check_memory(n_total)
    if not mem.is_safe:
        raise MemoryError(mem.warning)

    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)
    candidates = [x for x in range(2, N - 1) if math.gcd(x, N) == 1]
    rng.shuffle(candidates)
    if a is not None:
        a = int(a)
        if not 1 < a < N:
            raise ValueError(f"Base a must satisfy 1 < a < N (got {a}).")
        candidates = [a] + [c for c in candidates if c != a]

    attempts: List[Dict[str, Any]] = []
    total_ms = 0.0
    started = time.perf_counter()
    for a_try in candidates[:max_attempts]:
        if attempts and time.perf_counter() - started > time_budget_s:
            break
        g = math.gcd(a_try, N)
        if g > 1:     # only reachable with a user-supplied base
            attempts.append({"a": a_try, "lucky_gcd": g, "success": True})
            return {**base, "status": "factored", "a": a_try, "factors": sorted([g, N // g]),
                    "attempts": attempts, "message": f"gcd({a_try}, {N}) = {g} — a lucky classical shortcut."}

        circ = build_order_finding_circuit(a_try, N)
        n = N.bit_length()
        t = 2 * n
        sv = QuantumStateVector(circ.n_qubits, check_ram=False)
        t0 = time.perf_counter()
        circ.execute(sv)
        sim_ms = (time.perf_counter() - t0) * 1000.0
        total_ms += sim_ms

        dist = sv.marginal_probabilities(list(range(t)))      # counting register only
        samples = np_rng.choice(len(dist), size=shots, p=dist / dist.sum())
        ys, counts = np.unique(samples, return_counts=True)
        order = np.argsort(-counts)
        measured = [(int(ys[i]), int(counts[i])) for i in order]
        true_r = next(r for r in range(1, N) if pow(a_try, r, N) == 1)   # for display/verification only

        tried, factors, period = [], None, None
        for y, c in measured[:12]:
            info = _order_from_measurement(y, t, a_try, N)
            info["count"] = c
            tried.append(info)
            if info.get("period"):
                period = info["period"]
                factors = _factors_from_period(a_try, period, N)
                if factors:
                    break

        idx = np.flatnonzero(dist > 5e-4)
        if idx.size > 600:                      # keep the strongest bins for the chart
            idx = np.sort(idx[np.argsort(-dist[idx])[:600]])
        peaks = [{"y": int(i), "probability": round(float(dist[i]), 6)} for i in idx]
        stats = circ.stats()
        attempt = {
            "a": a_try,
            "true_period": true_r,
            "found_period": period,
            "factors": factors,
            "success": bool(factors),
            "counting_qubits": t,
            "work_qubits": n,
            "qubits": circ.n_qubits,
            "gates": stats["gates"],
            "depth": stats["depth"],
            "ops": stats["ops"],
            "simulation_ms": round(sim_ms, 3),
            "peaks": peaks,
            "expected_peaks": [round(s * 2 ** t / true_r, 3) for s in range(true_r)][:16],
            "measurements": [{"y": y, "count": c} for y, c in measured[:24]],
            "post_processing": tried,
            "_circuit": circ,
        }
        attempts.append(attempt)
        if factors:
            return {**base, "status": "factored", "a": a_try, "period": period, "factors": factors,
                    "attempts": attempts, "simulation_ms": round(total_ms, 3), "shots": shots,
                    "message": (f"Order of {a_try} mod {N} is r = {period}; "
                                f"gcd({a_try}^{period // 2} ± 1, {N}) → {factors[0]} × {factors[1]}.")}

    return {**base, "status": "failed", "factors": None, "attempts": attempts,
            "simulation_ms": round(total_ms, 3), "shots": shots,
            "message": (f"No attempt produced a usable period in {len(attempts)} tries "
                        "(odd period or a^(r/2) ≡ −1 mod N). Shor's algorithm is probabilistic — run it again.")}


def crypto_resource_table() -> List[Dict[str, Any]]:
    """
    Why factoring matters (FE-2 'cryptographic implications'): resources for
    RSA-size N. Logical qubits follow Beauregard's 2n+3 construction; gate
    counts use the textbook O(n³) modular-exponentiation cost; the classical
    column is the heuristic General Number Field Sieve cost.
    """
    rows = []
    for bits in (64, 128, 256, 512, 1024, 2048):
        rows.append({
            "bits": bits,
            "logical_qubits": 2 * bits + 3,
            "quantum_gates": float(4 * bits ** 3),
            "classical_gnfs_ops": gnfs_operations(bits),
            "simulable_here": 3 * bits <= 21,
        })
    return rows
