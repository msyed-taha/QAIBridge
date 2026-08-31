"""
Module 7 - QNN Converter
parameter_mapping.py - Classical-weight -> quantum-angle parameter mapping
(spec §9), distinct from *training* a QNN from scratch (qnn_trainer.py).

This gives the mapped QNN a principled, non-random starting point instead
of pure random init, by reading the trained classical MLP's actual weights
and turning them into rotation angles -- a real, explainable warm start,
not a training method in itself. (train_qnn / AngleNet in qnn_trainer.py
still does the actual optimisation from there.)

Why a normalisation step is required, not a direct copy:
Classical weights are unbounded reals (typically roughly N(0, 1)-ish after
Adam training, but with no hard limit), while a rotation gate's angle is
2*pi-periodic and only has one physically distinct value per revolution.
Copying a raw weight straight into RY(w)/RZ(w) has two problems:
  1. Aliasing -- a weight of 7.5 and a weight of 7.5 - 2*pi produce the
     *same* gate, so unrelated weight magnitudes collide.
  2. No control over where in the circuit's cost landscape training starts
     -- a large, effectively-random angle is exactly the "random init"
     regime the Barren Plateau mitigation in Module 6 exists to avoid.

The fix used here is the same one AngleNet already uses for its own
initialisation (see module6_optimizer/angle_net.py): squash with tanh
(bounded, monotonic, zero-centred) and scale by a fixed max angle. This
keeps every mapped angle inside (-angle_scale, angle_scale), collapses
outliers smoothly instead of wrapping them, and keeps small classical
weights mapped to small (near-identity) angles.

Dimensional mismatch: a classical Dense layer's width and the fixed qubit
count (one qubit per input feature, reused across every block -- see
converter.py) are generally different sizes, so there's no 1:1 weight
element to angle element mapping. Each qubit's angle is instead derived
from the *column* of the weight matrix associated with output neuron
`qubit_index % out_features` (a many-to-one reduction via averaging), which
is an approximation, not an exact structural correspondence -- consistent
with §4's requirement to distinguish approximate mappings from exact ones.
"""

from __future__ import annotations

import math
from typing import List

import numpy as np
import torch.nn as nn

ANGLE_SCALE = math.pi


def map_classical_weights_to_angles(model: nn.Sequential, n_qubits: int, n_layers: int) -> np.ndarray:
    """
    Derive an initial (theta, phi) angle vector for the mapped QNN from a
    trained classical MLP's Linear layers. Returns an array of length
    n_qubits * n_layers * 2, ordered to match quantum_layer.predict_z's
    expected layout: [theta_0, phi_0, theta_1, phi_1, ...] per layer.
    """
    linear_layers = [m for m in model if isinstance(m, nn.Linear)]
    if not linear_layers:
        raise ValueError("Classical model has no Linear layers to map weights from.")

    angles: List[float] = []
    for layer_idx in range(n_layers):
        # Reuse classical layers cyclically if there are fewer of them than
        # quantum blocks (e.g. a 1-hidden-layer MLP mapped to a 2-block QNN).
        linear = linear_layers[layer_idx % len(linear_layers)]
        weight = linear.weight.detach().cpu().numpy()  # shape [out_features, in_features]
        out_features = weight.shape[0]

        for q in range(n_qubits):
            column = weight[q % out_features, :]  # this output neuron's incoming weights
            characteristic_weight = float(np.mean(column))
            theta = ANGLE_SCALE * math.tanh(characteristic_weight)
            # phi derived from the weight's spread (variance) rather than its mean, so theta and
            # phi aren't simply duplicates of the same scalar.
            phi = ANGLE_SCALE * math.tanh(float(np.std(column)))
            angles.extend([theta, phi])

    return np.array(angles, dtype=np.float64)
