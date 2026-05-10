"""
Module 1 – Custom Simulation Kernel  (FastAPI Router)
Routes:
  POST  /api/kernel/simulate          – Run a circuit and return results
  POST  /api/kernel/circuit/run       – Run a circuit from a dict payload
  GET   /api/kernel/memory            – RAM check for a given qubit count
  GET   /api/kernel/ram-table         – Full qubit → RAM table
  GET   /api/kernel/gates             – List of supported gates
  WS    /ws/kernel/{session_id}       – Real-time simulation progress
"""

from __future__ import annotations

import asyncio
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..modules.module1_kernel import (
    QuantumCircuit,
    CircuitLibrary,
    check_memory,
    ram_table,
    SINGLE_QUBIT_GATES,
    TWO_QUBIT_GATES,
)
from ..websocket_manager import manager


router = APIRouter(prefix="/api/kernel", tags=["Module 1 – Simulation Kernel"])


# ──────────────────────────────────────────────────────────────────────────────
# Request / Response Models
# ──────────────────────────────────────────────────────────────────────────────

class GateOperation(BaseModel):
    gate:   str
    qubits: List[int]
    params: List[float] = Field(default_factory=list)


class SimulateRequest(BaseModel):
    n_qubits:   int = Field(..., ge=1, le=28, description="Number of qubits (1–28, up to ~4.3 GB)")
    operations: List[GateOperation] = Field(default_factory=list)
    shots:      int = Field(default=1024, ge=1, le=10000)
    name:       str = Field(default="Custom Circuit")


class PresetCircuitRequest(BaseModel):
    preset:   str = Field(..., description="One of: bell, ghz, grover, qft, ansatz")
    n_qubits: int = Field(default=2, ge=2, le=28)
    shots:    int = Field(default=1024)
    layers:   int = Field(default=2, ge=1, le=5)


# ──────────────────────────────────────────────────────────────────────────────
# REST Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/simulate")
async def simulate_circuit(req: SimulateRequest) -> Dict:
    """
    Execute a custom quantum circuit on the proprietary simulation kernel.

    Send an ordered list of gate operations; results include state-vector
    amplitudes, probability distribution, measurement counts, and metadata.
    """
    mem = check_memory(req.n_qubits)
    if not mem.is_safe:
        raise HTTPException(status_code=400, detail=mem.warning)

    try:
        circuit = QuantumCircuit(n_qubits=req.n_qubits, name=req.name)
        for op in req.operations:
            circuit._add(op.gate, op.qubits, op.params)

        result = circuit.run(shots=req.shots)
        return {"status": "ok", "result": result.to_dict()}

    except MemoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {e}")


@router.post("/preset")
async def run_preset_circuit(req: PresetCircuitRequest) -> Dict:
    """
    Run one of the pre-built circuits from the CircuitLibrary.
    Presets: bell, ghz, grover, qft, ansatz
    """
    preset = req.preset.lower()
    try:
        if preset == "bell":
            circuit = CircuitLibrary.bell_state(max(req.n_qubits, 2))
        elif preset == "ghz":
            circuit = CircuitLibrary.ghz_state(req.n_qubits)
        elif preset == "grover":
            circuit = CircuitLibrary.grover_oracle_2qubit()
        elif preset == "qft":
            circuit = CircuitLibrary.qft_circuit(req.n_qubits)
        elif preset == "ansatz":
            circuit = CircuitLibrary.parametric_ansatz(req.n_qubits, layers=req.layers)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown preset '{preset}'. Choose from: bell, ghz, grover, qft, ansatz"
            )

        result = circuit.run(shots=req.shots)
        return {"status": "ok", "preset": preset, "result": result.to_dict()}

    except HTTPException:
        raise
    except MemoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory")
async def memory_check(n_qubits: int) -> Dict:
    """
    Check RAM availability for a given qubit count.
    Used by the frontend slider to show real-time memory estimates.
    """
    if not (1 <= n_qubits <= 28):
        raise HTTPException(status_code=400, detail="n_qubits must be between 1 and 28.")
    report = check_memory(n_qubits)
    return {
        "n_qubits":       report.n_qubits,
        "state_vector_size": report.state_vector_size,
        "required_gb":    round(report.required_gb, 4),
        "available_gb":   round(report.available_gb, 2),
        "total_ram_gb":   round(report.total_ram_gb, 2),
        "is_safe":        report.is_safe,
        "warning":        report.warning,
    }


@router.get("/ram-table")
async def get_ram_table() -> Dict:
    """Return the full qubit-count → RAM requirements table (qubits 1–20)."""
    return {"table": ram_table()}


@router.get("/gates")
async def list_gates() -> Dict:
    """List all supported quantum gates."""
    return {
        "single_qubit": list(SINGLE_QUBIT_GATES.keys()),
        "two_qubit":    list(TWO_QUBIT_GATES.keys()),
    }


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — real-time simulation progress
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def kernel_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming simulation progress to the frontend.
    The frontend connects once and listens for progress / result events.
    """
    channel = f"kernel_{session_id}"
    await manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "simulate":
                await _ws_simulate(websocket, channel, data)
            elif action == "ping":
                await manager.send_to(websocket, {"type": "pong"})
            else:
                await manager.send_to(websocket, {
                    "type": "error",
                    "detail": f"Unknown action: {action}"
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)


async def _ws_simulate(websocket: WebSocket, channel: str, data: dict):
    """Run a simulation over WebSocket and stream progress updates."""
    try:
        req = SimulateRequest(**data.get("payload", {}))
        mem = check_memory(req.n_qubits)

        if not mem.is_safe:
            await manager.send_to(websocket, {"type": "error", "detail": mem.warning})
            return

        await manager.broadcast_progress(channel, "Initializing state vector", 10)
        await asyncio.sleep(0)   # yield to event loop

        circuit = QuantumCircuit(n_qubits=req.n_qubits, name=req.name)
        for op in req.operations:
            circuit._add(op.gate, op.qubits, op.params)

        await manager.broadcast_progress(channel, "Applying gates", 40)
        await asyncio.sleep(0)

        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: circuit.run(shots=req.shots)
        )

        await manager.broadcast_progress(channel, "Measuring state", 80)
        await asyncio.sleep(0)

        await manager.send_to(websocket, {
            "type":   "result",
            "result": result.to_dict(),
        })

        await manager.broadcast_progress(channel, "Complete", 100)

    except Exception as e:
        await manager.send_to(websocket, {"type": "error", "detail": str(e)})
