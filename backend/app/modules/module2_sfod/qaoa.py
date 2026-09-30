"""
Module 2 – SFOD Model Comparison Suite
qaoa.py  –  Quantum Approximate Optimization Algorithm on the Module 1 kernel.

Input: any problem already translated by the Module 5 Bridge into an Ising
Hamiltonian  H_C = Σ h_i Z_i + Σ J_ij Z_i Z_j + c.

    |γ,β⟩ = Π_{l=1..p}  e^{−iβ_l Σ X_i} · e^{−iγ_l H_C}  · H^⊗n |0⟩

    cost layer   e^{−iγ H_C}  = Π RZ(2γ h_i) · Π RZZ(2γ J_ij)     (diagonal)
    mixer layer  e^{−iβ Σ X}  = Π RX(2β)

A classical optimiser (COBYLA) tunes the 2p angles (γ, β) to minimise the
energy — or its CVaR, the mean of the best α-fraction of outcomes, which is
known to help constrained problems (Barkoutsos et al., 2020). Angles are
initialised by a p=1 grid search and grown layer by layer with the INTERP
heuristic (Zhou et al., 2020), or taken from a warm start (e.g. Module 6's
neural angle predictor).

For speed the cost layer is applied as one fused diagonal unitary — exactly
equal to its RZ/RZZ gate sequence (checked in the test-suite); the gate-level
circuit is still built for display, statistics and Qiskit export.
"""

from __future__ import annotations

import math
import time
from typing import Any, Callable, Dict, List, Optional, Sequence

import numpy as np
from scipy.optimize import minimize

from ..module1_kernel import QuantumCircuit, QuantumStateVector, check_memory
from ..module5_transformer.bridge import Bridge, Ising, _bit_matrix

MAX_QAOA_QUBITS = 16


def hamiltonian_scale(ising: Ising) -> float:
    """Largest |coefficient| — dividing by it keeps useful γ values in [0, π]."""
    coeffs = [abs(v) for v in ising.h] + [abs(v) for v in ising.J.values()]
    return max(coeffs) if coeffs and max(coeffs) > 0 else 1.0


def build_qaoa_circuit(ising: Ising, gammas: Sequence[float], betas: Sequence[float],
                       scale: Optional[float] = None) -> QuantumCircuit:
    """Gate-level QAOA circuit (what would run on hardware)."""
    s = scale or hamiltonian_scale(ising)
    n = ising.n
    circ = QuantumCircuit(n, f"QAOA p={len(gammas)} ({n} qubits)", max_gates=100_000)
    for q in range(n):
        circ.h(q)
    for layer, (g, b) in enumerate(zip(gammas, betas), start=1):
        for i in range(n):
            if ising.h[i]:
                circ.rz(2 * g * ising.h[i] / s, i)
        for (i, j), w in sorted(ising.J.items()):
            if w:
                circ.rzz(2 * g * w / s, i, j)
        for q in range(n):
            circ.rx(2 * b, q)
        circ.barrier(f"layer {layer}")
    return circ


class QAOAEvaluator:
    """Fast state preparation for the optimiser loop (fused diagonal cost layer)."""

    def __init__(self, ising: Ising):
        self.ising = ising
        self.n = ising.n
        self.energies = ising.energies()
        self.scale = hamiltonian_scale(ising)
        self.scaled = (self.energies - ising.offset) / self.scale
        self.order = np.argsort(self.energies, kind="stable")
        self.sorted_energies = self.energies[self.order]
        self.evaluations = 0

    def state(self, gammas: Sequence[float], betas: Sequence[float]) -> QuantumStateVector:
        sv = QuantumStateVector(self.n, check_ram=False)
        sv._state[:] = 1.0 / math.sqrt(sv.dim)
        for g, b in zip(gammas, betas):
            sv.apply_diagonal(np.exp(-1j * g * self.scaled))
            for q in range(self.n):
                sv.apply_gate("RX", [q], [2 * b])
        self.evaluations += 1
        return sv

    def expectation(self, probs: np.ndarray) -> float:
        return float(np.dot(probs, self.energies))

    def cvar(self, probs: np.ndarray, alpha: float) -> float:
        p = probs[self.order]
        cum = np.cumsum(p)
        k = int(np.searchsorted(cum, alpha))
        k = min(k, len(p) - 1)
        head = float(np.dot(p[:k], self.sorted_energies[:k]))
        rest = alpha - (cum[k - 1] if k else 0.0)
        return (head + rest * self.sorted_energies[k]) / alpha


