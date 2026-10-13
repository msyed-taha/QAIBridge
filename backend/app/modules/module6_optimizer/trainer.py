"""
Neural Optimizer — the barren plateau study, and a fair training race.

The study measures how big a circuit's gradients are as it grows. With angles
started at random, a circuit whose depth grows with its width (here 2 layers
per qubit) has gradients that shrink exponentially with the number of qubits:
a barren plateau (McClean et al., 2018). Started near zero, the same circuit is
close to the identity and its gradients keep their size (Grant et al., 2019).
A 1-layer circuit has no plateau at all, and the study shows that too.

The race trains the same quantum classifier four ways, on the same data, with
the same optimiser (Adam), the same number of steps, the same mini-batches and
the same measurement noise. Only the start, and how the angles are learned,
differ:

    random      raw angles started at random (0 to 2π): the usual default
    rescued     the same random start, watched by the plateau monitor, which
                restarts it near zero when it gets stuck
    near_zero   raw angles started near zero
    neural      the Neural Angle Optimizer: a small network whose output is the
                angles, starting near zero

The best learning rate depends on the circuit (a small circuit likes bigger
steps), so every race tries two learning rates for each method and keeps the
one that did better for it: 0.05 or 0.1 for raw angles, 0.01 or 0.02 for the
network. The rescued run uses exactly the random start's choice, so the only
difference between those two is the monitor. Every race is repeated over
several seeds, so the page shows the spread, not one lucky run.
"""
from __future__ import annotations

import math
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

import numpy as np
import torch

from . import vqc
from .angle_net import AngleNet
from .barren_monitor import PlateauMonitor

METHODS = {
    "random": "Random start",
    "rescued": "Random start + plateau monitor",
    "near_zero": "Near-zero start",
    "neural": "Neural Angle Optimizer",
}
LEARNING_RATES = {"random": (0.05, 0.1), "near_zero": (0.05, 0.1), "neural": (0.01, 0.02)}   # the rescued run uses random's
NEAR_ZERO = 0.05            # near-zero starts draw every angle from [−0.05, 0.05]
BATCH = 8                   # inputs per training step
STEPS = 40
SEEDS = 3
TARGET_LOSS = 0.5           # "learned": the loss on the training data is below this

# The page's presets, worked out in the background when the page is first opened, so they show at once.
PRESETS = [(3, 2), (8, 16), (10, 20)]
DEFAULT_SHOTS = 1000
WARM_UP = os.getenv("NEURAL_OPTIMIZER_WARM_UP", "1") == "1"

# Results are the same every time for the same settings (fixed seeds), so they are kept.
_cache: "OrderedDict[tuple, Dict[str, Any]]" = OrderedDict()
_running: Dict[tuple, threading.Event] = {}
_cache_lock = threading.Lock()
_warming = threading.Lock()


def _cached(key: tuple, make) -> Dict[str, Any]:
    """The kept result, or make it; if the same run is already being made, wait for it instead of repeating it."""
    while True:
        with _cache_lock:
            if key in _cache:
                _cache.move_to_end(key)
                return {**_cache[key], "cached": True}
            done = _running.get(key)
            mine = done is None
            if mine:
                done = _running[key] = threading.Event()
        if not mine:
            done.wait(timeout=600)
            continue
        try:
            value = make()
            with _cache_lock:
                _cache[key] = value
                while len(_cache) > 32:
                    _cache.popitem(last=False)
            return {**value, "cached": False}
        finally:
            with _cache_lock:
                _running.pop(key, None)
            done.set()


def warm_up() -> None:
    """Start working out the presets in the background (once per server)."""
    if not WARM_UP or not _warming.acquire(blocking=False):
        return

    def work() -> None:
        for n, layers in PRESETS:
            race(n, layers, DEFAULT_SHOTS)

    threading.Thread(target=work, name="neural-optimizer-warm-up", daemon=True).start()


# ── The barren plateau study ─────────────────────────────────────────────────

def _gradient_size(n_qubits: int, layers: int, start: str, draws: int, seed: int) -> float:
    """Root-mean-square of ∂⟨Z⟩/∂θ₁ over `draws` starts: how big a gradient typically is."""
    g = torch.Generator().manual_seed(seed + 97 * n_qubits + layers)
    P = vqc.n_angles(n_qubits, layers)
    if start == "random":
        angles = torch.rand(draws, P, generator=g, dtype=vqc.REAL) * 2 * math.pi
    else:
        angles = (torch.rand(draws, P, generator=g, dtype=vqc.REAL) * 2 - 1) * NEAR_ZERO
    angles.requires_grad_(True)
    x = torch.full((draws, 2), 0.5, dtype=vqc.REAL)
    vqc.expectation(x, angles, n_qubits, layers).sum().backward()
    return float(angles.grad[:, 0].pow(2).mean().sqrt())


def plateau_study(max_qubits: int = 10, draws: int = 200, seed: int = 0) -> Dict[str, Any]:
    def make() -> Dict[str, Any]:
        t0 = time.perf_counter()
        qubits = list(range(2, max_qubits + 1))
        lines = {
            "shallow_random": [_gradient_size(n, 1, "random", draws, seed) for n in qubits],
            "deep_random": [_gradient_size(n, 2 * n, "random", draws, seed) for n in qubits],
            "deep_near_zero": [_gradient_size(n, 2 * n, "near_zero", draws, seed) for n in qubits],
        }
        # Telling a gradient g from measurement noise takes about 1 / (2 g²) shots per measured value.
        shots = {k: [math.ceil(1 / (2 * v * v)) for v in vals] for k, vals in lines.items()}
        slope = float(np.polyfit(qubits, np.log(lines["deep_random"]), 1)[0])
        return {
            "qubits": qubits,
            "draws": draws,
            "lines": {k: [round(v, 5) for v in vals] for k, vals in lines.items()},
            "shots_needed": shots,
            "deep_random_factor_per_qubit": round(math.exp(slope), 3),
            "seconds": round(time.perf_counter() - t0, 2),
        }

    return _cached(("study", max_qubits, draws, seed), make)


