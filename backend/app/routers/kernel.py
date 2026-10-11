"""
Module 1 – Custom Simulation Kernel  (FastAPI Router)
Routes (all but /ram-table and /gates need a signed-in user):
  POST  /api/kernel/simulate          – Run a circuit given as a list of gates
  GET   /api/kernel/examples/{id}     – An example circuit as OpenQASM text (2–28 qubits)
  POST  /api/kernel/qasm/inspect      – Read OpenQASM text: its size, or the line of the first problem
  POST  /api/kernel/qasm              – Run OpenQASM text (examples are checked against the maths)
  POST  /api/kernel/qasm/steps        – Replay a small circuit gate by gate (chances after every gate)
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
import threading
from typing import Callable, List, Optional, Dict

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError

from ..database import SessionLocal
from ..models.user import User
from ..modules.module1_kernel import (
    QuantumCircuit,
    QuantumStateVector,
    SimulationCancelled,
    check_memory,
    ram_table,
    SINGLE_QUBIT_GATES,
    TWO_QUBIT_GATES,
    THREE_QUBIT_GATES,
    MULTI_QUBIT_GATES,
    MAX_QUBITS,
)
from ..modules.module1_kernel.examples import EXAMPLES, MIN_QUBITS, PATTERN_PERIOD, example_qasm, match_example
from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module1_kernel.qasm import MAX_SOURCE_CHARS, QasmError, QasmProgram, parse_qasm
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


class QasmRequest(BaseModel):
    source: str = Field(..., max_length=MAX_SOURCE_CHARS + 1, description="The circuit, in OpenQASM 2 or 3")
    shots:  int = Field(default=1024, ge=1, le=10000)


class InspectRequest(BaseModel):
    source: str = Field(..., max_length=MAX_SOURCE_CHARS + 1)


CHECK_TOLERANCE = 1e-6      # how far a chance may sit from the textbook value
MAX_STEP_QUBITS = 8         # step by step sends every outcome's chance after every gate,
MAX_STEPS = 200             # so it is kept to small circuits


def _build_custom(req: SimulateRequest) -> QuantumCircuit:
    circuit = QuantumCircuit(n_qubits=req.n_qubits, name=req.name)
    for op in req.operations:
        circuit._add(op.gate, op.qubits, op.params)
    return circuit


def _theory_check(example: Optional[str], n: int, result: Dict) -> Dict:
    """
    Compare the simulator's exact chances with what the maths says they must be.
    The GHZ and pattern examples have a known answer; for anything else the check
    is that every chance still adds up to 100%. `kind` tells the page how to word it.
    """
    probs = result["probabilities"]
    ket = lambda i: f"|{i:0{n}b}>"

    def against(expected: Dict[str, float]) -> Dict:
        measured = {s: probs.get(s, 0.0) for s in expected}
        error = max(abs(measured[s] - p) for s, p in expected.items())
        return {"kind": "outcomes", "expected": expected, "measured": measured,
                "max_error": float(f"{error:.3g}"), "passed": error < CHECK_TOLERANCE}

    if example == "ghz":
        return against({ket(0): 0.5, ket(2 ** n - 1): 0.5})
    if example == "qft_pattern":
        step = 2 ** n // PATTERN_PERIOD
        return against({ket(i * step): 1 / PATTERN_PERIOD for i in range(PATTERN_PERIOD)})
    total = result["summary"]["norm"]
    error = abs(total - 1)
    return {"kind": "norm", "total": total, "max_error": float(f"{error:.3g}"), "passed": error < CHECK_TOLERANCE}


def _qasm_finish(program: QasmProgram) -> Callable[[Dict], Dict]:
    """Add what the page needs to a run's result: qubit names, the example it is, and the check."""
    example = match_example(program)

    def finish(result: Dict) -> Dict:
        result["labels"] = program.labels
        result["example"] = example
        result["check"] = _theory_check(example, result["n_qubits"], result)
        return result
    return finish


