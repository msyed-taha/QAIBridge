"""
Module 1 – Custom Simulation Kernel
gates.py  –  All supported quantum gate matrices

Gates are represented as NumPy complex128 arrays.
Single-qubit gates: H, X, Y, Z, S, T, I, RX(θ), RY(θ), RZ(θ), U(θ,φ,λ)
Two-qubit gates   : CNOT, CZ, SWAP, CRX(θ), CRY(θ), CRZ(θ)
"""

import numpy as np
from typing import Dict, Any

# ──────────────────────────────────────────────────────────────────────────────
# Single-Qubit Constant Gates
# ──────────────────────────────────────────────────────────────────────────────

I_GATE = np.eye(2, dtype=complex)

H_GATE = np.array(
    [[1,  1],
     [1, -1]], dtype=complex
) / np.sqrt(2)

X_GATE = np.array(
    [[0, 1],
     [1, 0]], dtype=complex
)

Y_GATE = np.array(
    [[0, -1j],
     [1j,  0]], dtype=complex
)

Z_GATE = np.array(
    [[1,  0],
     [0, -1]], dtype=complex
)

S_GATE = np.array(
    [[1, 0],
     [0, 1j]], dtype=complex
)

S_DAG_GATE = np.array(
    [[1,  0],
     [0, -1j]], dtype=complex
)

T_GATE = np.array(
    [[1, 0],
     [0, np.exp(1j * np.pi / 4)]], dtype=complex
)

T_DAG_GATE = np.array(
    [[1, 0],
     [0, np.exp(-1j * np.pi / 4)]], dtype=complex
)

# ──────────────────────────────────────────────────────────────────────────────
# Single-Qubit Parametric Gates
# ──────────────────────────────────────────────────────────────────────────────

def RX(theta: float) -> np.ndarray:
    """Rotation around X-axis by angle theta (radians)."""
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array(
        [[c,       -1j * s],
         [-1j * s,  c     ]], dtype=complex
    )


def RY(theta: float) -> np.ndarray:
    """Rotation around Y-axis by angle theta (radians)."""
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array(
        [[c, -s],
         [s,  c]], dtype=complex
    )


def RZ(theta: float) -> np.ndarray:
    """Rotation around Z-axis by angle theta (radians)."""
    return np.array(
        [[np.exp(-1j * theta / 2), 0                        ],
         [0,                        np.exp(1j * theta / 2)  ]], dtype=complex
    )


def U_GATE(theta: float, phi: float, lam: float) -> np.ndarray:
    """
    Generic single-qubit unitary (IBM U-gate).
    U(θ, φ, λ) = [[cos(θ/2),        -e^{iλ}·sin(θ/2)],
                  [e^{iφ}·sin(θ/2),  e^{i(φ+λ)}·cos(θ/2)]]
    """
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array(
        [[c,                              -np.exp(1j * lam) * s     ],
         [np.exp(1j * phi) * s,            np.exp(1j * (phi + lam)) * c]], dtype=complex
    )


def P_GATE(phi: float) -> np.ndarray:
    """Phase gate: adds phase e^{iφ} to |1> state."""
    return np.array(
        [[1, 0                ],
         [0, np.exp(1j * phi)]], dtype=complex
    )


# ──────────────────────────────────────────────────────────────────────────────
# Two-Qubit Constant Gates
# ──────────────────────────────────────────────────────────────────────────────

CNOT_GATE = np.array(
    [[1, 0, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 1],
     [0, 0, 1, 0]], dtype=complex
)

CZ_GATE = np.array(
    [[1, 0, 0,  0],
     [0, 1, 0,  0],
     [0, 0, 1,  0],
     [0, 0, 0, -1]], dtype=complex
)

SWAP_GATE = np.array(
    [[1, 0, 0, 0],
     [0, 0, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 1]], dtype=complex
)

ISWAP_GATE = np.array(
    [[1,  0,  0, 0],
     [0,  0, 1j, 0],
     [0, 1j,  0, 0],
     [0,  0,  0, 1]], dtype=complex
)

# ──────────────────────────────────────────────────────────────────────────────
# Two-Qubit Parametric Controlled Gates
# ──────────────────────────────────────────────────────────────────────────────

def CRX(theta: float) -> np.ndarray:
    """Controlled-RX gate."""
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array(
        [[1, 0,       0,        0      ],
         [0, 1,       0,        0      ],
         [0, 0,       c,  -1j * s      ],
         [0, 0, -1j * s,        c      ]], dtype=complex
    )


def CRY(theta: float) -> np.ndarray:
    """Controlled-RY gate."""
    c = np.cos(theta / 2)
    s = np.sin(theta / 2)
    return np.array(
        [[1, 0,  0,  0],
         [0, 1,  0,  0],
         [0, 0,  c, -s],
         [0, 0,  s,  c]], dtype=complex
    )


def CRZ(theta: float) -> np.ndarray:
    """Controlled-RZ gate."""
    return np.array(
        [[1, 0, 0,                        0                        ],
         [0, 1, 0,                        0                        ],
         [0, 0, np.exp(-1j * theta / 2),  0                        ],
         [0, 0, 0,                        np.exp(1j * theta / 2)   ]], dtype=complex
    )


# ──────────────────────────────────────────────────────────────────────────────
# Gate Registry — maps string names → matrix (or callable)
# ──────────────────────────────────────────────────────────────────────────────

SINGLE_QUBIT_GATES: Dict[str, Any] = {
    "I":     I_GATE,
    "H":     H_GATE,
    "X":     X_GATE,
    "Y":     Y_GATE,
    "Z":     Z_GATE,
    "S":     S_GATE,
    "SDAG":  S_DAG_GATE,
    "T":     T_GATE,
    "TDAG":  T_DAG_GATE,
    # Parametric (callables)
    "RX":    RX,
    "RY":    RY,
    "RZ":    RZ,
    "U":     U_GATE,
    "P":     P_GATE,
}

TWO_QUBIT_GATES: Dict[str, Any] = {
    "CNOT":  CNOT_GATE,
    "CX":    CNOT_GATE,  # alias
    "CZ":    CZ_GATE,
    "SWAP":  SWAP_GATE,
    "ISWAP": ISWAP_GATE,
    # Parametric
    "CRX":   CRX,
    "CRY":   CRY,
    "CRZ":   CRZ,
}


def get_gate_matrix(name: str, params: list = None) -> np.ndarray:
    """
    Resolve a gate name (and optional parameters) to its matrix.

    Examples:
        get_gate_matrix("H")         → H_GATE
        get_gate_matrix("RX", [1.57]) → RX(1.57)
        get_gate_matrix("CNOT")      → CNOT_GATE
    """
    params = params or []
    name_upper = name.upper()

    if name_upper in SINGLE_QUBIT_GATES:
        gate = SINGLE_QUBIT_GATES[name_upper]
        return gate(*params) if callable(gate) else gate

    if name_upper in TWO_QUBIT_GATES:
        gate = TWO_QUBIT_GATES[name_upper]
        return gate(*params) if callable(gate) else gate

    raise ValueError(f"Unknown gate: '{name}'. "
                     f"Supported: {list(SINGLE_QUBIT_GATES) + list(TWO_QUBIT_GATES)}")
