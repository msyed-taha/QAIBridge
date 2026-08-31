"""
Module 6 - Neural Angle Optimizer
angle_net.py - AngleNet: a small PyTorch hypernetwork whose OUTPUT is the
circuit's trainable rotation-angle vector (theta = polar, phi = azimuthal).

Instead of gradient-descending the raw angles directly (Method A, the
classical baseline -- prone to the Barren Plateau at scale), we gradient-
descend AngleNet's own weights. Its output layer is deliberately initialised
near zero with a small tanh-bounded scale, so the circuit starts close to the
identity operation. This is the "small-angle / identity-block initialisation"
technique (Grant et al., 2019) -- a citable, working mitigation for barren
plateaus, not a hand-wave: an identity-like circuit has a non-trivial cost
landscape around it, so gradients don't vanish at the start of training the
way they do from a uniformly random starting point.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn


class AngleNet(nn.Module):
    def __init__(self, n_params: int, hidden: int = 16, angle_scale: float = math.pi):
        super().__init__()
        self.latent = nn.Parameter(torch.randn(hidden) * 0.1)
        self.net = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.Tanh(),
            nn.Linear(hidden, n_params),
        )
        # Small-angle initialisation: start the output layer near zero.
        nn.init.uniform_(self.net[-1].weight, -0.01, 0.01)
        nn.init.zeros_(self.net[-1].bias)
        self.angle_scale = angle_scale

    def forward(self) -> torch.Tensor:
        raw = self.net(self.latent)
        return self.angle_scale * torch.tanh(raw)
