"""
Module 7 - QNN Converter
classical_nn.py - Builds & trains a classical MLP (PyTorch) from a parsed
architecture (architecture.py) -- the "before" side of the conversion,
trained on identical data to the mapped QNN so the two are directly
comparable.
"""

from __future__ import annotations

from typing import List, Tuple

import torch
import torch.nn as nn

from .architecture import ParsedArchitecture, SUPPORTED_ACTIVATIONS

_ACTIVATION_MODULES = {"relu": nn.ReLU, "tanh": nn.Tanh, "sigmoid": nn.Sigmoid}
DROPOUT_P = 0.2


def _activation_module(name: str) -> nn.Module:
    if name not in _ACTIVATION_MODULES:
        # architecture.parse_architecture() already validates this; this
        # branch only guards direct callers and must never silently fall
        # back to a different activation than the one requested.
        raise ValueError(f"Unsupported activation '{name}'. Supported: {sorted(SUPPORTED_ACTIVATIONS)}.")
    return _ACTIVATION_MODULES[name]()


def build_mlp(parsed: ParsedArchitecture) -> nn.Sequential:
    layers: List[nn.Module] = []
    in_dim = parsed.input_dim
    for layer in parsed.layers:
        if layer.type == "dropout":
            layers.append(nn.Dropout(p=DROPOUT_P))
            continue
        layers.append(nn.Linear(in_dim, layer.units))
        layers.append(_activation_module(layer.activation))
        in_dim = layer.units
    layers.append(nn.Linear(in_dim, parsed.output_dim))
    layers.append(nn.Sigmoid())  # binary-classification readout, matches the QNN's Z-expectation readout
    return nn.Sequential(*layers)


def train_classical_mlp(parsed: ParsedArchitecture, X: List[List[float]], y: List[int],
                         iterations: int = 30, lr: float = 0.1) -> Tuple[List[float], float, nn.Sequential]:
    model = build_mlp(parsed)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.BCELoss()

    X_t = torch.tensor(X, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

    curve: List[float] = []
    model.train()
    for _ in range(iterations):
        pred = model(X_t)
        loss = loss_fn(pred, y_t)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        curve.append(float(loss.item()))

    model.eval()
    with torch.no_grad():
        pred = model(X_t)
        acc = float(((pred > 0.5).float() == y_t).float().mean().item())

    return curve, acc, model
