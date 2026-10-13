"""
Neural Network Converter — the warm start: a trained classical network's
first-layer weights, carried into the quantum network.

The first Dense layer and the first block have the same shape: neuron j has two
weights and a bias, and qubit j is turned by RY(w_j · x + b_j). Copying them
as they are works badly: trained weights are large, so the angle sweeps through
several full turns and the qubit's chance of 1 goes up and down again, while
the neuron's activation (relu, tanh or sigmoid) only ever rises with its input.

So each neuron's input z = w·x + b is lined up with the qubit's half turn: over
the training inputs, z's lowest value becomes angle 0 (the qubit reads 0 for
sure) and its highest becomes π (it reads 1 for sure). The qubit's chance of 1
then rises with the neuron's input, as its activation does. The weights keep
their direction; only their scale and offset change. Each phase starts at 0.

The later layers can't be carried over: a classical layer is fed the layer
before it, while a block reads the inputs again, so their weights mean
different things. Those blocks start at 0, where their turns do nothing, and
training takes it from there. Whether this start helps is measured on the
page, not assumed.
"""
from __future__ import annotations

import math
from typing import Sequence

import torch

from .circuit import Params
from .data import INPUT_SCALE


def warm_start(classical: Params, units: Sequence[int], x: torch.Tensor) -> Params:
    """Quantum starting parameters from trained classical ones (batched over the same networks); x: the training inputs."""
    W, b = classical[0]["W"].detach(), classical[0]["b"].detach()
    networks, dtype = W.shape[0], W.dtype
    z = torch.einsum("mud,bd->mbu", W, x.to(dtype) * INPUT_SCALE) + b[:, None, :]
    low, span = z.min(1).values, (z.max(1).values - z.min(1).values).clamp(min=1e-6)
    params = [{"w": W * (math.pi / span)[..., None], "b": (b - low) * math.pi / span,
               "phi": torch.zeros(networks, units[0], dtype=dtype)}]
    for u in units[1:]:
        params.append({"w": torch.zeros(networks, u, 2, dtype=dtype), "b": torch.zeros(networks, u, dtype=dtype),
                       "phi": torch.zeros(networks, u, dtype=dtype)})
    return params
