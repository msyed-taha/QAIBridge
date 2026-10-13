"""
Neural Optimizer — the quantum classifier circuit, simulated in PyTorch.

    RY(x) on every qubit           the two input features, repeated across the qubits
    L × [ RY(θ) then RZ(φ) on every qubit, then a CNOT chain q0 → q1 → … → q(n−1) ]
    measure Z on q0                ⟨Z⟩ > 0 means class 1

Many state vectors run as one batch (a whole dataset, or hundreds of random
starts), and PyTorch's autograd gives exact gradients: the same numbers the
parameter-shift rule gives on real hardware (a test checks it against the
QAIbridge simulator and against parameter shift).

A real quantum computer can't read a gradient exactly. Each one is estimated
from a finite number of measurements ("shots"), so it carries statistical
error. `gradient()` adds exactly that error, which is what makes a barren
plateau fatal: once the true gradient is smaller than the error, training is
steering by noise.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Dict, Optional, Tuple

import torch

REAL = torch.float64
COMPLEX = torch.complex128
SHIFT = math.pi / 2


def n_angles(n_qubits: int, layers: int) -> int:
    return 2 * n_qubits * layers


@lru_cache(maxsize=32)
def _chain_gather(n_qubits: int) -> torch.Tensor:
    """The CNOT chain only reorders basis states: new_state = state[index]."""
    dim = 2 ** n_qubits
    out = torch.empty(dim, dtype=torch.long)
    for b in range(dim):
        bits = [(b >> (n_qubits - 1 - q)) & 1 for q in range(n_qubits)]        # q0 is the leftmost bit
        for q in range(n_qubits - 1):
            bits[q + 1] ^= bits[q]
        out[sum(bit << (n_qubits - 1 - q) for q, bit in enumerate(bits))] = b
    return out


def encode(x: torch.Tensor, n_qubits: int) -> torch.Tensor:
    """RY(x) on every qubit, from |0…0⟩: a product state. x: [B, F] → [B, 2^n] (real amplitudes)."""
    state = torch.ones(x.shape[0], 1, dtype=REAL)
    for q in range(n_qubits):
        half = x[:, q % x.shape[1]].to(REAL) / 2
        v = torch.stack([torch.cos(half), torch.sin(half)], dim=1)
        state = (state[:, :, None] * v[:, None, :]).reshape(x.shape[0], -1)
    return state


def _rotation(theta: torch.Tensor, phi: torch.Tensor) -> torch.Tensor:
    """RZ(φ)·RY(θ) as 2×2 matrices; angles may carry a batch dimension."""
    c, s = torch.cos(theta / 2).to(COMPLEX), torch.sin(theta / 2).to(COMPLEX)
    e = torch.exp(-0.5j * phi.to(COMPLEX))
    top = torch.stack([e * c, -e * s], dim=-1)
    bottom = torch.stack([e.conj() * s, e.conj() * c], dim=-1)
    return torch.stack([top, bottom], dim=-2)


def expectation(x: torch.Tensor, angles: torch.Tensor, n_qubits: int, layers: int) -> torch.Tensor:
    """
    ⟨Z⟩ on q0 for every input. x: [B, F]. angles: [P] (one circuit for all inputs)
    or [B, P] (a circuit per input, e.g. many random starts). Returns [B].
    """
    B, dim = x.shape[0], 2 ** n_qubits
    state = encode(x, n_qubits).to(COMPLEX)
    gather = _chain_gather(n_qubits)
    batched = angles.dim() == 2
    a = angles.to(REAL)
    i = 0
    for _ in range(layers):
        for q in range(n_qubits):
            U = _rotation(a[..., i], a[..., i + 1])
            i += 2
            s = state.view(B, 2 ** q, 2, dim // 2 ** (q + 1))
            state = (torch.einsum('bij,bajc->baic', U, s) if batched else torch.einsum('ij,bajc->baic', U, s)).reshape(B, dim)
        state = state[:, gather]
    p = (state.abs() ** 2).view(B, 2, dim // 2).sum(dim=2)
    return p[:, 0] - p[:, 1]


# ── Data, loss and accuracy ──────────────────────────────────────────────────

@lru_cache(maxsize=4)
def classification_data(seed: int = 7) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Two features, two classes, in an XOR pattern (points near the same corners share
    a class), so no straight line separates them. 48 points: 32 to train on, 16 kept
    back to test. Features are scaled to [0, π] for the RY encoding.
    """
    g = torch.Generator().manual_seed(seed)
    centres = torch.tensor([[.25, .25], [.75, .75], [.25, .75], [.75, .25]], dtype=REAL)
    labels = torch.tensor([0., 0., 1., 1.], dtype=REAL)
    k = torch.arange(48) % 4
    X = (centres[k] + torch.randn(48, 2, generator=g, dtype=REAL) * 0.1).clamp(0, 1) * math.pi
    y = labels[k]
    order = torch.randperm(48, generator=g)
    X, y = X[order], y[order]
    return X[:32], y[:32], X[32:], y[32:]


