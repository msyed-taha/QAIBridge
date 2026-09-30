"""
Module 3 - Educational Quantum Circuit Simulator
Routes:
  POST /api/module3/simulate  - Simulate a user-built circuit on the Module 1 kernel
  GET  /api/module3/gates     - Gate palette with plain-language descriptions

The circuit builder sends gates in time order. Each gate names its target
`qubit`; controlled gates add `control_qubit` (and `control2` for Toffoli);
rotation gates add `angle` in radians. The response contains the full state
vector, per-qubit Bloch vectors (so the UI can draw one sphere per qubit and
show which qubits are entangled), sampled measurement counts and circuit
statistics.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..modules.module1_kernel import QuantumCircuit, QuantumStateVector

router = APIRouter(prefix="/api/module3", tags=["Module 3 - Circuit Builder"])

MAX_QUBITS = 6
MAX_GATES = 120

SINGLE = {"H", "X", "Y", "Z", "S", "T", "SDG", "TDG", "SX"}
ROTATIONS = {"RX", "RY", "RZ", "P"}
TWO = {"CNOT", "CZ", "SWAP"}
THREE = {"CCX"}


class GateOp(BaseModel):
    gate:          str
    qubit:         int
    control_qubit: Optional[int] = None
    control2:      Optional[int] = None
    angle:         Optional[float] = None


class CircuitRequest(BaseModel):
    num_qubits: int = Field(..., ge=1, le=MAX_QUBITS)
    gates:      List[GateOp] = Field(default_factory=list, max_length=MAX_GATES)
    shots:      int = Field(1024, ge=0, le=8192)


class StateEntry(BaseModel):
    label:        str
    amplitude_re: float
    amplitude_im: float
    probability:  float
    phase_deg:    float = 0.0


class BlochEntry(BaseModel):
    qubit:     int
    x: float
    y: float
    z: float
    p0: float
    p1: float
    purity:    float
    length:    float
    entangled: bool


class CircuitResult(BaseModel):
    num_qubits:       int
    states:           List[StateEntry]
    is_superposition: bool
    is_entangled:     bool
    gate_count:       int
    circuit_depth:    int
    bloch:            List[BlochEntry] = []
    counts:           Dict[str, int] = {}
    entangled_qubits: List[int] = []


def _build(req: CircuitRequest) -> QuantumCircuit:
    n = req.num_qubits
    circ = QuantumCircuit(n, "Circuit Builder", max_gates=MAX_GATES + 5)
    for i, op in enumerate(req.gates):
        g = op.gate.upper()
        if g == "CX":
            g = "CNOT"
        if g == "TOFFOLI":
            g = "CCX"
        where = f"Gate {i + 1} ({g})"
        if not 0 <= op.qubit < n:
            raise HTTPException(400, f"{where}: qubit {op.qubit} is outside the circuit.")
        if g in SINGLE:
            circ._add(g, [op.qubit])
        elif g in ROTATIONS:
            angle = op.angle if op.angle is not None else math.pi / 2
            circ._add(g, [op.qubit], [angle])
        elif g in TWO:
            c = op.control_qubit
            if c is None or not 0 <= c < n or c == op.qubit:
                raise HTTPException(400, f"{where}: needs a second qubit different from the target.")
            circ._add(g, [c, op.qubit])
        elif g in THREE:
            c1, c2 = op.control_qubit, op.control2
            if c1 is None or c2 is None or len({c1, c2, op.qubit}) < 3 or not all(0 <= q < n for q in (c1, c2)):
                raise HTTPException(400, f"{where}: Toffoli needs two different control qubits and a target.")
            circ._add("CCX", [c1, c2, op.qubit])
        else:
            raise HTTPException(400, f"Unknown gate: {op.gate}")
    return circ


@router.post("/simulate", response_model=CircuitResult)
def simulate(req: CircuitRequest):
    circ = _build(req)
    n = req.num_qubits
    sv = QuantumStateVector(n)
    circ.execute(sv)
    probs = sv.probabilities()
    states = []
    for i in range(2 ** n):
        amp = sv._state[i]
        states.append(StateEntry(
            label=f"|{format(i, f'0{n}b')}⟩",
            amplitude_re=round(float(amp.real), 6),
            amplitude_im=round(float(amp.imag), 6),
            probability=round(float(probs[i]), 6),
            phase_deg=round(math.degrees(math.atan2(amp.imag, amp.real)), 2) if probs[i] > 1e-12 else 0.0,
        ))
    bloch = []
    for b in sv.bloch_vectors():
        bloch.append(BlochEntry(**b, entangled=b["purity"] < 1 - 1e-6))
    counts = sv.measure_all(req.shots) if req.shots else {}
    counts = {k.replace(">", "⟩"): v for k, v in counts.items()}
    return CircuitResult(
        num_qubits=n,
        states=states,
        is_superposition=bool(sum(1 for p in probs if p > 1e-9) > 1),
        is_entangled=sv.is_entangled(),
        gate_count=circ.gate_count(),
        circuit_depth=circ.depth(),
        bloch=bloch,
        counts=counts,
        entangled_qubits=[b.qubit for b in bloch if b.entangled],
    )


@router.get("/gates")
def list_gates():
    return {
        "single_qubit": [
            {"name": "H",   "label": "Hadamard", "desc": "Creates superposition: |0⟩ → (|0⟩+|1⟩)/√2 — a fair quantum coin."},
            {"name": "X",   "label": "Pauli-X",  "desc": "Bit flip (quantum NOT): |0⟩ ↔ |1⟩."},
            {"name": "Y",   "label": "Pauli-Y",  "desc": "Bit flip and phase flip together."},
            {"name": "Z",   "label": "Pauli-Z",  "desc": "Phase flip: leaves |0⟩, turns |1⟩ into −|1⟩."},
            {"name": "S",   "label": "S",        "desc": "Quarter-turn phase: |1⟩ → i|1⟩."},
            {"name": "T",   "label": "T",        "desc": "Eighth-turn phase: |1⟩ → e^{iπ/4}|1⟩."},
            {"name": "SDG", "label": "S†",       "desc": "Undo an S gate."},
            {"name": "TDG", "label": "T†",       "desc": "Undo a T gate."},
            {"name": "SX",  "label": "√X",       "desc": "Half of a NOT — two in a row make an X."},
        ],
        "rotations": [
            {"name": "RX", "label": "RX(θ)", "desc": "Rotate the Bloch vector around the X axis by θ."},
            {"name": "RY", "label": "RY(θ)", "desc": "Rotate around Y — sets the 0/1 probabilities to cos²(θ/2) / sin²(θ/2)."},
            {"name": "RZ", "label": "RZ(θ)", "desc": "Rotate around Z — changes the phase only."},
            {"name": "P",  "label": "P(φ)",  "desc": "Phase shift e^{iφ} on |1⟩."},
        ],
        "two_qubit": [
            {"name": "CNOT", "label": "CNOT", "desc": "Flips the target when the control is 1 — the entangling gate."},
            {"name": "CZ",   "label": "CZ",   "desc": "Phase flip when both qubits are 1."},
            {"name": "SWAP", "label": "SWAP", "desc": "Exchanges the states of two qubits."},
        ],
        "three_qubit": [
            {"name": "CCX", "label": "Toffoli", "desc": "Flips the target only when BOTH controls are 1 — a reversible AND."},
        ],
    }
