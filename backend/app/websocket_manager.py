"""
websocket_manager.py  –  Shared WebSocket connection manager

Handles broadcast of real-time progress updates from heavy backend
computations (simulation, RL training) to connected frontend clients.
"""

from __future__ import annotations

import asyncio
import json
from typing import Dict, List, Set

from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections and supports broadcasting."""

    def __init__(self):
        # Map channel_name → set of connected WebSocket objects
        self._channels: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str = "global") -> None:
        await websocket.accept()
        self._channels.setdefault(channel, set()).add(websocket)

    def disconnect(self, websocket: WebSocket, channel: str = "global") -> None:
        if channel in self._channels:
            self._channels[channel].discard(websocket)

    async def send_to(self, websocket: WebSocket, data: dict) -> None:
        """Send a JSON message to one specific client."""
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            pass  # client already disconnected

    async def broadcast(self, channel: str, data: dict) -> None:
        """Send a JSON message to all clients in a channel."""
        if channel not in self._channels:
            return
        dead: List[WebSocket] = []
        for ws in list(self._channels[channel]):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._channels[channel].discard(ws)

    async def broadcast_progress(
        self, channel: str, step: str, pct: int, detail: str = ""
    ) -> None:
        """Convenience helper for progress messages."""
        await self.broadcast(channel, {
            "type":    "progress",
            "step":    step,
            "percent": pct,
            "detail":  detail,
        })


# Singleton instance — imported by all routers
manager = ConnectionManager()
