"""
Neural Optimizer — the live barren plateau monitor.

A barren plateau is a training landscape so flat that the true gradient is
smaller than the error in measuring it (McClean et al., 2018). On a quantum
computer every gradient is estimated from a finite number of shots, so the
monitor asks the question that matters there: is there any signal left in
this step's gradient, or is it only measurement noise?

    noise power   = (number of angles) × (noise per angle)²     known from the shot statistics
    signal power  = |measured gradient|² − noise power           the part noise doesn't explain
    signal/noise  = signal power ÷ noise power

A device can work all of this out from its own measurements. One noisy step
proves nothing (Adam still makes progress by averaging steps), so the monitor
calls a plateau only when, over the last few steps, three things hold: the
signal stayed below the noise on average, the loss barely fell, and the loss is
still high. Then it restarts the angles near zero, once: a circuit close to the
identity, whose gradients don't vanish as it grows (Grant et al., 2019). A run
that has already learned (low loss) is never restarted, even though its
gradient is small too.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

WINDOW = 6              # over the last 6 steps:
SIGNAL_MIN = 1.0        #   the signal power stayed below the noise power on average,
PROGRESS_MIN = 0.05     #   the loss fell by less than this,
LOSS_LEARNED = 0.5      #   and it is still above this


@dataclass
class PlateauEvent:
    step: int
    signal_to_noise: float
    loss: float
    action: str


class PlateauMonitor:
    """Watches one training run. Call observe() once per step."""

    def __init__(self, window: int = WINDOW, signal_min: float = SIGNAL_MIN, progress_min: float = PROGRESS_MIN,
                 loss_learned: float = LOSS_LEARNED):
        self.window, self.signal_min, self.progress_min, self.loss_learned = window, signal_min, progress_min, loss_learned
        self.snr: List[Optional[float]] = []
        self.losses: List[float] = []
        self.events: List[PlateauEvent] = []
        self._quiet_until = 0

    @staticmethod
    def signal_to_noise(grad_norm_sq: float, n_angles: int, noise_std: float) -> Optional[float]:
        """None with exact gradients: there is no measurement noise to compare with."""
        noise_power = n_angles * noise_std ** 2
        if noise_power <= 0:
            return None
        return max(0.0, grad_norm_sq - noise_power) / noise_power

    def observe(self, step: int, grad_norm_sq: float, n_angles: int, noise_std: float, loss: float,
                action: str = "detected") -> Optional[PlateauEvent]:
        """`loss` is the training loss before this step. Returns an event when training is stuck."""
        snr = self.signal_to_noise(grad_norm_sq, n_angles, noise_std)
        self.snr.append(None if snr is None else round(snr, 4))
        self.losses.append(loss)
        if snr is None or step < self._quiet_until or len(self.losses) <= self.window:
            return None
        recent = [s for s in self.snr[-self.window:] if s is not None]
        progress = self.losses[-1 - self.window] - loss
        if sum(recent) / len(recent) >= self.signal_min or progress >= self.progress_min or loss <= self.loss_learned:
            return None
        self._quiet_until = step + self.window                 # give the run (or its restart) time before judging again
        event = PlateauEvent(step, round(sum(recent) / len(recent), 4), round(loss, 4), action)
        self.events.append(event)
        return event

    def summary(self) -> Dict:
        return {
            "signal_to_noise": self.snr,
            "events": [e.__dict__ for e in self.events],
        }
