"""
Module 6 - Neural Angle Optimizer
barren_monitor.py - Live Barren Plateau Monitor.

`trainer.measure_barren_plateau()` is a separate, ex-post diagnostic: it
samples random qubit counts and parameter vectors *outside* of any actual
training run. This module is the complement -- it watches the real gradient
signal produced at each step of an actual optimization run (classical or
neural) and can trigger a mitigation while that run is still in progress.

Two signals are tracked, both tied directly to how the Barren Plateau
phenomenon is defined (McClean et al., 2018):

1. Gradient magnitude  -- ||dL/d(angles)||, read for free off the backward
   pass the optimizer step already requires (no extra circuit evaluations).
2. Gradient variance    -- variance of that magnitude over a sliding window.

Magnitude alone is a weak signal: a run that is simply near a good minimum
also has a small gradient. Requiring the *variance* to also be small
distinguishes "converged" (small, but still changing/noisy near the optimum)
from "stuck" (small AND flat, step after step) -- the actual signature of a
barren plateau.

If both signals stay under threshold for `patience` consecutive iterations,
a PlateauEvent is raised and the caller may apply a mitigation. The only
mitigation wired up here is parameter reinitialisation (restart the stuck
parameters at a small-angle configuration) -- a real, explainable recovery
technique, not five half-implemented ones. Layer-wise training, meta-learned
restarts, adaptive-LR schedules etc. are noted as future work rather than
bolted on half-finished.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

GRAD_NORM_EPS = 1e-3
GRAD_VAR_EPS = 1e-6
WINDOW = 5
PATIENCE = 4


@dataclass
class PlateauEvent:
    iteration: int
    grad_norm: float
    grad_window_variance: float
    mitigation: str


class BarrenPlateauMonitor:
    """Stateful, per-training-run monitor. Call `observe` once per iteration."""

    def __init__(self, window: int = WINDOW, patience: int = PATIENCE,
                 grad_norm_eps: float = GRAD_NORM_EPS, grad_var_eps: float = GRAD_VAR_EPS):
        self.window = window
        self.patience = patience
        self.grad_norm_eps = grad_norm_eps
        self.grad_var_eps = grad_var_eps
        self._history: List[float] = []
        self._below_threshold_streak = 0
        self.events: List[PlateauEvent] = []

    def observe(self, iteration: int, grad_norm: float) -> Optional[PlateauEvent]:
        self._history.append(grad_norm)
        window_vals = self._history[-self.window:]
        window_var = float(np.var(window_vals)) if len(window_vals) >= 2 else float("inf")

        is_flat = grad_norm < self.grad_norm_eps and window_var < self.grad_var_eps
        self._below_threshold_streak = self._below_threshold_streak + 1 if is_flat else 0

        if self._below_threshold_streak >= self.patience:
            event = PlateauEvent(
                iteration=iteration,
                grad_norm=grad_norm,
                grad_window_variance=window_var,
                mitigation="parameter_reinitialisation",
            )
            self.events.append(event)
            self._below_threshold_streak = 0  # don't re-fire every subsequent flat iteration
            return event
        return None

    def summary(self) -> Dict:
        return {
            "plateau_detected": len(self.events) > 0,
            "num_events": len(self.events),
            "events": [
                {
                    "iteration": e.iteration,
                    "grad_norm": e.grad_norm,
                    "grad_window_variance": e.grad_window_variance,
                    "mitigation": e.mitigation,
                }
                for e in self.events
            ],
        }
