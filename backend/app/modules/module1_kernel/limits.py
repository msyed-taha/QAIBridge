"""
Module 1 – Custom Simulation Kernel
limits.py  –  Server-wide limit on simultaneous heavy simulations.

Each state vector can take hundreds of megabytes, so letting every request
allocate one at the same time could exhaust RAM. Heavy endpoints wrap their
work in `simulation_slot()`: at most MAX_CONCURRENT_SIMULATIONS run together,
the rest wait briefly and then get a clear "busy" error instead of crashing
the server.
"""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager

MAX_CONCURRENT_SIMULATIONS = int(os.getenv("MAX_CONCURRENT_SIMULATIONS", "2"))
WAIT_SECONDS = float(os.getenv("SIMULATION_WAIT_SECONDS", "45"))

_slots = threading.BoundedSemaphore(MAX_CONCURRENT_SIMULATIONS)


@contextmanager
def simulation_slot():
    if not _slots.acquire(timeout=WAIT_SECONDS):
        raise MemoryError(
            "The simulator is busy with other heavy runs right now. Please try again in a few seconds."
        )
    try:
        yield
    finally:
        _slots.release()
