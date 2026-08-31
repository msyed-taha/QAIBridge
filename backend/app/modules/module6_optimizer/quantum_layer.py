"""
Module 6 - Neural Angle Optimizer
quantum_layer.py - Differentiable bridge between PyTorch and Module 1's numpy
quantum simulator (QuantumStateVector).

The circuit itself:
    RX(x_0), RX(x_1), ...                          -- angle-encode the input
    for each layer:
        RY(theta), RZ(phi)  on every qubit          -- trainable rotations
        CNOT chain                                  -- entanglement
    measure  <Z_0>                                  -- readout

Gradients w.r.t. the trainable angles are computed with the parameter-shift
rule -- the same technique real quantum hardware uses, not a numerical
approximation: for a Pauli rotation gate RY(theta)/RZ(theta), the expectation
value of any fixed observable is an exact sinusoid of theta, so

    d<Z>/dtheta = ( <Z>(theta + pi/2) - <Z>(theta - pi/2) ) / 2

is an EXACT derivative of the expectation value. Because our loss is a
nonlinear (BCE) function of that expectation, the chain rule is applied
explicitly in `QuantumClassifierLoss.backward` rather than shifting the loss
directly (which would not be exact).
"""

from __future__ import annotations

import math
from typing import List, Set

import numpy as np
import torch

from ..module1_kernel.gates import RX, RY, RZ
from ..module1_kernel.memory_manager import check_memory

SHIFT = math.pi / 2
EPS = 1e-7

# Training calls predict_z() tens of thousands of times per run (parameter-shift
# needs two circuit evaluations per angle per sample). QuantumStateVector's
# constructor re-runs a psutil.virtual_memory() safety check every single time
# it's instantiated, which dominates runtime at that call volume. We reuse its
# exact gate matrices (module1_kernel.gates) for bit-identical results, but do
# the memory-safety check once per distinct qubit count instead of once per call.
_memory_checked: Set[int] = set()


def _ensure_memory_ok(n_qubits: int) -> None:
    if n_qubits in _memory_checked:
        return
    report = check_memory(n_qubits)
    if not report.is_safe:
        raise MemoryError(report.warning)
    _memory_checked.add(n_qubits)


def _apply_single(state: np.ndarray, gate: np.ndarray, qubit: int, n_qubits: int) -> np.ndarray:
    tensor = state.reshape([2] * n_qubits)
    tensor = np.tensordot(gate, tensor, axes=([1], [qubit]))
    tensor = np.moveaxis(tensor, 0, qubit)
    return tensor.reshape(-1)


def _apply_cnot(state: np.ndarray, ctrl: int, tgt: int, n_qubits: int) -> np.ndarray:
    tensor = state.reshape([2] * n_qubits).copy()
    idx0, idx1 = [slice(None)] * n_qubits, [slice(None)] * n_qubits
    idx0[ctrl] = 1; idx0[tgt] = 0
    idx1[ctrl] = 1; idx1[tgt] = 1
    a = tensor[tuple(idx0)].copy()
    b = tensor[tuple(idx1)].copy()
    tensor[tuple(idx0)] = b
    tensor[tuple(idx1)] = a
    return tensor.reshape(-1)


# ── Forward pass (pure numpy, no autograd) ─────────────────────────────────

def predict_z(n_qubits: int, layers: int, x: List[float], angles: np.ndarray) -> float:
    """Run the variational circuit and return <Z_0>, the raw expectation value."""
    _ensure_memory_ok(n_qubits)

    state = np.zeros(2 ** n_qubits, dtype=complex)
    state[0] = 1.0

    for q in range(n_qubits):
        state = _apply_single(state, RX(float(x[q % len(x)])), q, n_qubits)

    idx = 0
    for _ in range(layers):
        for q in range(n_qubits):
            state = _apply_single(state, RY(float(angles[idx])), q, n_qubits); idx += 1
            state = _apply_single(state, RZ(float(angles[idx])), q, n_qubits); idx += 1
        for q in range(n_qubits - 1):
            state = _apply_cnot(state, q, q + 1, n_qubits)

    probs = np.abs(state) ** 2
    dim = len(probs)
    bit_indices = np.arange(dim)
    qubit0_is_one = (bit_indices >> (n_qubits - 1)) & 1  # qubit 0 = MSB (big-endian)
    prob_1 = float(probs[qubit0_is_one == 1].sum())
    return 1.0 - 2.0 * prob_1  # <Z_0> = P(0) - P(1)


