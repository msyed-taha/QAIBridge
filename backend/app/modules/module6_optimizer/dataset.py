"""
Module 6 - Neural Angle Optimizer
dataset.py - Shared toy classification dataset (also used by Module 7's QNN
Converter, so the classical-vs-quantum comparison in both modules trains on
identical data).

A small, non-linearly-separable 2-feature binary classification problem
(XOR-like: same-corner points share a class, opposite corners are the other
class). This is the standard toy example for showing that entanglement lets
a quantum classifier represent a boundary a single qubit alone could not.
"""

from __future__ import annotations

import math
from typing import List, Tuple

FEATURE_DIM = 2

# Raw features in [0, 1]; label 0 = "near diagonal" cluster, label 1 = "off diagonal".
_RAW: List[Tuple[List[float], int]] = [
    ([0.20, 0.20], 0), ([0.30, 0.15], 0), ([0.15, 0.35], 0),
    ([0.80, 0.80], 0), ([0.75, 0.90], 0), ([0.90, 0.70], 0),
    ([0.20, 0.80], 1), ([0.15, 0.90], 1), ([0.30, 0.75], 1),
    ([0.80, 0.20], 1), ([0.90, 0.15], 1), ([0.70, 0.30], 1),
]


def get_toy_classification_dataset(scale: float = math.pi) -> Tuple[List[List[float]], List[int]]:
    """
    Return (X, y) with X features pre-scaled into [0, scale] so they can be
    fed directly into an RX angle-encoding gate.
    """
    X = [[x[0] * scale, x[1] * scale] for x, _ in _RAW]
    y = [label for _, label in _RAW]
    return X, y
