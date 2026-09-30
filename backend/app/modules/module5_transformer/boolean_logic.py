"""
Module 5 – Classical → Quantum Logic Transformer
boolean_logic.py  –  Boolean logic → probabilistic linear algebra (FE-3)

A Boolean formula f(x₁…xₙ) is translated, systematically and exactly, into
the three quantum objects an algorithm designer needs:

1. Phase oracle      O_f = diag((−1)^{f(x)})              — a 2ⁿ×2ⁿ unitary
2. Reversible circuit |x⟩|y⟩ → |x⟩|y ⊕ f(x)⟩              — built from the
   algebraic normal form (Reed–Muller / ESOP): f = ⊕_S a_S·Π_{i∈S} x_i, one
   multi-controlled X per monomial (Toffoli for 2 inputs, CNOT for 1).
3. Hamiltonian       H_f = Σ_x (1 − f(x))|x⟩⟨x| = c₀·I − Σ_S c_S·Z_S
   (Pauli-Z expansion by an exact Walsh–Hadamard transform); its ground
   states (energy 0) are exactly the satisfying assignments.

Verification: the reversible circuit is run ONCE on the superposition of all
2ⁿ inputs; the resulting state Σ_x |x⟩|f(x)⟩ must reproduce the classical
truth table on every row. Grover's algorithm with the phase-kickback oracle
then searches for satisfying assignments.

Variable i ↔ qubit i ↔ most-significant bit (kernel convention).
"""

from __future__ import annotations

import math
import re
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from ..module1_kernel import QuantumCircuit, QuantumStateVector

MAX_LOGIC_VARIABLES = 10

# ── Tokeniser & recursive-descent parser ──────────────────────────────────────

_TOKEN_RE = re.compile(
    r"\s*(?:(<->|<=>|->|=>|==|!=|&&|\|\||[()!~&|^+*¬∧∨⊕→↔'])|([A-Za-z_][A-Za-z0-9_]*)|(\d+))"
)

_WORD_OPS = {"and": "&", "or": "|", "not": "!", "xor": "^", "implies": "->", "iff": "<->",
             "nand": "nand", "nor": "nor"}
_SYMBOL_OPS = {"&&": "&", "∧": "&", "*": "&", "||": "|", "∨": "|", "+": "|", "¬": "!", "~": "!",
               "⊕": "^", "!=": "^", "→": "->", "=>": "->", "↔": "<->", "<=>": "<->", "==": "<->"}


class LogicSyntaxError(ValueError):
    pass


def _tokenize(expr: str) -> List[Tuple[str, str]]:
    tokens: List[Tuple[str, str]] = []
    pos = 0
    expr = expr.strip()
    while pos < len(expr):
        if expr[pos].isspace():
            pos += 1
            continue
        m = _TOKEN_RE.match(expr, pos)
        if not m or m.end() == pos:
            raise LogicSyntaxError(f"Unexpected character '{expr[pos]}' at position {pos + 1}.")
        op, name, number = m.groups()
        pos = m.end()
        if op:
            tokens.append(("op", _SYMBOL_OPS.get(op, op)))
        elif name:
            low = name.lower()
            if low in _WORD_OPS:
                tokens.append(("op", _WORD_OPS[low]))
            elif low in ("true", "false"):
                tokens.append(("const", "1" if low == "true" else "0"))
            else:
                tokens.append(("var", name))
        else:
            if number not in ("0", "1"):
                raise LogicSyntaxError(f"Only 0 and 1 are allowed as constants (got {number}).")
            tokens.append(("const", number))
    if not tokens:
        raise LogicSyntaxError("The expression is empty.")
    return tokens


