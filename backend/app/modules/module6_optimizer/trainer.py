"""
Module 6 - Neural Angle Optimizer
trainer.py - Orchestrates the head-to-head comparison (mirrors
module8_dashboard/benchmarker.py's style: one file that calls the other
pieces and returns a single report dataclass).

Method A (classical baseline): raw trainable angles, random init, plain SGD
    directly on the parameter-shift gradient. This is where gradients vanish
    at scale -- the Barren Plateau.
Method B (Neural Angle Optimizer): AngleNet's weights are trained with Adam;
    AngleNet's small-angle-initialised output IS the angle vector.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, asdict
from typing import Dict, List

import numpy as np
import torch

from .angle_net import AngleNet
from .barren_monitor import BarrenPlateauMonitor
from .dataset import get_toy_classification_dataset
from .quantum_layer import QuantumClassifierLoss, bce_loss, param_shift_grad_single, predict_proba

CONVERGENCE_THRESHOLD = 0.35
BATCH_SIZE = 5  # parameter-shift backward cost scales with sample count; mini-batch keeps runs responsive
SMALL_ANGLE_RANGE = 0.05  # reinitialisation mitigation restarts stuck angles in [-range, range]


@dataclass
class OptimizationReport:
    n_qubits: int
    layers: int
    iterations: int
    classical_loss_curve: List[float]
    neural_loss_curve: List[float]
    classical_accuracy: float
    neural_accuracy: float
    classical_iters_to_converge: int
    neural_iters_to_converge: int
    speedup_iterations: float
    barren_plateau: Dict = field(default_factory=dict)
    classical_grad_norm_curve: List[float] = field(default_factory=list)
    neural_grad_norm_curve: List[float] = field(default_factory=list)
    live_barren_plateau_monitor: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


def _accuracy(n_qubits: int, layers: int, X: List[List[float]], y: List[int], angles: np.ndarray) -> float:
    correct = 0
    for xi, yi in zip(X, y):
        p = predict_proba(n_qubits, layers, xi, angles)
        correct += int((p > 0.5) == bool(yi))
    return correct / len(X)


def _iters_to_converge(curve: List[float], threshold: float = CONVERGENCE_THRESHOLD) -> int:
    for i, v in enumerate(curve):
        if v < threshold:
            return i + 1
    return len(curve)


def _sample_batch(X: List[List[float]], y: List[int], batch_size: int):
    idx = random.sample(range(len(X)), min(batch_size, len(X)))
    return [X[i] for i in idx], [y[i] for i in idx]


def train_classical_baseline(n_qubits: int, layers: int, iterations: int,
                              X: List[List[float]], y: List[int], lr: float = 0.5):
    """
    Method A. Also runs a live BarrenPlateauMonitor against the real
    per-step gradient norm (read off the same backward pass the optimizer
    already needs -- no extra circuit evaluations). If the monitor detects
    a plateau (small AND flat gradient for `patience` consecutive steps),
    the stuck angles are reinitialised to a small-angle configuration in
    place -- "parameter reinitialisation", a standard recovery technique --
    and training continues from there.
    """
    n_params = n_qubits * layers * 2
    angles = torch.tensor(np.random.uniform(0, 2 * math.pi, n_params), requires_grad=True)
    optimizer = torch.optim.SGD([angles], lr=lr)
    monitor = BarrenPlateauMonitor()

    curve: List[float] = []
    grad_norm_curve: List[float] = []
    for it in range(iterations):
        X_batch, y_batch = _sample_batch(X, y, BATCH_SIZE)
        loss = QuantumClassifierLoss.apply(angles, n_qubits, layers, X_batch, y_batch)
        optimizer.zero_grad()
        loss.backward()

        grad_norm = float(angles.grad.norm().item())
        grad_norm_curve.append(grad_norm)
        event = monitor.observe(it, grad_norm)
        if event is not None:
            with torch.no_grad():
                angles.copy_(torch.tensor(np.random.uniform(-SMALL_ANGLE_RANGE, SMALL_ANGLE_RANGE, n_params)))
            optimizer = torch.optim.SGD([angles], lr=lr)  # fresh momentum buffer after the restart
        else:
            optimizer.step()

        # Report full-dataset loss each step (cheap: forward-only) so the curve isn't noisy mini-batch loss.
        curve.append(bce_loss(n_qubits, layers, X, y, angles.detach().numpy()))

    final_angles = angles.detach().numpy()
    acc = _accuracy(n_qubits, layers, X, y, final_angles)
    return curve, acc, grad_norm_curve, monitor.summary()


def train_neural_optimizer(n_qubits: int, layers: int, iterations: int,
                            X: List[List[float]], y: List[int], lr: float = 0.05):
    """
    Method B. The same live monitor is attached here too, tracking the
    gradient norm reaching AngleNet's *output* angles (via retain_grad, since
    they're no longer a leaf tensor) -- the apples-to-apples equivalent of
    what's tracked for the classical baseline. Because AngleNet already
    starts near-identity (small-angle init baked into its own weight init,
    see angle_net.py), this is expected to plateau far less often; the
    monitor is here to demonstrate that empirically, not because Method B
    needs the same rescue.
    """
    n_params = n_qubits * layers * 2
    net = AngleNet(n_params)
    optimizer = torch.optim.Adam(net.parameters(), lr=lr)
    monitor = BarrenPlateauMonitor()

    curve: List[float] = []
    grad_norm_curve: List[float] = []
    for it in range(iterations):
        X_batch, y_batch = _sample_batch(X, y, BATCH_SIZE)
        angles = net()
        angles.retain_grad()
        loss = QuantumClassifierLoss.apply(angles, n_qubits, layers, X_batch, y_batch)
        optimizer.zero_grad()
        loss.backward()

        grad_norm = float(angles.grad.norm().item())
        grad_norm_curve.append(grad_norm)
        monitor.observe(it, grad_norm)  # recorded for comparison; no reinit -- see docstring above

        optimizer.step()
        with torch.no_grad():
            curve.append(bce_loss(n_qubits, layers, X, y, net().detach().numpy()))

    final_angles = net().detach().numpy()
    acc = _accuracy(n_qubits, layers, X, y, final_angles)
    return curve, acc, grad_norm_curve, monitor.summary()


def measure_barren_plateau(qubit_range=range(2, 9), trials: int = 20, layers: int = 1) -> Dict:
    """
    For each qubit count, sample `trials` random parameter vectors under two
    initialisation strategies and measure the exact parameter-shift gradient
    of the first rotation angle. Reports the variance of that gradient across
    trials -- the standard way the Barren Plateau phenomenon is diagnosed
    (McClean et al., 2018): variance collapsing exponentially with qubit
    count for random init, staying materially higher for small-angle init.
    """
    qubits_axis: List[int] = []
    random_variance: List[float] = []
    small_variance: List[float] = []

    for n_qubits in qubit_range:
        n_params = n_qubits * layers * 2
        x = [0.5] * n_qubits

        random_grads = [
            param_shift_grad_single(n_qubits, layers, x, np.random.uniform(0, 2 * math.pi, n_params))
            for _ in range(trials)
        ]
        small_grads = [
            param_shift_grad_single(n_qubits, layers, x, np.random.uniform(-0.05, 0.05, n_params))
            for _ in range(trials)
        ]

        qubits_axis.append(n_qubits)
        random_variance.append(float(np.var(random_grads)))
        small_variance.append(float(np.var(small_grads)))

    return {
        "qubits": qubits_axis,
        "random_init_variance": random_variance,
        "small_angle_init_variance": small_variance,
    }


def run_full_report(n_qubits: int = 3, layers: int = 2, iterations: int = 30) -> OptimizationReport:
    X, y = get_toy_classification_dataset()

    classical_curve, classical_acc, classical_grad_curve, classical_monitor = \
        train_classical_baseline(n_qubits, layers, iterations, X, y)
    neural_curve, neural_acc, neural_grad_curve, neural_monitor = \
        train_neural_optimizer(n_qubits, layers, iterations, X, y)
    barren_plateau = measure_barren_plateau()

    classical_conv = _iters_to_converge(classical_curve)
    neural_conv = _iters_to_converge(neural_curve)

    return OptimizationReport(
        n_qubits=n_qubits,
        layers=layers,
        iterations=iterations,
        classical_loss_curve=classical_curve,
        neural_loss_curve=neural_curve,
        classical_accuracy=classical_acc,
        neural_accuracy=neural_acc,
        classical_iters_to_converge=classical_conv,
        neural_iters_to_converge=neural_conv,
        speedup_iterations=round(classical_conv / max(neural_conv, 1), 2),
        barren_plateau=barren_plateau,
        classical_grad_norm_curve=classical_grad_curve,
        neural_grad_norm_curve=neural_grad_curve,
        live_barren_plateau_monitor={
            "classical": classical_monitor,
            "neural": neural_monitor,
        },
    )
