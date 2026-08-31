"""
Module 3 - Educational Quantum Circuit Simulator
Routes:
  POST /api/module3/simulate  - Simulate a user-defined circuit
  GET  /api/module3/gates     - List supported gates
"""
from __future__ import annotations
import math
import cmath
from typing import List, Optional
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/module3", tags=["Module 3 - Circuit Builder"])

# Gate matrices
_I   = np.eye(2, dtype=complex)
_H   = np.array([[1,1],[1,-1]], dtype=complex) / math.sqrt(2)
_X   = np.array([[0,1],[1,0]], dtype=complex)
_Y   = np.array([[0,-1j],[1j,0]], dtype=complex)
_Z   = np.array([[1,0],[0,-1]], dtype=complex)
_S   = np.array([[1,0],[0,1j]], dtype=complex)
_T   = np.array([[1,0],[0,cmath.exp(1j*math.pi/4)]], dtype=complex)
_SDG = np.array([[1,0],[0,-1j]], dtype=complex)
_TDG = np.array([[1,0],[0,cmath.exp(-1j*math.pi/4)]], dtype=complex)

SINGLE_GATES = {"H":_H,"X":_X,"Y":_Y,"Z":_Z,"S":_S,"T":_T,"SDG":_SDG,"TDG":_TDG}

class GateOp(BaseModel):
    gate:         str
    qubit:        int
    control_qubit: Optional[int] = None

class CircuitRequest(BaseModel):
    num_qubits: int = Field(..., ge=1, le=5)
    gates:      List[GateOp] = Field(default_factory=list)

class StateEntry(BaseModel):
    label:        str
    amplitude_re: float
    amplitude_im: float
    probability:  float

class CircuitResult(BaseModel):
    num_qubits:       int
    states:           List[StateEntry]
    is_superposition: bool
    is_entangled:     bool
    gate_count:       int
    circuit_depth:    int

def _apply_single(sv, gate_mat, qubit, n):
    op = np.array([[1]], dtype=complex)
    for q in range(n):
        op = np.kron(op, gate_mat if q == qubit else _I)
    return op @ sv

def _apply_cnot(sv, control, target, n):
    size   = 2**n
    new_sv = sv.copy()
    for i in range(size):
        if (i >> (n-1-control)) & 1:
            j = i ^ (1 << (n-1-target))
            new_sv[i], new_sv[j] = sv[j], sv[i]
    return new_sv

def _apply_cz(sv, control, target, n):
    size   = 2**n
    new_sv = sv.copy()
    for i in range(size):
        if ((i >> (n-1-control)) & 1) and ((i >> (n-1-target)) & 1):
            new_sv[i] = -sv[i]
    return new_sv

def _is_entangled(sv, n):
    if n < 2:
        return False
    matrix = sv.reshape(2, 2**(n-1))
    try:
        _, s, _ = np.linalg.svd(matrix)
        return bool(np.sum(np.abs(s) > 1e-9) > 1)
    except Exception:
        return False

@router.post("/simulate", response_model=CircuitResult)
def simulate(req: CircuitRequest):
    n  = req.num_qubits
    sv = np.zeros(2**n, dtype=complex)
    sv[0] = 1.0
    for op in req.gates:
        gate = op.gate.upper()
        q    = op.qubit
        if q < 0 or q >= n:
            raise HTTPException(400, f"Qubit index {q} out of range.")
        if gate == "CNOT":
            c = op.control_qubit
            if c is None or c < 0 or c >= n or c == q:
                raise HTTPException(400, "Invalid CNOT control qubit.")
            sv = _apply_cnot(sv, c, q, n)
        elif gate == "CZ":
            c = op.control_qubit
            if c is None:
                raise HTTPException(400, "CZ requires control_qubit.")
            sv = _apply_cz(sv, c, q, n)
        elif gate in SINGLE_GATES:
            sv = _apply_single(sv, SINGLE_GATES[gate], q, n)
        else:
            raise HTTPException(400, f"Unknown gate: {gate}")
    states = []
    for i in range(2**n):
        amp  = sv[i]
        prob = float(abs(amp)**2)
        states.append(StateEntry(
            label=f"|{format(i,f'0{n}b')}⟩",
            amplitude_re=round(float(amp.real),6),
            amplitude_im=round(float(amp.imag),6),
            probability=round(prob,6),
        ))
    is_sup = any(1e-9 < s.probability < 1-1e-9 for s in states)
    return CircuitResult(
        num_qubits=n, states=states,
        is_superposition=is_sup,
        is_entangled=_is_entangled(sv, n),
        gate_count=len(req.gates),
        circuit_depth=len(req.gates),
    )

@router.get("/gates")
def list_gates():
    return {
        "single_qubit": [
            {"name":"H",   "label":"Hadamard","desc":"Creates superposition: |0> -> (|0>+|1>)/sqrt(2)"},
            {"name":"X",   "label":"Pauli-X", "desc":"Bit flip (quantum NOT): |0><->|1>"},
            {"name":"Y",   "label":"Pauli-Y", "desc":"Bit+phase flip"},
            {"name":"Z",   "label":"Pauli-Z", "desc":"Phase flip: |1> -> -|1>"},
            {"name":"S",   "label":"S Gate",  "desc":"pi/2 phase rotation"},
            {"name":"T",   "label":"T Gate",  "desc":"pi/4 phase rotation"},
            {"name":"SDG", "label":"S-dag",   "desc":"Inverse S gate"},
            {"name":"TDG", "label":"T-dag",   "desc":"Inverse T gate"},
        ],
        "two_qubit": [
            {"name":"CNOT","label":"CNOT","desc":"Controlled-NOT: creates entanglement"},
            {"name":"CZ",  "label":"CZ",  "desc":"Controlled-Z gate"},
        ],
    }