class _Parser:
    """
    Precedence (low → high):  ↔  <  →  <  ∨  <  ⊕  <  ∧  <  ¬ / postfix '
    NAND / NOR bind like ∧ / ∨.
    """

    def __init__(self, tokens: List[Tuple[str, str]]):
        self.t = tokens
        self.i = 0

    def peek(self) -> Optional[Tuple[str, str]]:
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self, value: Optional[str] = None) -> Tuple[str, str]:
        tok = self.peek()
        if tok is None:
            raise LogicSyntaxError("The expression ends too early.")
        if value is not None and tok[1] != value:
            raise LogicSyntaxError(f"Expected '{value}' but found '{tok[1]}'.")
        self.i += 1
        return tok

    def parse(self):
        node = self.iff()
        if self.peek() is not None:
            raise LogicSyntaxError(f"Unexpected '{self.peek()[1]}'.")
        return node

    def iff(self):
        node = self.imp()
        while self.peek() == ("op", "<->"):
            self.take()
            node = ("iff", node, self.imp())
        return node

    def imp(self):
        node = self.or_()
        if self.peek() == ("op", "->"):
            self.take()
            return ("imp", node, self.imp())       # right-associative
        return node

    def or_(self):
        node = self.xor()
        while self.peek() in (("op", "|"), ("op", "nor")):
            op = self.take()[1]
            rhs = self.xor()
            node = ("or", node, rhs) if op == "|" else ("not", ("or", node, rhs))
        return node

    def xor(self):
        node = self.and_()
        while self.peek() == ("op", "^"):
            self.take()
            node = ("xor", node, self.and_())
        return node

    def _starts_atom(self) -> bool:
        tok = self.peek()
        return tok is not None and (tok[0] in ("var", "const") or tok in (("op", "("), ("op", "!")))

    def and_(self):
        node = self.unary()
        while True:
            if self.peek() in (("op", "&"), ("op", "nand")):
                op = self.take()[1]
                rhs = self.unary()
                node = ("and", node, rhs) if op == "&" else ("not", ("and", node, rhs))
            elif self._starts_atom():               # implicit AND:  A' B  or  (a+b)(c+d)
                node = ("and", node, self.unary())
            else:
                return node

    def unary(self):
        if self.peek() == ("op", "!"):
            self.take()
            return ("not", self.unary())
        node = self.atom()
        while self.peek() == ("op", "'"):           # postfix negation: a'
            self.take()
            node = ("not", node)
        return node

    def atom(self):
        tok = self.take()
        if tok == ("op", "("):
            node = self.iff()
            self.take(")")
            return node
        if tok[0] == "var":
            return ("var", tok[1])
        if tok[0] == "const":
            return ("const", tok[1] == "1")
        raise LogicSyntaxError(f"Unexpected '{tok[1]}'.")


def _variables(node, out: List[str]) -> List[str]:
    if node[0] == "var":
        if node[1] not in out:
            out.append(node[1])
    elif node[0] != "const":
        for child in node[1:]:
            _variables(child, out)
    return out


def _to_text(node) -> str:
    kind = node[0]
    if kind == "var":
        return node[1]
    if kind == "const":
        return "1" if node[1] else "0"
    if kind == "not":
        inner = _to_text(node[1])
        return f"¬{inner}" if node[1][0] in ("var", "const", "not") or inner.startswith("(") else f"¬({inner})"
    sym = {"and": "∧", "or": "∨", "xor": "⊕", "imp": "→", "iff": "↔"}[kind]
    return f"({_to_text(node[1])} {sym} {_to_text(node[2])})"


def _evaluate(node, cols: Dict[str, np.ndarray], size: int) -> np.ndarray:
    kind = node[0]
    if kind == "var":
        return cols[node[1]]
    if kind == "const":
        return np.full(size, node[1], dtype=bool)
    if kind == "not":
        return ~_evaluate(node[1], cols, size)
    a = _evaluate(node[1], cols, size)
    b = _evaluate(node[2], cols, size)
    if kind == "and":
        return a & b
    if kind == "or":
        return a | b
    if kind == "xor":
        return a ^ b
    if kind == "imp":
        return (~a) | b
    return ~(a ^ b)   # iff


# ── Transforms ────────────────────────────────────────────────────────────────

def walsh_hadamard(values: np.ndarray) -> np.ndarray:
    """F[S] = Σ_x v[x]·(−1)^{popcount(x ∧ S)}  (unnormalised, in place on a copy)."""
    a = np.asarray(values, dtype=float).copy()
    h = 1
    while h < len(a):
        a = a.reshape(-1, 2, h)
        a = np.stack([a[:, 0, :] + a[:, 1, :], a[:, 0, :] - a[:, 1, :]], axis=1).reshape(-1)
        h *= 2
    return a


def algebraic_normal_form(truth: np.ndarray) -> np.ndarray:
    """Binary Möbius transform: coefficients a_S of f = ⊕_S a_S Π_{i∈S} x_i."""
    a = np.asarray(truth, dtype=np.uint8).copy()
    h = 1
    while h < len(a):
        a = a.reshape(-1, 2, h)
        a[:, 1, :] ^= a[:, 0, :]
        a = a.reshape(-1)
        h *= 2
    return a


def _mask_to_vars(mask: int, n: int) -> List[int]:
    """Bit mask (MSB = variable 0) → variable indices."""
    return [i for i in range(n) if (mask >> (n - 1 - i)) & 1]


# ── Public API ────────────────────────────────────────────────────────────────

def parse_logic(expression: str):
    tree = _Parser(_tokenize(expression)).parse()
    variables = _variables(tree, [])
    if not variables:
        raise LogicSyntaxError("The expression has no variables.")
    if len(variables) > MAX_LOGIC_VARIABLES:
        raise LogicSyntaxError(f"Use at most {MAX_LOGIC_VARIABLES} variables (found {len(variables)}).")
    return tree, variables


