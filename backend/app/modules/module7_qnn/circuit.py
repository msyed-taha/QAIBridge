"""
Neural Network Converter — both networks, simulated side by side in PyTorch.

The quantum network. Each classical Dense layer of u units becomes a block on
qubits q0…q(u−1), one qubit per neuron:

    on every qubit j:   RY(w_j · x + b_j)    neuron j's weights times the inputs, plus its bias
                        RZ(φ_j)              a trainable phase
    then the CNOTs q(u−1)→q(u−2), …, q1→q0, which pass each qubit's result down to q0

So the circuit has as many qubits as the widest layer, and a block has 4
trainable numbers per qubit (two weights, a bias and a phase). Every block reads
the inputs again ("data re-uploading", Pérez-Salinas et al., 2020): a classical
neuron is fed numbers, but a qubit can only be turned, so each block turns its
qubits by the inputs once more. At the end q0 is measured: its chance of 1 is
the network's chance of class 1.

Many networks (several seeds and learning rates) run as one batch: a state is
[networks, inputs, 2ⁿ]. PyTorch's autograd gives the exact gradient, the same
one the parameter-shift rule measures on hardware (tests check both, and the
circuit against the QAIbridge simulator).

The classical network is the one described, batched the same way, with
PyTorch's default starting weights.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Dict, List, Optional, Sequence

import torch

from .data import INPUT_SCALE, REAL

COMPLEX = torch.complex128
Params = List[Dict[str, torch.Tensor]]
DROPOUT_P = 0.2
ACTIVATIONS = {"relu": torch.relu, "tanh": torch.tanh, "sigmoid": torch.sigmoid}


# ── The quantum network ──────────────────────────────────────────────────────

def quantum_start(units: Sequence[int], networks: int, gen: torch.Generator) -> Params:
    """A fresh start: weights ~ N(0, 1), biases anywhere in [−π, π), phases ~ N(0, 1)."""
    return [{"w": torch.randn(networks, u, 2, generator=gen, dtype=REAL),
             "b": (torch.rand(networks, u, generator=gen, dtype=REAL) * 2 - 1) * math.pi,
             "phi": torch.randn(networks, u, generator=gen, dtype=REAL)} for u in units]


@lru_cache(maxsize=64)
def _chain(n: int, u: int) -> torch.Tensor:
    """The CNOTs q(u−1)→q(u−2), …, q1→q0 as one reordering of basis states: new = state[..., index]."""
    index = torch.arange(2 ** n)
    for c in range(u - 1, 0, -1):
        i = torch.arange(2 ** n)
        step = i ^ (((i >> (n - 1 - c)) & 1) << (n - c))         # flip q(c−1) where q(c) is 1 (q0 is the leftmost bit)
        index = index[step]
    return index


def _turn(state: torch.Tensor, gate: Sequence[torch.Tensor], q: int, n: int) -> torch.Tensor:
    """Apply a 2×2 gate (entries [M, B]) to qubit q of every state in the batch."""
    M, B, _ = state.shape
    s = state.view(M, B, 2 ** q, 2, 2 ** (n - q - 1))
    s0, s1 = s[:, :, :, 0], s[:, :, :, 1]
    g00, g01, g10, g11 = (g[:, :, None, None] for g in gate)
    return torch.stack([g00 * s0 + g01 * s1, g10 * s0 + g11 * s1], dim=3).reshape(M, B, -1)


def _rotation(theta: torch.Tensor, phi: torch.Tensor):
    """RZ(φ)·RY(θ) as its four entries."""
    c, s = torch.cos(theta / 2).to(COMPLEX), torch.sin(theta / 2).to(COMPLEX)
    e = torch.exp(-0.5j * phi.to(COMPLEX))
    return e * c, -e * s, e.conj() * s, e.conj() * c


def quantum_probability(params: Params, units: Sequence[int], x: torch.Tensor) -> torch.Tensor:
    """Chance of class 1 for every network and input: [M, B]. x: [B, 2] in [−1, 1]."""
    n, M, B = max(units), params[0]["w"].shape[0], x.shape[0]
    xs = x.to(REAL) * INPUT_SCALE
    state: Optional[torch.Tensor] = None
    for block, u in zip(params, units):
        theta = torch.einsum("mud,bd->mbu", block["w"], xs) + block["b"][:, None, :]
        phi = block["phi"][:, None, :].expand(M, B, u)
        if state is None:
            # From |0…0⟩ the first block's turns give a product state: build it directly.
            state = torch.ones(M, B, 1, dtype=COMPLEX)
            for q in range(n):
                if q < u:
                    g00, _, g10, _ = _rotation(theta[..., q], phi[..., q])
                    v = torch.stack([g00, g10], dim=-1)
                else:
                    v = torch.tensor([1, 0], dtype=COMPLEX).expand(M, B, 2)
                state = (state[..., :, None] * v[..., None, :]).reshape(M, B, -1)
        else:
            for q in range(u):
                state = _turn(state, _rotation(theta[..., q], phi[..., q]), q, n)
        if u > 1:
            state = state[..., _chain(n, u)]
    return state.view(M, B, 2, -1)[:, :, 1].abs().pow(2).sum(-1)


def quantum_size(units: Sequence[int]) -> int:
    return 4 * sum(units)


# ── The classical network ────────────────────────────────────────────────────

def classical_start(layers: Sequence[Dict], networks: int, gen: torch.Generator) -> Params:
    """PyTorch's default start for every Linear layer: weights and biases uniform in ±1/√inputs."""
    params, inputs = [], 2
    for width in [l["units"] for l in layers if l["type"] == "dense"] + [1]:
        bound = 1 / math.sqrt(inputs)
        params.append({"W": (torch.rand(networks, width, inputs, generator=gen, dtype=REAL) * 2 - 1) * bound,
                       "b": (torch.rand(networks, width, generator=gen, dtype=REAL) * 2 - 1) * bound})
        inputs = width
    return params


def classical_probability(params: Params, layers: Sequence[Dict], x: torch.Tensor,
                          dropout: Optional[torch.Generator] = None) -> torch.Tensor:
    """Chance of class 1 for every network and input: [M, B]. Dropout only while training (pass a generator)."""
    M = params[0]["W"].shape[0]
    h = (x.to(REAL) * INPUT_SCALE).expand(M, *x.shape)
    i = 0
    for layer in layers:
        if layer["type"] == "dropout":
            if dropout is not None:
                keep = (torch.rand(h.shape, generator=dropout, dtype=REAL) > DROPOUT_P).to(REAL)
                h = h * keep / (1 - DROPOUT_P)
            continue
        h = ACTIVATIONS[layer["activation"]](torch.einsum("mbi,moi->mbo", h, params[i]["W"]) + params[i]["b"][:, None, :])
        i += 1
    out = params[i]
    return torch.sigmoid(torch.einsum("mbi,moi->mbo", h, out["W"]) + out["b"][:, None, :])[..., 0]


def classical_size(layers: Sequence[Dict]) -> int:
    sizes = [2] + [l["units"] for l in layers if l["type"] == "dense"] + [1]
    return sum(a * b + b for a, b in zip(sizes, sizes[1:]))
