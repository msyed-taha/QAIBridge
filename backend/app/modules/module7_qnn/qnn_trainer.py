"""
Module 7 - QNN Converter
qnn_trainer.py - Trains / runs the mapped QNN (from converter.py's spec)
using Module 6's AngleNet / parameter-shift machinery -- real cross-module
reuse, not duplicated code.

Three distinct things live here, matching the module's data flow:
  * run_qnn_forward   - Simulator only (no training): a forward pass through
                         the real quantum kernel for a given angle vector,
                         or an untrained small-angle default. This is the
                         "optionally run the generated QNN through the
                         simulator" step (spec §12 Step 9).
  * train_qnn         - Method B from Module 6 (AngleNet hypernetwork,
                         random/near-identity start) applied to the mapped
                         QNN spec.
  * train_qnn_warm_started - the classical-to-quantum parameter-mapping
                         pipeline from parameter_mapping.py actually used:
                         initialise raw angles from a *trained classical
                         MLP's weights* instead of random/near-identity,
                         then fine-tune with the same parameter-shift
                         gradient. Comparing this against train_qnn's
                         from-scratch curve is the concrete demonstration
                         of whether the weight mapping in §9 is useful,
                         rather than a formula nobody calls.
"""

from __future__ import annotations

import random
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn

from ..module6_optimizer.angle_net import AngleNet
from ..module6_optimizer.quantum_layer import QuantumClassifierLoss, bce_loss, predict_proba
from .parameter_mapping import map_classical_weights_to_angles

BATCH_SIZE = 5
DEFAULT_SMALL_ANGLE_RANGE = 0.05  # untrained-simulation default: near-identity, not uniformly random


def run_qnn_forward(n_qubits: int, layers: int, X: List[List[float]],
                     angles: Optional[np.ndarray] = None) -> Tuple[List[float], np.ndarray]:
    """Forward-only pass through the real simulation kernel -- no optimisation."""
    if angles is None:
        n_params = n_qubits * layers * 2
        angles = np.random.uniform(-DEFAULT_SMALL_ANGLE_RANGE, DEFAULT_SMALL_ANGLE_RANGE, n_params)
    predictions = [predict_proba(n_qubits, layers, xi, angles) for xi in X]
    return predictions, angles


def train_qnn(n_qubits: int, layers: int, X: List[List[float]], y: List[int],
              iterations: int = 30, lr: float = 0.05) -> Tuple[List[float], float]:
    n_params = n_qubits * layers * 2
    net = AngleNet(n_params)
    optimizer = torch.optim.Adam(net.parameters(), lr=lr)

    curve: List[float] = []
    for _ in range(iterations):
        idx = random.sample(range(len(X)), min(BATCH_SIZE, len(X)))
        X_batch = [X[i] for i in idx]
        y_batch = [y[i] for i in idx]

        angles = net()
        loss = QuantumClassifierLoss.apply(angles, n_qubits, layers, X_batch, y_batch)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        with torch.no_grad():
            curve.append(bce_loss(n_qubits, layers, X, y, net().detach().numpy()))

    final_angles = net().detach().numpy()
    correct = sum(
        int((predict_proba(n_qubits, layers, xi, final_angles) > 0.5) == bool(yi))
        for xi, yi in zip(X, y)
    )
    acc = correct / len(X)
    return curve, acc


def train_qnn_warm_started(n_qubits: int, layers: int, X: List[List[float]], y: List[int],
                            classical_model: nn.Sequential,
                            iterations: int = 30, lr: float = 0.05) -> Tuple[List[float], float]:
    """
    Classical-to-quantum parameter mapping in use: start from
    map_classical_weights_to_angles(classical_model, ...) instead of random
    or near-identity, then fine-tune with the same exact parameter-shift
    gradient used everywhere else in the module.
    """
    init_angles = map_classical_weights_to_angles(classical_model, n_qubits, layers)
    angles = torch.tensor(init_angles, requires_grad=True)
    optimizer = torch.optim.Adam([angles], lr=lr)

    curve: List[float] = []
    for _ in range(iterations):
        idx = random.sample(range(len(X)), min(BATCH_SIZE, len(X)))
        X_batch = [X[i] for i in idx]
        y_batch = [y[i] for i in idx]

        loss = QuantumClassifierLoss.apply(angles, n_qubits, layers, X_batch, y_batch)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        curve.append(bce_loss(n_qubits, layers, X, y, angles.detach().numpy()))

    final_angles = angles.detach().numpy()
    correct = sum(
        int((predict_proba(n_qubits, layers, xi, final_angles) > 0.5) == bool(yi))
        for xi, yi in zip(X, y)
    )
    acc = correct / len(X)
    return curve, acc