def _size_text(n_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n_bytes < 1024 or unit == "GB":
            return f"{n_bytes:.0f} {unit}" if n_bytes >= 10 or unit == "B" else f"{n_bytes:.1f} {unit}"
        n_bytes /= 1024
    return ""


def _short_of_memory(n: int) -> str:
    return (f"{n} qubits need {_size_text(2 ** n * 16)} of memory, more than the simulator can spare right now. "
            "Try fewer qubits, or try again in a minute.")


def _run_or_http_error(circuit_factory, shots: int) -> Dict:
    try:
        circuit = circuit_factory()
        mem = check_memory(circuit.n_qubits)
        if not mem.is_safe:
            raise HTTPException(status_code=400, detail=_short_of_memory(circuit.n_qubits))
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


@router.get("/examples/{example_id}")
def get_example(example_id: str, n_qubits: int = Query(default=5, ge=MIN_QUBITS, le=MAX_QUBITS),
                _user: User = Depends(get_current_user)) -> Dict:
    """An example circuit as OpenQASM text, sized to `n_qubits`."""
    if example_id not in EXAMPLES:
        raise HTTPException(status_code=404, detail=f"Unknown example. Choose from: {', '.join(EXAMPLES)}.")
    return {"id": example_id, "n_qubits": n_qubits, "qasm": example_qasm(example_id, n_qubits)}


@router.post("/qasm/inspect")
def inspect_qasm(req: InspectRequest, _user: User = Depends(get_current_user)) -> Dict:
    """
    Read OpenQASM text without running it (the page calls this as you type):
    the circuit's size and the example it still is, or the first problem and its line.
    """
    try:
        program = parse_qasm(req.source)
    except QasmError as e:
        return {"ok": False, "error": {"message": e.message, "line": e.line}}
    circuit = program.circuit
    return {
        "ok": True,
        "n_qubits": circuit.n_qubits,
        "gate_count": circuit.gate_count(),
        "depth": circuit.depth(),
        "required_bytes": 2 ** circuit.n_qubits * 16,
        "labels": program.labels,
        "example": match_example(program),
    }


@router.post("/qasm/steps")
def qasm_steps(req: InspectRequest, _user: User = Depends(get_current_user)) -> Dict:
    """
    Replay a small circuit one gate at a time: every outcome's chance after each gate,
    the line the gate came from, and whether the gate only turned hidden phases.
    """
    try:
        program = parse_qasm(req.source)
    except QasmError as e:
        raise HTTPException(status_code=422, detail=str(e))
    n, ops = program.n_qubits, program.circuit.operations
    if n > MAX_STEP_QUBITS or len(ops) > MAX_STEPS:
        raise HTTPException(status_code=422, detail=(
            f"Step by step works for circuits up to {MAX_STEP_QUBITS} qubits and {MAX_STEPS} gates. "
            f"This one has {n} qubits and {len(ops):,} gates."))
    sv = QuantumStateVector(n, check_ram=False)
    amps = sv.state
    probs = np.abs(amps) ** 2
    steps = [{"gate": None, "qubits": [], "params": [], "line": None,
              "probs": [round(float(p), 6) for p in probs], "phase_only": False}]
    for op, line in zip(ops, program.lines):
        sv.apply_gate(op.gate, op.qubits, op.params)
        new_amps = sv.state
        new_probs = np.abs(new_amps) ** 2
        moved = float(np.max(np.abs(new_probs - probs))) > 1e-9
        # A turn of the whole state at once (|⟨old|new⟩| = 1) can never be noticed, so it doesn't count.
        turned = 1 - abs(complex(np.vdot(amps, new_amps))) > 1e-9
        steps.append({"gate": op.gate, "qubits": op.qubits, "params": [round(x, 6) for x in op.params], "line": line,
                      "probs": [round(float(p), 6) for p in new_probs], "phase_only": turned and not moved})
        amps, probs = new_amps, new_probs
    return {"n_qubits": n, "labels": program.labels, "steps": steps}


@router.post("/qasm")
def run_qasm(req: QasmRequest, _user: User = Depends(get_current_user)) -> Dict:
    """Run OpenQASM text. (The page uses the WebSocket for live progress; this is the fallback.)"""
    try:
        program = parse_qasm(req.source)
    except QasmError as e:
        raise HTTPException(status_code=422, detail=str(e))
    result = _qasm_finish(program)(_run_or_http_error(lambda: program.circuit, req.shots))
    return {"status": "ok", "result": result}


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
                      {"action": "qasm",     "payload": QasmRequest}
                      {"action": "cancel"}   (or just close the socket) – stops a run
                      {"action": "ping"}
    Server → client:  {"type": "progress", "percent": 0-100, "step": "...", "detail": "..."}
                      {"type": "result", "result": SimulationResult}
                      {"type": "cancelled", "detail": "..."}
                      {"type": "error", "detail": "...", "line": n | null}
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
            elif action == "qasm":
                def build():
                    req = QasmRequest(**payload)
                    program = parse_qasm(req.source)
                    return program.circuit, req.shots, _qasm_finish(program)
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
            await _send(websocket, {"type": "error", "detail": _short_of_memory(circuit.n_qubits)})
            return True

        n_ops = circuit.gate_count()
        await _progress(websocket, "Preparing memory", 3,
                        f"{circuit.n_qubits} qubits, {_size_text(2 ** circuit.n_qubits * 16)}")

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
        await _progress(websocket, "Measuring", 95, f"{n_ops:,} gates applied")
        await _send(websocket, {"type": "result", "result": result})
        await _progress(websocket, "Complete", 100)

    except SimulationCancelled as e:
        if not gone:
            await _send(websocket, {"type": "cancelled", "detail": str(e)})
    except QasmError as e:
        await _send(websocket, {"type": "error", "detail": str(e), "line": e.line})
    except Exception as e:
        await _send(websocket, {"type": "error", "detail": _error_text(e)})
    finally:
        if watcher is not None and not watcher.done():
            watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await watcher
    return not gone