def truth_table(expression: str) -> Dict[str, Any]:
    tree, variables = parse_logic(expression)
    n = len(variables)
    size = 2 ** n
    idx = np.arange(size)
    cols = {v: ((idx >> (n - 1 - i)) & 1).astype(bool) for i, v in enumerate(variables)}
    values = _evaluate(tree, cols, size)
    return {"tree": tree, "variables": variables, "n": n, "values": values}


def esop_circuit(values: np.ndarray, n: int) -> Tuple[List[List[int]], bool]:
    """Monomials of the ANF (each a list of controlling variables) and the constant term."""
    anf = algebraic_normal_form(values.astype(np.uint8))
    monomials = [_mask_to_vars(mask, n) for mask in range(1, len(anf)) if anf[mask]]
    monomials.sort(key=lambda m: (len(m), m))
    return monomials, bool(anf[0])


def build_compute_circuit(n: int, monomials: List[List[int]], constant: bool,
                          prepare_all_inputs: bool = False) -> QuantumCircuit:
    """|x⟩|0⟩ → |x⟩|f(x)⟩ on n input qubits + 1 output qubit (index n)."""
    circ = QuantumCircuit(n + 1, "Reversible Boolean oracle", max_gates=20_000)
    if prepare_all_inputs:
        for q in range(n):
            circ.h(q)
        circ.barrier("all 2^n inputs in superposition")
    if constant:
        circ.x(n)
    for mono in monomials:
        if len(mono) == 1:
            circ.cnot(mono[0], n)
        elif len(mono) == 2:
            circ.ccx(mono[0], mono[1], n)
        else:
            circ.mcx(mono, n)
    return circ


def build_grover_circuit(n: int, monomials: List[List[int]], constant: bool, iterations: int) -> QuantumCircuit:
    """Grover search with the phase-kickback oracle (output qubit prepared in |−⟩)."""
    circ = QuantumCircuit(n + 1, f"Grover with Boolean oracle ({n}+1 qubits)", max_gates=200_000)
    qs = list(range(n))
    for q in qs:
        circ.h(q)
    circ.x(n)
    circ.h(n)                                  # |−⟩: flipping it multiplies the phase by −1
    circ.barrier("iteration 0")
    for it in range(1, iterations + 1):
        if constant:
            circ.x(n)
        for mono in monomials:
            if len(mono) == 1:
                circ.cnot(mono[0], n)
            elif len(mono) == 2:
                circ.ccx(mono[0], mono[1], n)
            else:
                circ.mcx(mono, n)
        for q in qs:
            circ.h(q)
        for q in qs:
            circ.x(q)
        circ.mcz(qs)
        for q in qs:
            circ.x(q)
        for q in qs:
            circ.h(q)
        circ.barrier(f"iteration {it}")
    return circ


def hamiltonian_terms(values: np.ndarray, variables: List[str], tol: float = 1e-12) -> Dict[str, Any]:
    """H_f = Σ_x (1 − f(x))|x⟩⟨x| expanded in Pauli-Z strings."""
    n = len(variables)
    penalty = 1.0 - values.astype(float)            # 1 on non-solutions
    coeffs = walsh_hadamard(penalty) / len(penalty)
    terms = []
    for mask, c in enumerate(coeffs):
        if abs(c) > tol:
            qs = _mask_to_vars(mask, n)
            terms.append({"coeff": round(float(c), 10), "qubits": qs,
                          "paulis": " ".join(f"Z{q}" for q in qs) if qs else "I"})
    terms.sort(key=lambda t: (len(t["qubits"]), t["qubits"]))
    locality = max((len(t["qubits"]) for t in terms), default=0)
    text = []
    for k, t in enumerate(terms[:40]):
        body = f"{abs(t['coeff']):.4g}" + ("" if t["paulis"] == "I" else "·" + t["paulis"].replace(" ", "·"))
        text.append(("−" if t["coeff"] < 0 else "") + body if k == 0 else (" − " if t["coeff"] < 0 else " + ") + body)
    s = "H = " + ("".join(text) if text else "0")
    if len(terms) > 40:
        s += f" + … ({len(terms) - 40} more terms)"
    return {"terms": terms, "n_terms": len(terms), "max_locality": locality, "hamiltonian": s}


