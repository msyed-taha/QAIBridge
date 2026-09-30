"""
Module 2 – SFOD Model Comparison Suite
grover.py  –  Grover's search and amplitude amplification, run on the
Module 1 kernel.

Circuit (n qubits, N = 2^n items, M marked items):

    H^⊗n  →  [ Oracle  →  Diffuser ] × k  →  measure

    Oracle   : O|x⟩ = (−1)^{f(x)}|x⟩      (phase flip of every marked item)
    Diffuser : H^⊗n · X^⊗n · MCZ · X^⊗n · H^⊗n   = 2|s⟩⟨s| − I
    k        : ⌊π / (4θ)⌋  with  sin θ = √(M/N)

After j iterations the success probability is sin²((2j+1)θ); the kernel's
measured value is reported next to this theoretical curve.
"""

from __future__ import annotations

import math
import time
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from ..module1_kernel import QuantumCircuit, QuantumStateVector, check_memory

MAX_GROVER_QUBITS = 16          # 65,536 items


def optimal_iterations(n_items: int, n_marked: int) -> int:
    if n_marked <= 0 or n_marked >= n_items:
        return 0
    theta = math.asin(math.sqrt(n_marked / n_items))
    return max(0, int(math.floor(math.pi / (4 * theta))))


def build_grover_circuit(n_qubits: int, marked: Sequence[int], iterations: int) -> QuantumCircuit:
    circ = QuantumCircuit(n_qubits, f"Grover search ({n_qubits} qubits)", max_gates=250_000)
    qs = list(range(n_qubits))
    for q in qs:
        circ.h(q)
    circ.barrier("iteration 0")
    for it in range(1, iterations + 1):
        circ.oracle(marked, label="Oracle")
        for q in qs:
            circ.h(q)
        for q in qs:
            circ.x(q)
        circ.mcz(qs)
        for q in qs:
            circ.x(q)
        for q in qs:
            circ.h(q)
        circ.barrier(f"iteration {it}")
    return circ


def run_grover(n_qubits: int, marked: Sequence[int], shots: int = 1024,
               iterations: Optional[int] = None, seed: Optional[int] = None) -> Dict[str, Any]:
    """
    Run Grover / amplitude amplification for the given marked basis states
    and return everything the UI needs (probabilities, per-iteration curve,
    measurement histogram, circuit statistics).
    """
    if not 1 <= n_qubits <= MAX_GROVER_QUBITS:
        raise ValueError(f"Grover's search is limited to 1–{MAX_GROVER_QUBITS} qubits here.")
    mem = check_memory(n_qubits)
    if not mem.is_safe:
        raise MemoryError(mem.warning)

    N = 2 ** n_qubits
    marked = sorted({int(m) for m in marked if 0 <= int(m) < N})
    M = len(marked)
    k = optimal_iterations(N, M) if iterations is None else max(0, int(iterations))
    theta = math.asin(math.sqrt(M / N)) if M else 0.0

    circ = build_grover_circuit(n_qubits, marked, k)
    sv = QuantumStateVector(n_qubits, check_ram=False)
    curve: List[Dict[str, float]] = []
    marked_arr = np.asarray(marked, dtype=np.int64)

    def on_barrier(label: str, state: QuantumStateVector) -> None:
        j = int(label.split()[-1])
        amps = state._state[marked_arr] if M else np.zeros(0)
        curve.append({
            "iteration": j,
            "success_probability": round(float(np.sum(np.abs(amps) ** 2)), 6),
            "theory": round(math.sin((2 * j + 1) * theta) ** 2, 6) if M else 0.0,
        })

    t0 = time.perf_counter()
    circ.execute(sv, on_barrier=on_barrier)
    sim_ms = (time.perf_counter() - t0) * 1000.0

    marked_set = set(marked)
    probs = sv.probabilities()
    success = float(probs[marked_arr].sum()) if M else 0.0
    rng = np.random.default_rng(seed)
    samples = sv.sample_indices(shots, rng)
    uniq, cnt = np.unique(samples, return_counts=True)
    order = np.argsort(-cnt)
    histogram = [{"index": int(uniq[i]), "count": int(cnt[i]), "marked": int(uniq[i]) in marked_set}
                 for i in order[:32]]
    hits = int(sum(c for u, c in zip(uniq, cnt) if int(u) in marked_set))
    top = [{"index": i, "probability": round(p, 6), "marked": i in marked_set}
           for i, p in sv.top_states(min(16, N))]

    stats = circ.stats()
    return {
        "n_qubits": n_qubits,
        "n_items": N,
        "marked": marked[:256],
        "n_marked": M,
        "iterations": k,
        "oracle_calls": k,
        "optimal_iterations": optimal_iterations(N, M),
        "theta_rad": round(theta, 8),
        "success_probability": round(success, 6),
        "theoretical_success": round(math.sin((2 * k + 1) * theta) ** 2, 6) if M else 0.0,
        "per_marked_probability": round(success / M, 6) if M else 0.0,
        "uniform_probability": round(1 / N, 8),
        "curve": curve,
        "top_states": top,
        "shots": shots,
        "histogram": histogram,
        "measured_hits": hits,
        "measured_success_rate": round(hits / shots, 6) if shots else 0.0,
        "most_frequent": histogram[0]["index"] if histogram else None,
        "circuit": {
            "qubits": n_qubits,
            "gates": stats["gates"],
            "depth": stats["depth"],
            "ops": stats["ops"],
            # gate-level cost of the black-box oracle: ≤ 2n X gates + one n-qubit MCZ per marked item
            "oracle_gate_estimate": M * (2 * n_qubits + 1),
        },
        "simulation_ms": round(sim_ms, 3),
        "memory_mb": round(mem.required_gb * 1000, 3),
        "_circuit": circ,   # removed before serialisation; used for Qiskit export
    }


def iterations_sweep(n_qubits: int, marked: Sequence[int], max_iterations: Optional[int] = None) -> List[Dict[str, float]]:
    """Success probability for 0…max iterations (shows the over-rotation past the optimum)."""
    N = 2 ** n_qubits
    marked = sorted(set(marked))
    k_opt = optimal_iterations(N, len(marked))
    kmax = max_iterations if max_iterations is not None else max(3, 2 * k_opt + 1)
    res = run_grover(n_qubits, marked, shots=0, iterations=kmax)
    return res["curve"]