def run_qaoa(bridge: Bridge, p: int = 2, shots: int = 2048, objective: str = "cvar",
             alpha: float = 0.25, seed: Optional[int] = None,
             init: Optional[Dict[str, Sequence[float]]] = None, maxiter: int = 150,
             feasible_mask: Optional[np.ndarray] = None) -> Dict[str, Any]:
    """Optimise QAOA angles for a bridged problem and report solution quality."""
    ising = bridge.ising
    n = ising.n
    if not 1 <= n <= MAX_QAOA_QUBITS:
        raise ValueError(f"QAOA is limited to {MAX_QAOA_QUBITS} qubits here (this problem needs {n}).")
    if not 1 <= p <= 5:
        raise ValueError("Use 1–5 QAOA layers.")
    mem = check_memory(n)
    if not mem.is_safe:
        raise MemoryError(mem.warning)

    ev = QAOAEvaluator(ising)
    alpha = min(max(alpha, 0.01), 1.0) if objective == "cvar" else 1.0
    trace: List[Dict[str, float]] = []
    best_seen = [math.inf]

    def f(params: np.ndarray, layers: int) -> float:
        g, b = params[:layers], params[layers:]
        probs = ev.state(g, b).probabilities()
        val = ev.cvar(probs, alpha) if objective == "cvar" else ev.expectation(probs)
        best_seen[0] = min(best_seen[0], val)
        trace.append({"evaluation": len(trace) + 1, "value": round(val, 6), "best": round(best_seen[0], 6),
                      "layers": layers})
        return val

    t0 = time.perf_counter()
    warm = init is not None
    if warm:
        gammas = list(init["gammas"])[:p]
        betas = list(init["betas"])[:p]
        while len(gammas) < p:
            gammas.append(gammas[-1])
            betas.append(betas[-1])
        res = minimize(f, np.array(gammas + betas), args=(p,), method="COBYLA",
                       options={"maxiter": maxiter, "rhobeg": 0.2})
        params = res.x
    else:
        # p = 1: coarse grid, then local refinement
        best = (math.inf, 0.0, 0.0)
        for g in np.linspace(0.05, math.pi, 14):
            for b in np.linspace(0.05, math.pi / 2, 8):
                val = f(np.array([g, b]), 1)
                if val < best[0]:
                    best = (val, g, b)
        res = minimize(f, np.array([best[1], best[2]]), args=(1,), method="COBYLA",
                       options={"maxiter": maxiter, "rhobeg": 0.2})
        params = res.x
        # grow to p layers with INTERP initialisation
        for layers in range(2, p + 1):
            g_prev, b_prev = list(params[:layers - 1]), list(params[layers - 1:])

            def interp(v: List[float]) -> List[float]:
                out = []
                for i in range(1, layers + 1):
                    left = v[i - 2] if i >= 2 else 0.0
                    right = v[i - 1] if i <= layers - 1 else 0.0
                    out.append(((i - 1) / (layers - 1)) * left + ((layers - i) / (layers - 1)) * right)
                return out

            x0 = np.array(interp(g_prev) + interp(b_prev))
            res = minimize(f, x0, args=(layers,), method="COBYLA",
                           options={"maxiter": maxiter, "rhobeg": 0.15})
            params = res.x
    opt_ms = (time.perf_counter() - t0) * 1000.0

    gammas, betas = list(map(float, params[:p])), list(map(float, params[p:]))
    sv = ev.state(gammas, betas)
    probs = sv.probabilities()

    e_min = float(ev.sorted_energies[0])
    opt_mask = ev.energies <= e_min + 1e-9
    p_opt = float(probs[opt_mask].sum())
    n_opt = int(opt_mask.sum())
    random_opt = n_opt / len(probs)
    p_feasible = float(probs[feasible_mask].sum()) if feasible_mask is not None else None
    random_feasible = float(feasible_mask.mean()) if feasible_mask is not None else None

    rng = np.random.default_rng(seed)
    if shots > 0:
        samples = sv.sample_indices(shots, rng)
        uniq, cnt = np.unique(samples, return_counts=True)
    else:                                   # no sampling requested: use the 24 most probable states
        uniq = np.sort(np.argsort(-probs)[:24])
        cnt = np.zeros(len(uniq), dtype=np.int64)
    bits_all = _bit_matrix(n)

    solutions: List[Dict[str, Any]] = []
    for i in np.argsort(-cnt)[:24]:
        k = int(uniq[i])
        dec = bridge.decode(bits_all[k])
        solutions.append({
            "bits": "".join(map(str, bits_all[k])), "count": int(cnt[i]),
            "probability": round(float(probs[k]), 6), "energy": round(float(ev.energies[k]), 6),
            "optimal": bool(opt_mask[k]), **{kk: v for kk, v in dec.items() if kk != "objective"},
            "objective": dec.get("objective"),
        })

    # best sampled solution = lowest energy among everything measured
    k_best = int(uniq[np.argmin(ev.energies[uniq])])
    best_dec = bridge.decode(bits_all[k_best])
    best = {"bits": "".join(map(str, bits_all[k_best])), "energy": round(float(ev.energies[k_best]), 6),
            "optimal": bool(opt_mask[k_best]), **best_dec}

    top_states = [{"bits": "".join(map(str, bits_all[i])), "probability": round(float(probs[i]), 6),
                   "energy": round(float(ev.energies[i]), 6), "optimal": bool(opt_mask[i])}
                  for i in np.argsort(-probs)[:16]]

    circ = build_qaoa_circuit(ising, gammas, betas, ev.scale)
    stats = circ.stats()
    if len(trace) > 400:
        step = len(trace) / 400
        trace = [trace[int(i * step)] for i in range(400)] + [trace[-1]]

    return {
        "qubits": n,
        "layers": p,
        "objective": objective,
        "alpha": alpha,
        "gammas": [round(g, 6) for g in gammas],
        "betas": [round(b, 6) for b in betas],
        "warm_start": warm,
        "expected_energy": round(ev.expectation(probs), 6),
        "min_energy": round(e_min, 6),
        "max_energy": round(float(ev.sorted_energies[-1]), 6),
        "p_optimal": round(p_opt, 6),
        "random_p_optimal": round(random_opt, 8),
        "amplification": round(p_opt / random_opt, 3) if random_opt else None,
        "p_feasible": round(p_feasible, 6) if p_feasible is not None else None,
        "random_p_feasible": round(random_feasible, 6) if random_feasible is not None else None,
        "shots": shots,
        "measured_optimal_rate": round(float(cnt[opt_mask[uniq]].sum()) / shots, 6) if shots else 0.0,
        "best_sampled": best,
        "solutions": solutions,
        "top_states": top_states,
        "trace": trace,
        "circuit_evaluations": ev.evaluations,
        "optimisation_ms": round(opt_ms, 3),
        "circuit": {"qubits": n, "gates": stats["gates"], "depth": stats["depth"], "ops": stats["ops"]},
        "_circuit": circ,
    }


def tsp_feasible_mask(n_cities: int) -> np.ndarray:
    """Vectorised one-hot check for the (n−1)² TSP encoding."""
    m = n_cities - 1
    bits = _bit_matrix(m * m).reshape(-1, m, m)          # [state, city, step]
    return np.all(bits.sum(axis=2) == 1, axis=1) & np.all(bits.sum(axis=1) == 1, axis=1)


def knapsack_feasible_mask(weights: Sequence[int], capacity: int, n_total: int) -> np.ndarray:
    bits = _bit_matrix(n_total)[:, :len(weights)].astype(np.int64)
    return bits @ np.asarray(weights, dtype=np.int64) <= capacity