def loss(z: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    """Mean squared distance from the target: +1 for class 1, −1 for class 0."""
    return ((z - (2 * y - 1)) ** 2).mean()


def accuracy(z: torch.Tensor, y: torch.Tensor) -> float:
    return float(((z > 0).to(REAL) == y).to(REAL).mean())


# ── Gradients, as a quantum computer would measure them ─────────────────────

def gradient(x: torch.Tensor, y: torch.Tensor, angles: torch.Tensor, n_qubits: int, layers: int,
             shots: int, gen: Optional[torch.Generator] = None) -> Tuple[torch.Tensor, float, float]:
    """
    The loss gradient for one batch, with the measurement error of `shots` shots per
    measured value (shots = 0: exact). Returns (gradient, noise_std, measured_loss).

    On hardware each ⟨Z⟩ is an average of ±1 outcomes, so its error has variance
    (1 − ⟨Z⟩²)/shots, and each parameter-shift derivative (⟨Z⟩₊ − ⟨Z⟩₋)/2 has about
    half that. The noise of the whole gradient follows from those, and a device can
    compute it from its own measurements, so the plateau monitor can use it too.
    """
    theta = angles.detach().to(REAL).requires_grad_(True)
    z = expectation(x, theta, n_qubits, layers)
    zd = z.detach()
    target = 2 * y - 1
    var = (1 - zd ** 2).clamp(min=0) / shots if shots else torch.zeros_like(zd)
    measured = zd + torch.randn(zd.shape, generator=gen, dtype=REAL) * var.sqrt() if shots else zd
    weight = 2 * (measured - target) / len(zd)                                # d(loss)/d⟨Z⟩ for each input
    (weight * z).sum().backward()
    g = theta.grad.detach()
    noise_std = float(((weight ** 2) * var / 2).sum().sqrt()) if shots else 0.0
    if shots:
        g = g + torch.randn(g.shape, generator=gen, dtype=REAL) * noise_std
    return g, noise_std, float(((measured - target) ** 2).mean())


def parameter_shift(x: torch.Tensor, y: torch.Tensor, angles: torch.Tensor, n_qubits: int, layers: int,
                    shots: int = 0, gen: Optional[torch.Generator] = None) -> torch.Tensor:
    """
    The gradient the way a quantum computer gets it: run the circuit with each angle
    shifted by ±π/2 and, with shots, sample every measurement. Slow (2 circuits per
    angle); used to check gradient() and its noise model.
    """
    B, P = x.shape[0], angles.numel()
    a = angles.detach().to(REAL)

    def measure(z: torch.Tensor) -> torch.Tensor:
        if not shots:
            return z
        k = torch.binomial(torch.full_like(z, float(shots)), ((1 + z) / 2).clamp(0, 1), generator=gen)
        return 2 * k / shots - 1

    with torch.no_grad():
        z = measure(expectation(x, a, n_qubits, layers))
        shifted = torch.cat([a + torch.eye(P, dtype=REAL) * SHIFT, a - torch.eye(P, dtype=REAL) * SHIFT])
        zz = measure(expectation(x.repeat(2 * P, 1), shifted.repeat_interleave(B, 0), n_qubits, layers)).view(2 * P, B)
        dz = (zz[:P] - zz[P:]) / 2
        return (dz * (2 * (z - (2 * y - 1)) / B)).sum(dim=1)


def describe() -> Dict[str, str]:
    return {
        "encoding": "RY(x) on every qubit (the two features repeated across the qubits)",
        "layer": "RY(θ) and RZ(φ) on every qubit, then a CNOT chain",
        "readout": "⟨Z⟩ on q0: positive means class 1",
        "loss": "mean squared distance from the target (+1 or −1)",
    }