def predict_proba(n_qubits: int, layers: int, x: List[float], angles: np.ndarray) -> float:
    """Map <Z_0> in [-1, 1] to a class-1 probability in [0, 1]."""
    z = predict_z(n_qubits, layers, x, angles)
    return (z + 1.0) / 2.0


def bce_loss(n_qubits: int, layers: int, X: List[List[float]], y: List[int], angles: np.ndarray) -> float:
    total = 0.0
    for xi, yi in zip(X, y):
        p = min(max(predict_proba(n_qubits, layers, xi, angles), EPS), 1.0 - EPS)
        total += -(yi * math.log(p) + (1 - yi) * math.log(1.0 - p))
    return total / len(X)


def param_shift_grad_single(n_qubits: int, layers: int, x: List[float], angles: np.ndarray, param_index: int = 0) -> float:
    """Exact gradient of <Z_0> w.r.t. one angle -- used for the barren-plateau study."""
    plus, minus = angles.copy(), angles.copy()
    plus[param_index] += SHIFT
    minus[param_index] -= SHIFT
    return (predict_z(n_qubits, layers, x, plus) - predict_z(n_qubits, layers, x, minus)) / 2.0


# ── PyTorch bridge ──────────────────────────────────────────────────────────

class QuantumClassifierLoss(torch.autograd.Function):
    """
    forward:  mean BCE loss of the variational classifier over the dataset.
    backward: exact gradient via parameter-shift on <Z_0>, chain-ruled
              through the (nonlinear) BCE loss analytically.
    """

    @staticmethod
    def forward(ctx, angles: torch.Tensor, n_qubits: int, layers: int, X: List[List[float]], y: List[int]):
        angles_np = angles.detach().cpu().numpy()
        loss = bce_loss(n_qubits, layers, X, y, angles_np)
        ctx.save_for_backward(angles)
        ctx.n_qubits, ctx.layers, ctx.X, ctx.y = n_qubits, layers, X, y
        return torch.tensor(loss, dtype=angles.dtype)

    @staticmethod
    def backward(ctx, grad_output: torch.Tensor):
        (angles,) = ctx.saved_tensors
        angles_np = angles.detach().cpu().numpy()
        n_qubits, layers, X, y = ctx.n_qubits, ctx.layers, ctx.X, ctx.y
        n_params = len(angles_np)

        # Cache each sample's current prediction (unshifted) once.
        z_current = [predict_z(n_qubits, layers, xi, angles_np) for xi in X]

        grad = np.zeros(n_params, dtype=np.float64)
        for j in range(n_params):
            plus, minus = angles_np.copy(), angles_np.copy()
            plus[j] += SHIFT
            minus[j] -= SHIFT
            grad_j = 0.0
            for i, (xi, yi) in enumerate(zip(X, y)):
                z_plus = predict_z(n_qubits, layers, xi, plus)
                z_minus = predict_z(n_qubits, layers, xi, minus)
                dz_dtheta = (z_plus - z_minus) / 2.0  # exact, parameter-shift

                p_i = min(max((z_current[i] + 1.0) / 2.0, EPS), 1.0 - EPS)
                dL_dp = -(yi / p_i) + (1 - yi) / (1.0 - p_i)  # BCE derivative
                dL_dz = 0.5 * dL_dp                            # chain rule: dp/dz = 1/2
                grad_j += dL_dz * dz_dtheta
            grad[j] = grad_j / len(X)

        grad_t = torch.tensor(grad, dtype=angles.dtype) * grad_output
        return grad_t, None, None, None, None