# ── The race ──────────────────────────────────────────────────────────────────

def _near_zero(P: int) -> torch.Tensor:
    return (torch.rand(P, dtype=vqc.REAL) * 2 - 1) * NEAR_ZERO


def _train(method: str, n_qubits: int, layers: int, shots: int, steps: int, seed: int, lr: float) -> Dict[str, Any]:
    X, y, X_test, y_test = vqc.classification_data()
    P = vqc.n_angles(n_qubits, layers)
    torch.manual_seed(seed)
    if method == "neural":
        net = AngleNet(P)
        opt = torch.optim.Adam(net.parameters(), lr=lr)
        angles = lambda: net().to(vqc.REAL)                                      # noqa: E731
        raw = None
    else:
        start = torch.rand(P, dtype=vqc.REAL) * 2 * math.pi if method in ("random", "rescued") else _near_zero(P)
        raw = start.requires_grad_(True)
        opt = torch.optim.Adam([raw], lr=lr)
        angles = lambda: raw                                                    # noqa: E731

    batches = torch.Generator().manual_seed(10_000 + seed)                      # the same batches and noise for every method
    noise = torch.Generator().manual_seed(20_000 + seed)
    monitor = PlateauMonitor()
    curve: List[float] = []
    for step in range(steps):
        idx = torch.randperm(len(X), generator=batches)[:BATCH]
        theta = angles()
        with torch.no_grad():
            curve.append(float(vqc.loss(vqc.expectation(X, theta.detach(), n_qubits, layers), y)))
        g, noise_std, _ = vqc.gradient(X[idx], y[idx], theta, n_qubits, layers, shots, noise)
        rescue = method == "rescued" and not monitor.events                     # one restart per run
        event = monitor.observe(step, float(g.pow(2).sum()), P, noise_std, curve[-1],
                                action="restarted near zero" if rescue else "detected")
        if event is not None and rescue:
            with torch.no_grad():
                raw.copy_(_near_zero(P))
            opt = torch.optim.Adam([raw], lr=lr)
            continue
        opt.zero_grad()
        theta.backward(g.to(theta.dtype))
        opt.step()
    with torch.no_grad():
        theta = angles().detach()
        z_train = vqc.expectation(X, theta, n_qubits, layers)
        z_test = vqc.expectation(X_test, theta, n_qubits, layers)
    curve.append(float(vqc.loss(z_train, y)))
    reached = next((i for i, v in enumerate(curve) if v < TARGET_LOSS), None)
    return {
        "curve": [round(v, 4) for v in curve],
        "final_loss": round(curve[-1], 4),
        "train_accuracy": vqc.accuracy(z_train, y),
        "test_accuracy": vqc.accuracy(z_test, y_test),
        "steps_to_target": reached,
        "monitor": monitor.summary(),
    }


def _together(method: str, lr: float, runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    curves = np.array([r["curve"] for r in runs])
    finals = [r["final_loss"] for r in runs]
    return {
        "label": METHODS[method],
        "learning_rate": lr,
        "learning_rates_tried": list(LEARNING_RATES["random" if method == "rescued" else method]),
        "curve_mean": [round(float(v), 4) for v in curves.mean(axis=0)],
        "curve_min": [round(float(v), 4) for v in curves.min(axis=0)],
        "curve_max": [round(float(v), 4) for v in curves.max(axis=0)],
        "final_loss": {"mean": round(float(np.mean(finals)), 4), "min": min(finals), "max": max(finals)},
        "test_accuracy": round(float(np.mean([r["test_accuracy"] for r in runs])), 4),
        "train_accuracy": round(float(np.mean([r["train_accuracy"] for r in runs])), 4),
        "steps_to_target": [r["steps_to_target"] for r in runs],
        "reached_target": sum(r["steps_to_target"] is not None for r in runs),
        "events": [[e["step"] for e in r["monitor"]["events"]] for r in runs],
        "signal_to_noise": runs[0]["monitor"]["signal_to_noise"],
    }


def race(n_qubits: int, layers: int, shots: int, steps: int = STEPS, seeds: int = SEEDS) -> Dict[str, Any]:
    def runs(method: str, lr: float) -> List[Dict[str, Any]]:
        return [_train(method, n_qubits, layers, shots, steps, s, lr) for s in range(seeds)]

    def best_rate(method: str):
        tried = {lr: runs(method, lr) for lr in LEARNING_RATES[method]}
        lr = min(tried, key=lambda r: float(np.mean([run["final_loss"] for run in tried[r]])))
        return lr, tried[lr]

    def make() -> Dict[str, Any]:
        t0 = time.perf_counter()
        chosen = {m: best_rate(m) for m in ("random", "near_zero", "neural")}
        chosen["rescued"] = (chosen["random"][0], runs("rescued", chosen["random"][0]))
        methods = {m: _together(m, *chosen[m]) for m in METHODS}
        best = min(methods, key=lambda m: methods[m]["final_loss"]["mean"])
        return {
            "n_qubits": n_qubits, "layers": layers, "shots": shots, "steps": steps, "seeds": seeds,
            "angles": vqc.n_angles(n_qubits, layers), "batch": BATCH, "target_loss": TARGET_LOSS,
            "data": {"train": 32, "test": 16, "pattern": "XOR"},
            "circuit": vqc.describe(),
            "methods": methods,
            "best": best,
            "seconds": round(time.perf_counter() - t0, 2),
        }

    return _cached(("race", n_qubits, layers, shots, steps, seeds), make)
