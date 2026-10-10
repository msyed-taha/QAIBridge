"""
Module 1 – Custom Simulation Kernel  (FastAPI Router)
Routes (all but /ram-table and /gates need a signed-in user):
  POST  /api/kernel/simulate          – Run a circuit and return results
  POST  /api/kernel/preset            – Run a pre-built circuit, checked against the textbook answer
  POST  /api/kernel/export/qiskit     – Export a circuit as runnable Qiskit code
  GET   /api/kernel/memory            – RAM check for a given qubit count
  GET   /api/kernel/ram-table         – Full qubit → RAM table
  GET   /api/kernel/gates             – List of supported gates
  WS    /api/kernel/ws/{session_id}?token=…  – Same simulations with live per-gate progress;
                                         closing the socket (or {"action": "cancel"}) stops the run
"""

from __future__ import annotations

import asyncio
import contextlib
import math
import threading
from typing import Callable, List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from ..database import SessionLocal
from ..models.user import User
from ..modules.module1_kernel import (
    QuantumCircuit,
    CircuitLibrary,
    SimulationCancelled,
    check_memory,
    ram_table,
    SINGLE_QUBIT_GATES,
    TWO_QUBIT_GATES,
    THREE_QUBIT_GATES,
    MULTI_QUBIT_GATES,
    MAX_QUBITS,
)
from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module1_kernel.memory_manager import MAX_RAM_CAP_GB, SAFETY_MARGIN
from ..routers.auth import get_current_user, user_from_token


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
    preset:   str = Field(..., description="One of: bell, ghz, grover, qft, qft_pattern, ansatz")
    n_qubits: int = Field(default=2, ge=2, le=MAX_QUBITS)
    shots:    int = Field(default=1024, ge=1, le=10000)
    layers:   int = Field(default=2, ge=1, le=5)


PRESETS = ("bell", "ghz", "grover", "qft", "qft_pattern", "ansatz")
MAX_GROVER_PRESET_QUBITS = 16
PATTERN_PERIOD = 4          # the qft_pattern input repeats every 4 steps
CHECK_TOLERANCE = 1e-6      # how far a chance may sit from the textbook value


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
    if preset == "qft_pattern":
        return CircuitLibrary.qft_pattern(req.n_qubits, period=PATTERN_PERIOD)
    if preset == "ansatz":
        return CircuitLibrary.parametric_ansatz(req.n_qubits, layers=req.layers)
    raise HTTPException(status_code=400, detail=f"Unknown preset '{preset}'. Choose from: {', '.join(PRESETS)}")


def _grover_success(n: int) -> float:
    """Textbook chance of the marked item after the preset's floor(π/4·√N) rounds."""
    if n == 2:
        return 1.0
    theta = math.asin(1 / math.sqrt(2 ** n))
    rounds = max(1, int(math.floor(math.pi / 4 * math.sqrt(2 ** n))))
    return math.sin((2 * rounds + 1) * theta) ** 2


def _theory_check(preset: str, n: int, result: Dict) -> Optional[Dict]:
    """
    Compare the simulator's exact chances with what the maths says they must be,
    so every preset run proves itself. `kind` tells the page how to word it.
    """
    probs = result["probabilities"]
    ket = lambda i: f"|{i:0{n}b}>"

    def against(kind: str, expected: Dict[str, float]) -> Dict:
        measured = {s: probs.get(s, 0.0) for s in expected}
        error = max(abs(measured[s] - p) for s, p in expected.items())
        return {"kind": kind, "expected": expected, "measured": measured,
                "max_error": float(f"{error:.3g}"), "passed": error < CHECK_TOLERANCE}

    if preset == "bell":
        return against("outcomes", {ket(0): 0.5, ket(3 << (n - 2)): 0.5})
    if preset == "ghz":
        return against("outcomes", {ket(0): 0.5, ket(2 ** n - 1): 0.5})
    if preset == "grover":
        return against("marked", {ket(2 ** n - 1): _grover_success(n)})
    if preset == "qft_pattern":
        step = 2 ** n // PATTERN_PERIOD
        return against("outcomes", {ket(i * step): 1 / PATTERN_PERIOD for i in range(PATTERN_PERIOD)})
    if preset == "qft":
        error = max((abs(p - 2.0 ** -n) for p in probs.values()), default=1.0)
        return {"kind": "uniform", "expected": 2.0 ** -n, "max_error": float(f"{error:.3g}"),
                "passed": error < CHECK_TOLERANCE}
    if preset == "ansatz":
        total = result["summary"]["norm"]
        error = abs(total - 1)
        return {"kind": "norm", "total": total, "max_error": float(f"{error:.3g}"), "passed": error < CHECK_TOLERANCE}
    return None


def _with_check(req: PresetCircuitRequest) -> Callable[[Dict], Dict]:
    def finish(result: Dict) -> Dict:
        result["check"] = _theory_check(req.preset.lower(), result["n_qubits"], result)
        return result
    return finish


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
def simulate_circuit(req: SimulateRequest, _user: User = Depends(get_current_user)) -> Dict:
    """
    Execute a custom quantum circuit on the proprietary simulation kernel.

    Send an ordered list of gate operations; results include state-vector
    amplitudes, probability distribution, measurement counts, and metadata.
    """
    return {"status": "ok", "result": _run_or_http_error(lambda: _build_custom(req), req.shots)}


@router.post("/preset")
def run_preset_circuit(req: PresetCircuitRequest, _user: User = Depends(get_current_user)) -> Dict:
    """
    Run one of the pre-built circuits from the CircuitLibrary.
    Presets: bell, ghz, grover, qft, qft_pattern, ansatz. The result carries a
    `check` against the textbook answer.
    """
    result = _with_check(req)(_run_or_http_error(lambda: _build_preset(req), req.shots))
    return {"status": "ok", "preset": req.preset.lower(), "result": result}


