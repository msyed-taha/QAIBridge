"""
Module 1 – Custom Simulation Kernel
qasm.py  –  Read circuits written in OpenQASM.

OpenQASM is the standard text format for quantum circuits: Qiskit, IBM
Quantum, Cirq and Amazon Braket all export it. This reader accepts
OpenQASM 2.0 (qelib1.inc plus custom `gate` definitions, which is what
Qiskit's `qasm2.dumps` writes) and the common part of OpenQASM 3
(`qubit[n] q;`, stdgates.inc, `c = measure q;`).

The simulator measures every qubit once, at the end, so measurements are
accepted at the end of a circuit and anything that needs mid-circuit
measurement (gates after a measurement, `if`, `reset`) is refused.

Every problem is raised as a QasmError carrying the line it is on, worded
for a person rather than for a parser.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Callable, Dict, List, NamedTuple, Optional, Sequence, Tuple, Union

from .circuit import QuantumCircuit
from .memory_manager import MAX_QUBITS

MAX_SOURCE_CHARS = 200_000
MAX_GATES = 5_000
# Gates × 2^qubits a single run may cost: 600 gates at 28 qubits, 2–5 minutes depending on the gates.
MAX_WORK = 600 * 2 ** 28
SECONDS_PER_GATE_AT_28 = 0.5           # slowest gate type, measured on the development machine
MAX_GATE_NESTING = 64

_UNSUPPORTED_KEYWORDS = {
    "input", "output", "const", "float", "int", "uint", "angle", "bool", "complex", "duration",
    "stretch", "let", "def", "defcal", "cal", "defcalgrammar", "for", "while", "switch", "box",
    "delay", "ctrl", "negctrl", "inv", "pow", "extern", "return", "break", "continue", "end",
    "array", "durationof", "else",
}


class QasmError(ValueError):
    """A problem in the circuit text, with the 1-based line it is on (None = the whole circuit)."""

    def __init__(self, message: str, line: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.line = line

    def __str__(self) -> str:
        return f"Line {self.line}: {self.message}" if self.line else self.message


# ──────────────────────────────────────────────────────────────────────────────
# Tokens
# ──────────────────────────────────────────────────────────────────────────────

class _Tok(NamedTuple):
    kind: str          # id, num, str, op, end
    text: str
    line: int


_TOKEN = re.compile(r"""
      (?P<space>[ \t\r\f\v]+)
    | (?P<newline>\n)
    | (?P<comment>//[^\n]*)
    | (?P<block>/\*.*?\*/)
    | (?P<str>"[^"\n]*")
    | (?P<num>(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)
    | (?P<id>[A-Za-z_πτℇ][A-Za-z0-9_]*)
    | (?P<op>->|\*\*|==|[;,()\[\]{}+\-*/^=@<>!&|~%.:$])
""", re.VERBOSE | re.DOTALL)


def _tokenize(source: str) -> List[_Tok]:
    toks: List[_Tok] = []
    line, pos = 1, 0
    while pos < len(source):
        if source.startswith("/*", pos) and source.find("*/", pos + 2) < 0:
            raise QasmError("This comment is never closed with */.", line)
        m = _TOKEN.match(source, pos)
        if not m:
            raise QasmError(f"Unexpected character '{source[pos]}'.", line)
        kind, text = m.lastgroup, m.group()
        if kind in ("str", "num", "id", "op"):
            toks.append(_Tok(kind, text, line))
        line += text.count("\n")
        pos = m.end()
    toks.append(_Tok("end", "", line))
    return toks


# ──────────────────────────────────────────────────────────────────────────────
# Angle expressions:  pi/2,  -3*pi/4,  2^-3,  sin(theta)/2 …
# ──────────────────────────────────────────────────────────────────────────────

_CONSTANTS = {"pi": math.pi, "π": math.pi, "tau": math.tau, "τ": math.tau, "euler": math.e, "ℇ": math.e}
_FUNCTIONS: Dict[str, Callable[[float], float]] = {
    "sin": math.sin, "cos": math.cos, "tan": math.tan, "exp": math.exp, "ln": math.log, "log": math.log,
    "sqrt": math.sqrt, "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "arcsin": math.asin, "arccos": math.acos, "arctan": math.atan,
}

# ('num', value) | ('var', name, line) | ('neg', e) | ('bin', op, a, b, line) | ('fn', name, e, line)
_Expr = tuple


def _evaluate(e: _Expr, env: Dict[str, float]) -> float:
    kind = e[0]
    if kind == "num":
        return e[1]
    if kind == "var":
        if e[1] not in env:
            raise QasmError(f"Unknown name '{e[1]}'. Angles can use numbers, pi and the gate's own parameters.", e[2])
        return env[e[1]]
    if kind == "neg":
        return -_evaluate(e[1], env)
    if kind == "fn":
        try:
            return _FUNCTIONS[e[1]](_evaluate(e[2], env))
        except (ValueError, OverflowError):
            raise QasmError(f"{e[1]}() can't be worked out for this value.", e[3])
    _, op, a, b, line = e
    x, y = _evaluate(a, env), _evaluate(b, env)
    try:
        if op == "+":
            r = x + y
        elif op == "-":
            r = x - y
        elif op == "*":
            r = x * y
        elif op == "/":
            r = x / y
        else:
            r = math.pow(x, y)
    except ZeroDivisionError:
        raise QasmError("Division by zero in an angle.", line)
    except (ValueError, OverflowError):
        raise QasmError("This angle can't be worked out.", line)
    if not math.isfinite(r):
        raise QasmError("This angle is too large.", line)
    return r


# ──────────────────────────────────────────────────────────────────────────────
# Gates the kernel runs directly.  name → (kernel gate, angles, qubits, angle mapping)
# ──────────────────────────────────────────────────────────────────────────────

_Native = Tuple[str, int, int, Optional[Callable[[List[float]], List[float]]]]

_NATIVE: Dict[str, _Native] = {
    "id": ("I", 0, 1, None), "i": ("I", 0, 1, None), "u0": ("I", 1, 1, lambda p: []),
    "x": ("X", 0, 1, None), "y": ("Y", 0, 1, None), "z": ("Z", 0, 1, None), "h": ("H", 0, 1, None),
    "s": ("S", 0, 1, None), "sdg": ("SDG", 0, 1, None), "t": ("T", 0, 1, None), "tdg": ("TDG", 0, 1, None),
    "sx": ("SX", 0, 1, None), "sxdg": ("SXDG", 0, 1, None),
    "rx": ("RX", 1, 1, None), "ry": ("RY", 1, 1, None), "rz": ("RZ", 1, 1, None),
    "p": ("P", 1, 1, None), "u1": ("P", 1, 1, None), "phase": ("P", 1, 1, None),
    "u": ("U", 3, 1, None), "u3": ("U", 3, 1, None), "U": ("U", 3, 1, None),
    "u2": ("U", 2, 1, lambda p: [math.pi / 2, p[0], p[1]]),
    "cx": ("CNOT", 0, 2, None), "CX": ("CNOT", 0, 2, None), "cnot": ("CNOT", 0, 2, None),
    "cy": ("CY", 0, 2, None), "cz": ("CZ", 0, 2, None), "ch": ("CH", 0, 2, None),
    "swap": ("SWAP", 0, 2, None), "iswap": ("ISWAP", 0, 2, None),
    "crx": ("CRX", 1, 2, None), "cry": ("CRY", 1, 2, None), "crz": ("CRZ", 1, 2, None),
    "cp": ("CP", 1, 2, None), "cu1": ("CP", 1, 2, None), "cphase": ("CP", 1, 2, None),
    "cu3": ("CU", 3, 2, lambda p: p + [0.0]), "cu": ("CU", 4, 2, None),
    "rxx": ("RXX", 1, 2, None), "ryy": ("RYY", 1, 2, None), "rzz": ("RZZ", 1, 2, None),
    "ccx": ("CCX", 0, 3, None), "toffoli": ("CCX", 0, 3, None), "ccz": ("CCZ", 0, 3, None),
    "cswap": ("CSWAP", 0, 3, None), "fredkin": ("CSWAP", 0, 3, None),
    "c3x": ("MCX", 0, 4, None), "c4x": ("MCX", 0, 5, None),
}

# The rest of qelib1.inc, in its own words (the exact definitions Qiskit uses).
_PRELUDE = """
gate csx a, b { h b; cu1(pi/2) a, b; h b; }
gate rccx a, b, c {
  u2(0, pi) c; u1(pi/4) c; cx b, c; u1(-pi/4) c; cx a, c;
  u1(pi/4) c; cx b, c; u1(-pi/4) c; u2(0, pi) c;
}
gate rc3x a, b, c, d {
  u2(0, pi) d; u1(pi/4) d; cx c, d; u1(-pi/4) d; u2(0, pi) d;
  cx a, d; u1(pi/4) d; cx b, d; u1(-pi/4) d; cx a, d; u1(pi/4) d; cx b, d; u1(-pi/4) d;
  u2(0, pi) d; u1(pi/4) d; cx c, d; u1(-pi/4) d; u2(0, pi) d;
}
"""


@dataclass
class _GateDef:
    params: List[str]
    args: List[str]
    body: List[Tuple[str, List[_Expr], List[str], int]]      # (gate, angles, arg names, line)
    line: int


@dataclass
class QasmProgram:
    """A parsed circuit: the kernel circuit plus a readable name for every qubit (q[0], q[1], …)."""
    circuit: QuantumCircuit
    labels: List[str]
    version: str
    measured: List[int] = field(default_factory=list)
    lines: List[int] = field(default_factory=list)          # the source line of each gate, in order

    @property
    def n_qubits(self) -> int:
        return self.circuit.n_qubits

    def signature(self) -> Tuple:
        """The gate list, for telling whether two texts describe the same circuit."""
        return tuple((op.gate, tuple(op.qubits), tuple(round(p, 12) for p in op.params))
                     for op in self.circuit.operations)


_Arg = Union[int, List[int]]


class _Parser:
    def __init__(self, source: str, *, builtins: bool = True):
        self.toks = _tokenize(source)
        self.i = 0
        self.version = "2.0"
        self.qregs: Dict[str, Tuple[int, int]] = {}      # name → (first qubit, size)
        self.cregs: Dict[str, int] = {}
        self.labels: List[str] = []
        self.gates: Dict[str, _GateDef] = {}
        self.ops: List[Tuple[str, List[int], List[float], int]] = []
        self.measured: Dict[int, int] = {}               # qubit → line it was measured on
        self.n_gates = 0
        if builtins:
            prelude = _Parser(_PRELUDE, builtins=False)
            prelude.parse()
            self.gates.update(prelude.gates)
            for d in self.gates.values():
                d.line = 0

    # ── token helpers ──────────────────────────────────────────────────────

    @property
    def tok(self) -> _Tok:
        return self.toks[self.i]

    def next(self) -> _Tok:
        t = self.toks[self.i]
        self.i += 1
        return t

    def accept(self, text: str) -> bool:
        if self.tok.text == text and self.tok.kind != "str":
            self.i += 1
            return True
        return False

    def expect(self, text: str, what: str = "") -> _Tok:
        if self.tok.text != text or self.tok.kind == "str":
            shown = f"'{self.tok.text}'" if self.tok.kind != "end" else "the end of the circuit"
            raise QasmError(f"Expected '{text}'{what}, found {shown}.", self._line())
        return self.next()

    def ident(self, what: str) -> _Tok:
        if self.tok.kind != "id":
            shown = f"'{self.tok.text}'" if self.tok.kind != "end" else "the end of the circuit"
            raise QasmError(f"Expected {what}, found {shown}.", self._line())
        return self.next()

    def integer(self, what: str) -> int:
        t = self.tok
        if t.kind != "num" or not t.text.isdigit():
            raise QasmError(f"Expected {what} (a whole number), found '{t.text}'.", self._line())
        self.i += 1
        return int(t.text)

    def _line(self) -> int:
        # A missing ';' is reported on the line of the statement it ends, not the next one.
        if self.tok.kind == "end" and self.i > 0:
            return self.toks[self.i - 1].line
        return self.tok.line

    def semicolon(self) -> None:
        if self.tok.text != ";":
            line = self.toks[self.i - 1].line if self.i else self.tok.line
            raise QasmError("Missing ';' at the end of this line.", line)
        self.i += 1

    # ── program ───────────────────────────────────────────────────────────

    def parse(self) -> None:
        if self.tok.text == "OPENQASM":
            self.next()
            v = self.tok
            if v.kind != "num" or not v.text.split(".")[0] in ("2", "3"):
                raise QasmError("This simulator reads OpenQASM 2 and 3. Start with 'OPENQASM 2.0;'.", v.line)
            self.version = v.text if "." in v.text else v.text + ".0"
            self.next()
            self.semicolon()
        while self.tok.kind != "end":
            self.statement()

    def statement(self) -> None:
        t = self.tok
        word = t.text
        if t.kind == "op" and word == ";":
            self.next()
            return
        if t.kind != "id":
            raise QasmError(f"Unexpected '{word}'.", t.line)
        if word == "OPENQASM":
            raise QasmError("'OPENQASM' can only be the first line.", t.line)
        if word == "include":
            self.next()
            f = self.tok
            if f.kind != "str":
                raise QasmError('Write the file name in quotes, e.g. include "qelib1.inc";', f.line)
            self.next()
            if f.text.strip('"') not in ("qelib1.inc", "stdgates.inc"):
                raise QasmError(f"Can't include {f.text}. Only qelib1.inc and stdgates.inc are built in; "
                                "paste the gate definitions into the circuit instead.", f.line)
            self.semicolon()
        elif word in ("qreg", "creg"):
            self.next()
            name = self.ident("a register name").text
            self.expect("[", " after the register name")
            size = self.integer("the register size")
            self.expect("]")
            self.semicolon()
            self.declare(word == "qreg", name, size, t.line)
        elif word in ("qubit", "bit"):
            self.next()
            size = 1
            single = True
            if self.accept("["):
                size = self.integer("the register size")
                self.expect("]")
                single = False
            name = self.ident("a register name").text
            self.declare(word == "qubit", name, size, t.line, single=single)
            if word == "bit" and self.accept("="):
                self.expect("measure", " (a bit can only be set by measuring)")
                self.measure(self.argument(), t.line)
            self.semicolon()
        elif word == "gate":
            self.gate_definition()
        elif word == "measure":
            self.next()
            target = self.argument()
            if self.accept("->"):
                self.classical_argument()
            self.semicolon()
            self.measure(target, t.line)
        elif word == "barrier":
            self.next()
            if self.tok.text != ";":
                self.argument_list()
            self.semicolon()
        elif word == "reset":
            raise QasmError("'reset' isn't supported yet. Every qubit starts at 0, and all of them are "
                            "measured once at the end.", t.line)
        elif word == "if":
            raise QasmError("'if' isn't supported yet: the simulator measures every qubit only once, at the end.",
                            t.line)
        elif word == "opaque":
            raise QasmError("An opaque gate has no definition, so it can't be simulated.", t.line)
        elif word in _UNSUPPORTED_KEYWORDS:
            raise QasmError(f"'{word}' isn't supported. This simulator reads OpenQASM 2 circuits and the "
                            "simple parts of OpenQASM 3.", t.line)
        elif word in self.cregs:
            self.next()
            if self.accept("["):
                self.integer("a bit number")
                self.expect("]")
            self.expect("=", " (only 'c = measure q;' can set classical bits)")
            self.expect("measure", " (only 'c = measure q;' can set classical bits)")
            target = self.argument()
            self.semicolon()
            self.measure(target, t.line)
        else:
            self.gate_call()

    def declare(self, quantum: bool, name: str, size: int, line: int, single: bool = False) -> None:
        if name in self.qregs or name in self.cregs:
            raise QasmError(f"'{name}' is already declared.", line)
        if size < 1:
            raise QasmError("A register needs at least 1 bit.", line)
        if not quantum:
            self.cregs[name] = size
            return
        start = len(self.labels)
        if start + size > MAX_QUBITS:
            raise QasmError(f"This simulator runs up to {MAX_QUBITS} qubits; this register brings the total "
                            f"to {start + size}.", line)
        self.qregs[name] = (start, size)
        self.labels += [name] if single else [f"{name}[{k}]" for k in range(size)]

    # ── arguments ─────────────────────────────────────────────────────────

    def argument(self) -> _Arg:
        t = self.ident("a qubit, such as q[0]")
        name = t.text
        if name not in self.qregs:
            if name in self.cregs:
                raise QasmError(f"'{name}' holds classical bits; gates and measurements need qubits.", t.line)
            raise QasmError(f"Unknown register '{name}'. Declare it first, e.g. qreg {name}[2];", t.line)
        start, size = self.qregs[name]
        if self.accept("["):
            k = self.integer("a qubit number")
            self.expect("]")
            if k >= size:
                raise QasmError(f"{name}[{k}] doesn't exist: '{name}' has {size} qubit{'s' * (size != 1)} "
                                f"({name}[0] to {name}[{size - 1}]).", t.line)
            return start + k
        return list(range(start, start + size))

    def classical_argument(self) -> None:
        t = self.ident("a classical bit, such as c[0]")
        if t.text not in self.cregs:
            raise QasmError(f"Unknown classical register '{t.text}'. Declare it first, e.g. creg {t.text}[2];", t.line)
        if self.accept("["):
            k = self.integer("a bit number")
            self.expect("]")
            if k >= self.cregs[t.text]:
                raise QasmError(f"{t.text}[{k}] doesn't exist: '{t.text}' has {self.cregs[t.text]} bits.", t.line)

    def argument_list(self) -> List[_Arg]:
        args = [self.argument()]
        while self.accept(","):
            args.append(self.argument())
        return args

    def measure(self, target: _Arg, line: int) -> None:
        for q in (target if isinstance(target, list) else [target]):
            self.measured.setdefault(q, line)

    # ── expressions ───────────────────────────────────────────────────────

    def expression(self) -> _Expr:
        e = self.term()
        while self.tok.text in ("+", "-") and self.tok.kind == "op":
            op, line = self.next().text, self.tok.line
            e = ("bin", op, e, self.term(), line)
        return e

    def term(self) -> _Expr:
        e = self.unary()
        while self.tok.text in ("*", "/") and self.tok.kind == "op":
            op, line = self.next().text, self.tok.line
            e = ("bin", op, e, self.unary(), line)
        return e

    def unary(self) -> _Expr:
        if self.accept("-"):
            return ("neg", self.unary())
        if self.accept("+"):
            return self.unary()
        return self.power()

    def power(self) -> _Expr:
        base = self.atom()
        if self.tok.text in ("^", "**") and self.tok.kind == "op":
            line = self.next().line
            return ("bin", "^", base, self.unary(), line)
        return base

    def atom(self) -> _Expr:
        t = self.tok
        if t.kind == "num":
            self.next()
            return ("num", float(t.text))
        if t.kind == "id":
            self.next()
            if t.text in _FUNCTIONS and self.tok.text == "(":
                self.next()
                e = self.expression()
                self.expect(")")
                return ("fn", t.text, e, t.line)
            if t.text in _CONSTANTS:
                return ("num", _CONSTANTS[t.text])
            return ("var", t.text, t.line)
        if self.accept("("):
            e = self.expression()
            self.expect(")")
            return e
        shown = f"'{t.text}'" if t.kind != "end" else "the end of the circuit"
        raise QasmError(f"Expected an angle, such as pi/2, found {shown}.", self._line())

    def angle_list(self) -> List[_Expr]:
        if not self.accept("("):
            return []
        if self.accept(")"):
            return []
        out = [self.expression()]
        while self.accept(","):
            out.append(self.expression())
        self.expect(")", " to close the angles")
        return out

    # ── gates ─────────────────────────────────────────────────────────────

    def gate_definition(self) -> None:
        line = self.next().line
        name = self.ident("a gate name").text
        params: List[str] = []
        if self.accept("("):
            if not self.accept(")"):
                params.append(self.ident("a parameter name").text)
                while self.accept(","):
                    params.append(self.ident("a parameter name").text)
                self.expect(")")
        args = [self.ident("a qubit name for the gate").text]
        while self.accept(","):
            args.append(self.ident("a qubit name for the gate").text)
        if len(set(args)) != len(args):
            raise QasmError(f"Gate '{name}' names the same qubit twice.", line)
        self.expect("{", " to start the gate's body")
        body = []
        while not self.accept("}"):
            t = self.tok
            if t.kind == "end":
                raise QasmError(f"Gate '{name}' is never closed with '}}'.", line)
            if t.text == "barrier":
                self.next()
                while self.tok.text != ";" and self.tok.kind != "end":
                    self.next()
                self.semicolon()
                continue
            if t.text == "gphase":
                self.next()
                self.angle_list()
                self.semicolon()
                continue                     # a global phase changes nothing measurable
            call = self.ident("a gate").text
            if call in _UNSUPPORTED_KEYWORDS:
                raise QasmError(f"'{call}' isn't supported inside a gate.", t.line)
            if call not in self.gates and call not in _NATIVE:
                raise QasmError(f"Unknown gate '{call}'. A gate can only use gates defined before it.", t.line)
            angles = self.angle_list()
            used = [self.ident("one of the gate's qubits").text]
            while self.accept(","):
                used.append(self.ident("one of the gate's qubits").text)
            for u in used:
                if u not in args:
                    raise QasmError(f"'{u}' isn't one of gate '{name}'s qubits ({', '.join(args)}).", t.line)
            self.semicolon()
            body.append((call, angles, used, t.line))
        self.gates[name] = _GateDef(params, args, body, line)

    def gate_call(self) -> None:
        t = self.next()
        name = t.text
        if self.tok.text == "@":
            raise QasmError("Gate modifiers (ctrl @, inv @, pow @) aren't supported yet.", t.line)
        if name == "gphase":
            self.angle_list()
            self.semicolon()
            return
        if name not in self.gates and name not in _NATIVE:
            raise QasmError(f"Unknown gate '{name}'. Define it with a 'gate' block, or use a standard gate "
                            "such as h, x, cx or rz.", t.line)
        angles = [_evaluate(e, {}) for e in self.angle_list()]
        args = self.argument_list()
        self.semicolon()
        sizes = {len(a) for a in args if isinstance(a, list)}
        if len(sizes) > 1:
            raise QasmError("Registers of different sizes can't be paired up in one gate.", t.line)
        reps = sizes.pop() if sizes else 1
        for k in range(reps):
            qubits = [a[k] if isinstance(a, list) else a for a in args]
            self.apply(name, angles, qubits, t.line, depth=0)

    def apply(self, name: str, angles: List[float], qubits: List[int], line: int, depth: int,
              at: Optional[int] = None) -> None:
        """
        Add one gate. `line` is the line of the call in the circuit; `at` is the line inside a
        gate definition being expanded. A mistake in a definition is reported where it is written,
        a mistake in how the circuit uses its qubits where the circuit uses them.
        """
        here = at or line
        if len(set(qubits)) != len(qubits):
            raise QasmError(f"'{name}' can't use the same qubit twice ({self.labels[qubits[0]]}).", here)
        if depth > MAX_GATE_NESTING:
            raise QasmError("Gate definitions are nested too deeply.", here)
        if name in self.gates:
            d = self.gates[name]
            if len(angles) != len(d.params):
                raise QasmError(f"'{name}' takes {_count(len(d.params), 'angle')}, got {len(angles)}.", here)
            if len(qubits) != len(d.args):
                raise QasmError(f"'{name}' acts on {_count(len(d.args), 'qubit')}, got {len(qubits)}.", here)
            env = dict(zip(d.params, angles))
            where = dict(zip(d.args, qubits))
            for call, exprs, used, body_line in d.body:
                inner = body_line if d.line else None          # built-in definitions have no line of their own
                try:
                    values = [_evaluate(e, env) for e in exprs]
                except QasmError as err:
                    raise QasmError(err.message, inner or line)
                self.apply(call, values, [where[u] for u in used], line, depth + 1, at=inner)
            return
        kernel, n_angles, n_qubits, convert = _NATIVE[name]
        if len(angles) != n_angles:
            raise QasmError(f"'{name}' takes {_count(n_angles, 'angle')}, got {len(angles)}.", here)
        if len(qubits) != n_qubits:
            raise QasmError(f"'{name}' acts on {_count(n_qubits, 'qubit')}, got {len(qubits)}.", here)
        for q in qubits:
            if q in self.measured:
                raise QasmError(f"{self.labels[q]} is used after it was measured (line {self.measured[q]}). "
                                "The simulator measures every qubit once, at the end.", line)
        self.n_gates += 1
        if self.n_gates > MAX_GATES:
            raise QasmError(f"This circuit has more than {MAX_GATES:,} gates, the most one run can take.", line)
        self.ops.append((kernel, qubits, convert(angles) if convert else angles, line))


def _count(n: int, word: str) -> str:
    return f"{n} {word}{'s' * (n != 1)}"


def parse_qasm(source: str) -> QasmProgram:
    """Turn OpenQASM text into a kernel circuit. Raises QasmError with the line of any problem."""
    if len(source) > MAX_SOURCE_CHARS:
        raise QasmError(f"This circuit is too long ({len(source):,} characters; the limit is {MAX_SOURCE_CHARS:,}).")
    p = _Parser(source)
    p.parse()
    n = len(p.labels)
    if n == 0:
        raise QasmError("Declare at least one qubit, e.g. qreg q[2];  (or qubit[2] q; in OpenQASM 3)")
    work = len(p.ops) * 2 ** n
    if work > MAX_WORK:
        minutes = len(p.ops) * 2 ** n / 2 ** 28 * SECONDS_PER_GATE_AT_28 / 60
        raise QasmError(f"{len(p.ops):,} gates on {n} qubits is too much for one run (about {minutes:,.0f} minutes). "
                        "Use fewer qubits or fewer gates.")
    circuit = QuantumCircuit(n, "Your circuit", max_gates=MAX_GATES + 1)
    for kernel, qubits, angles, line in p.ops:
        try:
            circuit._add(kernel, qubits, angles)
        except (ValueError, IndexError, RuntimeError) as e:     # should never happen; keep the line anyway
            raise QasmError(str(e), line)
    return QasmProgram(circuit=circuit, labels=p.labels, version=p.version, measured=sorted(p.measured),
                       lines=[line for *_, line in p.ops])
