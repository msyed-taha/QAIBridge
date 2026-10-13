"""
Neural Network Converter — the datasets both networks learn.

Four two-feature, two-class problems, each 200 points: 140 to learn from and 60
kept back to test. Two features let the page draw what each network learned as
a map. Every point lies in [−1, 1]²; both networks see the features scaled to
[−π/2, π/2], so a classical weight and a quantum rotation weight mean the same
thing (see circuit.py).
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Dict, Tuple

import numpy as np
import torch

REAL = torch.float64
POINTS, TRAIN = 200, 140
INPUT_SCALE = math.pi / 2           # features in [−1, 1] become angles in [−π/2, π/2]

DATASETS: Dict[str, Dict[str, str]] = {
    "xor": {"label": "XOR", "about": "Opposite corners share a class, so no straight line can separate them."},
    "circles": {"label": "Circles", "about": "One class sits inside a ring of the other."},
    "moons": {"label": "Moons", "about": "Two interlocking half-moons."},
    "groups": {"label": "Two groups", "about": "Two overlapping clouds. A straight line does well, but never perfectly."},
}


@lru_cache(maxsize=8)
def dataset(name: str, seed: int = 0) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """(X_train, y_train, X_test, y_test): X is [N, 2] in [−1, 1], y is 0 or 1."""
    if name not in DATASETS:
        raise ValueError(f"Unknown dataset '{name}'.")
    g = np.random.default_rng(seed)
    n, k = POINTS, np.arange(POINTS) % 2
    if name == "xor":
        X = g.uniform(-1, 1, (n, 2))
        y = (X[:, 0] * X[:, 1] < 0).astype(float)
        X = X + g.normal(0, 0.1, X.shape)
    elif name == "circles":
        r = np.where(k == 0, 0.35, 0.85) + g.normal(0, 0.08, n)
        t = g.uniform(0, 2 * math.pi, n)
        X, y = np.c_[r * np.cos(t), r * np.sin(t)], k.astype(float)
    elif name == "moons":
        t = g.uniform(0, math.pi, n)
        X = np.where(k[:, None] == 0, np.c_[np.cos(t), np.sin(t)], np.c_[1 - np.cos(t), 0.5 - np.sin(t)])
        X = X + g.normal(0, 0.15, X.shape)
        X, y = X - X.mean(0), k.astype(float)
    else:
        X, y = np.where(k[:, None] == 0, -0.4, 0.4) + g.normal(0, 0.3, (n, 2)), k.astype(float)
    X = X / np.abs(X).max()
    order = g.permutation(n)
    X, y = torch.tensor(X[order], dtype=REAL), torch.tensor(y[order], dtype=REAL)
    return X[:TRAIN], y[:TRAIN], X[TRAIN:], y[TRAIN:]


def points(name: str) -> Dict[str, object]:
    """The dataset as the page draws it."""
    Xtr, ytr, Xte, yte = dataset(name)
    r = lambda t: [[round(float(a), 4), round(float(b), 4)] for a, b in t.tolist()]   # noqa: E731
    return {**DATASETS[name], "train": {"x": r(Xtr), "y": [int(v) for v in ytr]},
            "test": {"x": r(Xte), "y": [int(v) for v in yte]}}