@router.post("/export/qiskit")
def export_qiskit(req: SimulateRequest, _user: User = Depends(get_current_user)) -> Dict:
    """Return runnable Qiskit code for a custom circuit (to verify results on Qiskit Aer / IBM hardware)."""
    try:
        circuit = _build_custom(req)
    except (ValueError, IndexError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"code": circuit.to_qiskit(), "stats": circuit.stats()}


@router.get("/memory")
def memory_check(n_qubits: int, _user: User = Depends(get_current_user)) -> Dict:
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
        # exact sizes, and the most a run may use right now (cap or 85 % of free RAM)
        "required_bytes": report.required_bytes,
        "limit_bytes":    int(min(MAX_RAM_CAP_GB * 1e9, report.available_bytes * SAFETY_MARGIN)),
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
async def kernel_websocket(websocket: WebSocket, session_id: str, token: str = Query(default="")):
    """
    WebSocket endpoint for streaming simulation progress to the frontend.

    Client → server:  {"action": "simulate", "payload": SimulateRequest}
                      {"action": "preset",   "payload": PresetCircuitRequest}
                      {"action": "cancel"}   (or just close the socket) – stops a run
                      {"action": "ping"}
    Server → client:  {"type": "progress", "percent": 0-100, "step": "...", "detail": "..."}
                      {"type": "result", "result": SimulationResult}
                      {"type": "cancelled", "detail": "..."}
                      {"type": "error", "detail": "..."}
    """
    with SessionLocal() as db:
        user = user_from_token(token, db)
    await websocket.accept()
    if user is None:
        await _send(websocket, {"type": "error", "detail": "Please sign in again (your sign-in has ended)."})
        await websocket.close(code=4401)
        return
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action") if isinstance(data, dict) else None
            payload = data.get("payload") if isinstance(data, dict) else None
            payload = payload if isinstance(payload, dict) else {}

            if action == "simulate":
                def build():
                    req = SimulateRequest(**payload)
                    return _build_custom(req), req.shots, None
                still_here = await _ws_run(websocket, build)
            elif action == "preset":
                def build():
                    req = PresetCircuitRequest(**payload)
                    return _build_preset(req), req.shots, _with_check(req)
                still_here = await _ws_run(websocket, build)
            elif action == "ping":
                await _send(websocket, {"type": "pong"})
                continue
            elif action == "cancel":
                continue                     # nothing running
            else:
                await _send(websocket, {"type": "error", "detail": f"Unknown action: {action}"})
                continue
            if not still_here:
                return
    except WebSocketDisconnect:
        pass


async def _send(websocket: WebSocket, data: Dict) -> None:
    with contextlib.suppress(Exception):     # the page may already be gone
        await websocket.send_json(data)


async def _progress(websocket: WebSocket, step: str, pct: int, detail: str = "") -> None:
    await _send(websocket, {"type": "progress", "step": step, "percent": pct, "detail": detail})


def _error_text(e: Exception) -> str:
    if isinstance(e, ValidationError):
        first = e.errors()[0]
        return f"Invalid request: {'.'.join(str(x) for x in first['loc'])} – {first['msg']}"
    if isinstance(e, HTTPException):
        return str(e.detail)
    return str(e) or "Simulation failed."


async def _ws_run(websocket: WebSocket, build) -> bool:
    """
    Build and run a circuit in a worker thread, streaming real per-gate progress.
    While it runs, the socket is watched: a "cancel" message or the page closing
    stops the run between two gates, so an abandoned 28-qubit run frees its
    memory and its simulation slot at once. Returns False once the page is gone.
    """
    stop = threading.Event()
    gone = False

    async def watch() -> None:
        nonlocal gone
        try:
            while True:
                msg = await websocket.receive_json()
                if isinstance(msg, dict) and msg.get("action") == "cancel":
                    stop.set()
                    return
        except WebSocketDisconnect:
            gone = True
            stop.set()
        except Exception:
            return                           # a garbled message: keep running, stop watching

    watcher: Optional[asyncio.Task] = None
    try:
        circuit, shots, finish = build()
        mem = check_memory(circuit.n_qubits)
        if not mem.is_safe:
            await _send(websocket, {"type": "error", "detail": mem.warning})
            return True

        n_ops = circuit.gate_count()
        await _progress(websocket, "Allocating state vector", 3,
                        f"{circuit.n_qubits} qubits · 2^{circuit.n_qubits} amplitudes · {mem.required_gb * 1000:.1f} MB")

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def on_progress(done: int, total: int) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, (done, total))

        def work():
            with simulation_slot():
                return circuit.run(shots=shots, on_progress=on_progress, should_stop=stop.is_set)

        watcher = asyncio.create_task(watch())
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
                await _progress(websocket, "Applying gates", pct, f"gate {done} / {total}")

        result = (await task).to_dict()
        if finish is not None:
            result = finish(result)
        await _progress(websocket, "Measuring state", 95, f"{n_ops} gates applied")
        await _send(websocket, {"type": "result", "result": result})
        await _progress(websocket, "Complete", 100)

    except SimulationCancelled as e:
        if not gone:
            await _send(websocket, {"type": "cancelled", "detail": str(e)})
    except Exception as e:
        await _send(websocket, {"type": "error", "detail": _error_text(e)})
    finally:
        if watcher is not None and not watcher.done():
            watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await watcher
    return not gone