def run_logic_pipeline(expression: str, shots: int = 1024, seed: Optional[int] = None) -> Dict[str, Any]:
    t_start = time.perf_counter()
    # 1) truth table — the classical reference (every assignment evaluated)
    tt = truth_table(expression)
    variables, n, values = tt["variables"], tt["n"], tt["values"]
    size = 2 ** n
    sat = np.flatnonzero(values)
    M = int(sat.size)
    classical_solutions = [int(i) for i in sat]
    classical_ms = (time.perf_counter() - t_start) * 1000

    # 2) reversible circuit from the ANF, verified on all inputs at once
    monomials, constant = esop_circuit(values, n)
    compute = build_compute_circuit(n, monomials, constant, prepare_all_inputs=True)
    sv = QuantumStateVector(n + 1, check_ram=False)
    compute.execute(sv)
    probs = sv.probabilities().reshape(size, 2)           # [input x, output bit]
    circuit_output = probs[:, 1] > 1e-9
    uniform_ok = np.allclose(probs.sum(axis=1), 1.0 / size, atol=1e-9)
    verified = bool(np.array_equal(circuit_output, values) and uniform_ok)
    mismatches = [int(i) for i in np.flatnonzero(circuit_output != values)][:8]

    # 3) Hamiltonian
    ham = hamiltonian_terms(values, variables)

    # 4) Grover search for satisfying assignments
    if M == 0 or M >= size:
        k = 0
    else:
        theta = math.asin(math.sqrt(M / size))
        k = max(0, int(math.floor(math.pi / (4 * theta))))
    theta = math.asin(math.sqrt(M / size)) if M else 0.0
    grover = build_grover_circuit(n, monomials, constant, k)
    gsv = QuantumStateVector(n + 1, check_ram=False)
    curve: List[Dict[str, float]] = []
    sat_set = set(classical_solutions)

    def on_barrier(label: str, state: QuantumStateVector) -> None:
        j = int(label.split()[-1])
        p_in = state.marginal_probabilities(list(range(n)))
        curve.append({"iteration": j, "success_probability": round(float(p_in[sat].sum()) if M else 0.0, 6),
                      "theory": round(math.sin((2 * j + 1) * theta) ** 2, 6) if M else 0.0})

    t0 = time.perf_counter()
    grover.execute(gsv, on_barrier=on_barrier)
    grover_ms = (time.perf_counter() - t0) * 1000
    p_inputs = gsv.marginal_probabilities(list(range(n)))
    rng = np.random.default_rng(seed)
    samples = rng.choice(size, size=shots, p=p_inputs / p_inputs.sum())
    uniq, cnt = np.unique(samples, return_counts=True)
    order = np.argsort(-cnt)
    measured = [{"index": int(uniq[i]), "bits": format(int(uniq[i]), f"0{n}b"), "count": int(cnt[i]),
                 "satisfies": int(uniq[i]) in sat_set} for i in order[:16]]
    found = [m for m in measured if m["satisfies"]]

    def assignment(i: int) -> Dict[str, int]:
        return {v: (i >> (n - 1 - k)) & 1 for k, v in enumerate(variables)}

    rows = [{"index": i, "bits": format(i, f"0{n}b"), "value": int(values[i])} for i in range(min(size, 64))]
    anf_text = " ⊕ ".join(("1" if not m else "·".join(variables[v] for v in m)) for m in ([[]] if constant else []) + monomials) or "0"
    stats = grover.stats()

    return {
        "expression": expression,
        "normalized": _to_text(tt["tree"]),
        "variables": variables,
        "n_variables": n,
        "truth_table": rows,
        "truth_table_truncated": size > 64,
        "n_solutions": M,
        "satisfiable": M > 0,
        "tautology": M == size,
        "solutions": [{"index": i, "bits": format(i, f"0{n}b"), "assignment": assignment(i)} for i in classical_solutions[:32]],
        "oracle": {
            "diagonal_preview": [int(-1 if values[i] else 1) for i in range(min(size, 16))],
            "description": "O_f = diag((−1)^{f(x)}): flips the sign of every satisfying assignment.",
        },
        "anf": anf_text,
        "reversible_circuit": {
            "qubits": n + 1,
            "monomials": len(monomials) + (1 if constant else 0),
            "gates": compute.gate_count() - n,              # excluding the verification Hadamards
            "ops": {k2: v2 for k2, v2 in compute.count_ops().items() if k2 != "H"},
        },
        "verification": {
            "verified": verified,
            "method": f"One run of the reversible circuit on all {size} inputs in superposition reproduced "
                      f"the truth table on {'every row' if verified else 'only some rows'}.",
            "mismatches": mismatches,
        },
        "hamiltonian": ham,
        "grover": {
            "iterations": k,
            "success_probability": round(float(p_inputs[sat].sum()) if M else 0.0, 6),
            "curve": curve,
            "measured": measured,
            "found_solution": found[0] if found else None,
            "qubits": n + 1,
            "gates": stats["gates"],
            "depth": stats["depth"],
            "simulation_ms": round(grover_ms, 3),
            "shots": shots,
        },
        "classical": {"method": "Truth-table enumeration", "evaluations": size, "time_ms": round(classical_ms, 4)},
        "total_ms": round((time.perf_counter() - t_start) * 1000, 3),
        "_circuit": grover,
    }
