"""
Module 1 – Custom Simulation Kernel  (FastAPI Router)
Routes:
  POST  /api/kernel/simulate          – Run a circuit and return results
  POST  /api/kernel/preset            – Run a pre-built circuit (bell, ghz, grover, qft, ansatz)
  POST  /api/kernel/export/qiskit     – Export a circuit as runnable Qiskit code
  GET   /api/kernel/memory            – RAM check for a given qubit count
  GET   /api/kernel/ram-table         – Full qubit → RAM table
  GET   /api/kernel/gates             – List of supported gates
  WS    /api/kernel/ws/{session_id}   – Same simulations with live per-gate progress
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
    THREE_QUBIT_GATES,
    MULTI_QUBIT_GATES,
    MAX_QUBITS,
)
from ..modules.module1_kernel.limits import simulation_slot
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
    n_qubits:   int = Field(..., ge=1, le=MAX_QUBITS, description=f"Number of qubits (1–{MAX_QUBITS}, up to ~4.3 GB)")
    operations: List[GateOperation] = Field(default_factory=list)
    shots:      int = Field(default=1024, ge=1, le=10000)
    name:       str = Field(default="Custom Circuit")


class PresetCircuitRequest(BaseModel):
    preset:   str = Field(..., description="One of: bell, ghz, grover, qft, ansatz")
    n_qubits: int = Field(default=2, ge=2, le=MAX_QUBITS)
    shots:    int = Field(default=1024, ge=1, le=10000)
    layers:   int = Field(default=2, ge=1, le=5)


PRESETS = ("bell", "ghz", "grover", "qft", "ansatz")
MAX_GROVER_PRESET_QUBITS = 16


def _build_custom(req: SimulateRequest) -> QuantumCircuit:
    circuit = QuantumCircuit(n_qubits=req.n_qubits, name=req.name)
    for op in req.operations:
        circuit._add(op.gate, op.qubits, op.params)
    return circuit


def _build_preset(req: PresetCircuitRequest) -> QuantumCircuit:
    preset = req.preset.lower()
    if preset == "bell":
        return CircuitLibrary.bell_state(max(req.n_qubits, 2))
    if preset == "ghz":
        return CircuitLibrary.ghz_state(req.n_qubits)
    if preset == "grover":
        if req.n_qubits == 2:
            return CircuitLibrary.grover_oracle_2qubit()
        if req.n_qubits > MAX_GROVER_PRESET_QUBITS:
            raise ValueError(f"The Grover preset supports up to {MAX_GROVER_PRESET_QUBITS} qubits.")
        return CircuitLibrary.grover(req.n_qubits, target=2 ** req.n_qubits - 1)
    if preset == "qft":
        return CircuitLibrary.qft_circuit(req.n_qubits)
    if preset == "ansatz":
        return CircuitLibrary.parametric_ansatz(req.n_qubits, layers=req.layers)
    raise HTTPException(status_code=400, detail=f"Unknown preset '{preset}'. Choose from: {', '.join(PRESETS)}")


def _run_or_http_error(circuit_factory, shots: int) -> Dict:
    try:
        circuit = circuit_factory()
        mem = check_memory(circuit.n_qubits)
        if not mem.is_safe:
            raise HTTPException(status_code=400, detail=mem.warning)
        with simulation_slot():
            return circuit.run(shots=shots).to_dict()
    except HTTPException:
        raise
    except MemoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (ValueError, IndexError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# REST Endpoints
# (plain `def` → FastAPI runs them in its thread pool, so a long simulation
#  never blocks other requests on the event loop)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/simulate")
def simulate_circuit(req: SimulateRequest) -> Dict:
    """
    Execute a custom quantum circuit on the proprietary simulation kernel.

    Send an ordered list of gate operations; results include state-vector
    amplitudes, probability distribution, measurement counts, and metadata.
    """
    return {"status": "ok", "result": _run_or_http_error(lambda: _build_custom(req), req.shots)}


@router.post("/preset")
def run_preset_circuit(req: PresetCircuitRequest) -> Dict:
    """
    Run one of the pre-built circuits from the CircuitLibrary.
    Presets: bell, ghz, grover, qft, ansatz
    """
    result = _run_or_http_error(lambda: _build_preset(req), req.shots)
    return {"status": "ok", "preset": req.preset.lower(), "result": result}


@router.post("/export/qiskit")
def export_qiskit(req: SimulateRequest) -> Dict:
    """Return runnable Qiskit code for a custom circuit (to verify results on Qiskit Aer / IBM hardware)."""
    try:
        circuit = _build_custom(req)
    except (ValueError, IndexError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"code": circuit.to_qiskit(), "stats": circuit.stats()}


@router.get("/memory")
def memory_check(n_qubits: int) -> Dict:
    """
    Check RAM availability for a given qubit count.
    Used by the frontend slider to show real-time memory estimates.
    """
    if not (1 <= n_qubits <= MAX_QUBITS):
        raise HTTPException(status_code=400, detail=f"n_qubits must be between 1 and {MAX_QUBITS}.")
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
def get_ram_table() -> Dict:
    """Return the full qubit-count → RAM requirements table (qubits 1–MAX_QUBITS)."""
    return {"table": ram_table()}


@router.get("/gates")
def list_gates() -> Dict:
    """List all supported quantum gates."""
    return {
        "single_qubit": list(SINGLE_QUBIT_GATES.keys()),
        "two_qubit":    list(TWO_QUBIT_GATES.keys()),
        "three_qubit":  list(THREE_QUBIT_GATES.keys()),
        "multi_qubit":  list(MULTI_QUBIT_GATES),
    }


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — real-time simulation progress
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def kernel_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for streaming simulation progress to the frontend.

    Client → server:  {"action": "simulate", "payload": SimulateRequest}
                      {"action": "preset",   "payload": PresetCircuitRequest}
                      {"action": "ping"}
    Server → client:  {"type": "progress", "percent": 0-100, "step": "...", "detail": "..."}
                      {"type": "result", "result": SimulationResult}
                      {"type": "error", "detail": "..."}
    """
    channel = f"kernel_{session_id}"
    await manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "simulate":
                await _ws_run(websocket, channel, lambda: _build_custom(SimulateRequest(**data.get("payload", {}))),
                              int(data.get("payload", {}).get("shots", 1024)))
            elif action == "preset":
                await _ws_run(websocket, channel, lambda: _build_preset(PresetCircuitRequest(**data.get("payload", {}))),
                              int(data.get("payload", {}).get("shots", 1024)))
            elif action == "ping":
                await manager.send_to(websocket, {"type": "pong"})
            else:
                await manager.send_to(websocket, {
                    "type": "error",
                    "detail": f"Unknown action: {action}"
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)


async def _ws_run(websocket: WebSocket, channel: str, circuit_factory, shots: int):
    """Build and run a circuit in a worker thread, streaming real per-gate progress."""
    try:
        circuit = circuit_factory()
        mem = check_memory(circuit.n_qubits)
        if not mem.is_safe:
            await manager.send_to(websocket, {"type": "error", "detail": mem.warning})
            return

        n_ops = circuit.gate_count()
        await manager.broadcast_progress(
            channel, "Allocating state vector", 3,
            f"{circuit.n_qubits} qubits · 2^{circuit.n_qubits} amplitudes · {mem.required_gb * 1000:.1f} MB",
        )

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def on_progress(done: int, total: int) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, (done, total))

        def work():
            with simulation_slot():
                return circuit.run(shots=max(1, min(shots, 10000)), on_progress=on_progress)

        task = loop.run_in_executor(None, work)
        last_pct = -1
        while not task.done():
            try:
                done, total = await asyncio.wait_for(queue.get(), timeout=0.25)
            except asyncio.TimeoutError:
                continue
            pct = 5 + int(85 * done / max(total, 1))
            if pct != last_pct:
                last_pct = pct
                await manager.broadcast_progress(channel, "Applying gates", pct, f"gate {done} / {total}")

        result = await task
        await manager.broadcast_progress(channel, "Measuring state", 95, f"{n_ops} gates applied")
        await manager.send_to(websocket, {"type": "result", "result": result.to_dict()})
        await manager.broadcast_progress(channel, "Complete", 100)

    except HTTPException as e:
        await manager.send_to(websocket, {"type": "error", "detail": e.detail})
    except Exception as e:
        await manager.send_to(websocket, {"type": "error", "detail": str(e)})
