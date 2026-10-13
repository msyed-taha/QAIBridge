"""
Kept results for slow, repeatable work (training runs with fixed seeds give the
same numbers every time): the latest results are kept, and if the same work is
already running, a second request waits for it instead of repeating it.
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any, Callable, Dict, Hashable


class KeptResults:
    def __init__(self, size: int = 32):
        self.size = size
        self._kept: "OrderedDict[Hashable, Dict[str, Any]]" = OrderedDict()
        self._running: Dict[Hashable, threading.Event] = {}
        self._lock = threading.Lock()

    def get(self, key: Hashable, make: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
        """The kept result (with cached=True), or make it (cached=False)."""
        while True:
            with self._lock:
                if key in self._kept:
                    self._kept.move_to_end(key)
                    return {**self._kept[key], "cached": True}
                done = self._running.get(key)
                mine = done is None
                if mine:
                    done = self._running[key] = threading.Event()
            if not mine:
                done.wait(timeout=600)
                continue
            try:
                value = make()
                with self._lock:
                    self._kept[key] = value
                    while len(self._kept) > self.size:
                        self._kept.popitem(last=False)
                return {**value, "cached": False}
            finally:
                with self._lock:
                    self._running.pop(key, None)
                done.set()

    def clear(self) -> None:
        with self._lock:
            self._kept.clear()
