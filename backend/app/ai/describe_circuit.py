"""
Describe a circuit — the Circuit Builder's AI box.

The person says what they want in words ("three qubits that are all 0 or all
1"), or a change to the circuit on their canvas. Claude writes the whole
circuit with the Builder's own gates, and the chances it expects. Then the app
checks it: the gates must be ones the Builder has, on wires that exist, and the
simulator runs the circuit and compares its real chances with the AI's. The
page shows whether they agree, so a wrong answer is caught, never hidden.
"""
from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, List, Optional

from . import service as ai

log = logging.getLogger(__name__)

FEATURE = "describe_circuit"
MAX_QUBITS = 6
MAX_GATES = 120             # the Builder's own limit (routers/education.py)
TOLERANCE = 0.02            # how far apart (in total) the expected and real chances may be and still agree

ONE = {"H", "X", "Y", "Z", "S", "T", "SDG", "TDG", "SX"}
ROTATIONS = {"RX", "RY", "RZ", "P"}
ARITY = {**{g: 1 for g in ONE | ROTATIONS}, "CNOT": 2, "CZ": 2, "SWAP": 2, "CCX": 3}
ALIASES = {"CX": "CNOT", "TOFFOLI": "CCX", "CCNOT": "CCX", "S†": "SDG", "SDAG": "SDG", "T†": "TDG", "TDAG": "TDG",
           "√X": "SX", "SQRTX": "SX", "PHASE": "P", "U1": "P"}

SYSTEM_PROMPT = f"""You write circuits for QAIbridge's Circuit Builder.
The data block holds the person's description and the circuit on their canvas now (if any). If they ask for a change
to their circuit, return the whole changed circuit; otherwise build a new one.

Reply with ONE JSON object and nothing else:
{{"on_topic": true, "redirect": "", "qubits": 2,
 "gates": [{{"gate": "H", "qubits": [0]}}, {{"gate": "CNOT", "qubits": [0, 1]}}],
 "expected": {{"00": 0.5, "11": 0.5}},
 "explanation": "..."}}

qubits: how many wires, 1 to {MAX_QUBITS}. Every qubit starts as |0⟩, and all of them are measured at the end.
gates: in time order, at most {MAX_GATES}; keep the circuit short, but never do less than they ask for.
Only these gates exist:
  H, X, Y, Z, S, T, SDG, TDG, SX     "qubits": [q]
  RX, RY, RZ, P                      "qubits": [q] and "angle" in radians: a number or text such as "pi/2" or "3*pi/4"
  CNOT, CZ                           "qubits": [control, target]
  SWAP                               "qubits": [a, b]
  CCX (Toffoli)                      "qubits": [control1, control2, target]
expected: the chance of each outcome when every qubit is measured. Write each outcome with q0 first: on 2 qubits
"10" means q0 = 1 and q1 = 0. List only outcomes with a chance above 0; the chances add up to 1. Work them out
carefully before you answer, because the simulator checks them.
explanation: plain English, at most 60 words: what the circuit does, gate by gate if short, and why it gives those
chances. No headings.

If they ask for something the Builder can't do (more than {MAX_QUBITS} qubits, a measurement in the middle, a gate not in
the list), build the closest circuit it can and say in the explanation what is different.
If the text isn't about a quantum circuit at all, reply {{"on_topic": false, "redirect": "one polite sentence on what
this box does, with an example"}}."""


def _material(text: str, current_qasm: str) -> str:
    parts = ["Their description:\n" + text.strip()]
    qasm = current_qasm.strip()
    parts.append("The circuit on their canvas now (OpenQASM):\n" + qasm[:4000] if qasm else "Their canvas is empty.")
    return "\n\n".join(parts)


# ── Reading the AI's circuit ──────────────────────────────────────────────────

def angle_from(value: Any) -> float:
    """An angle as written: 0.5, "pi/2", "-3*pi/4", "2pi/3", "(pi+1)/2" → radians. Raises ValueError."""
    if isinstance(value, bool):
        raise ValueError("not an angle")
    if isinstance(value, (int, float)):
        v = float(value)
    else:
        text = str(value).strip().lower().replace("π", "pi").replace("−", "-")
        if not text or len(text) > 40:
            raise ValueError("not an angle")
        tokens = re.findall(r"\d*\.?\d+|pi|\S", text)
        i = 0

        def factor() -> float:
            nonlocal i
            t = tokens[i] if i < len(tokens) else None
            i += 1
            if t == "-":
                return -factor()
            if t == "+":
                return factor()
            if t == "pi":
                return math.pi
            if t == "(":
                v = total()
                if i >= len(tokens) or tokens[i] != ")":
                    raise ValueError("not an angle")
                i += 1
                return v
            if t is not None and re.fullmatch(r"\d*\.?\d+", t):
                return float(t)
            raise ValueError("not an angle")

        def product() -> float:
            nonlocal i
            v = factor()
            while i < len(tokens):
                t = tokens[i]
                if t in ("*", "/"):
                    i += 1
                    rhs = factor()
                    if t == "/" and rhs == 0:
                        raise ValueError("not an angle")
                    v = v * rhs if t == "*" else v / rhs
                elif t in ("pi", "("):                 # 2pi, 3(pi/4)
                    v *= factor()
                else:
                    break
            return v

        def total() -> float:
            nonlocal i
            v = product()
            while i < len(tokens) and tokens[i] in ("+", "-"):
                sign = 1 if tokens[i] == "+" else -1
                i += 1
                v += sign * product()
            return v

        v = total()
        if i != len(tokens):
            raise ValueError("not an angle")
    if not math.isfinite(v) or abs(v) > 1000:
        raise ValueError("not an angle")
    return v


def _is_int(x: Any) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _gate(raw: Any, n: int, i: int) -> Dict[str, Any]:
    where = f"gate {i + 1}"
    if not isinstance(raw, dict):
        raise ValueError(f"{where} isn't a gate")
    name = str(raw.get("gate") or "").strip().upper()
    name = ALIASES.get(name, name)
    if name not in ARITY:
        raise ValueError(f"{where}: the Builder has no {name or 'unnamed'} gate")
    qs = raw.get("qubits")
    if _is_int(qs):
        qs = [qs]
    if (not isinstance(qs, list) or len(qs) != ARITY[name] or not all(_is_int(q) and 0 <= q < n for q in qs)
            or len(set(qs)) != len(qs)):
        raise ValueError(f"{where} ({name}) needs {ARITY[name]} different qubits from q0 to q{n - 1}")
    gate: Dict[str, Any] = {"gate": name, "qubits": qs}
    if name in ROTATIONS:
        if raw.get("angle") is None:
            raise ValueError(f"{where} ({name}) has no angle")
        gate["angle"] = angle_from(raw["angle"])
    return gate


def _expected(raw: Any, n: int) -> Optional[Dict[str, float]]:
    """The chances the AI expects, keyed like the simulator's outcomes (q0 first). None when they can't be used."""
    if not isinstance(raw, dict) or not raw:
        return None
    out: Dict[str, float] = {}
    for key, value in raw.items():
        label = re.sub(r"[|⟩>\s]", "", str(key))
        if (len(label) != n or set(label) - {"0", "1"} or isinstance(value, bool)
                or not isinstance(value, (int, float)) or value < 0):
            return None
        out[label] = out.get(label, 0.0) + float(value)
    total = sum(out.values())
    if not (0.95 <= total <= 1.05 or 95 <= total <= 105):        # chances, or percentages
        return None
    return {k: v / total for k, v in out.items() if v > 0}


def read_circuit(text: str) -> Dict[str, Any]:
    """The AI's answer, checked: a circuit the Builder can draw, or a polite redirect. Raises ValueError."""
    data = ai.json_from(text)
    if data.get("on_topic") is False:
        message = str(data.get("redirect") or "").strip()[:300]
        return {"off_topic": True, "message": message or "This box builds quantum circuits. Try “a Bell pair”."}
    n = data.get("qubits")
    if not _is_int(n) or not 1 <= n <= MAX_QUBITS:
        raise ValueError(f"the circuit needs 1 to {MAX_QUBITS} qubits")
    raw = data.get("gates")
    if not isinstance(raw, list) or len(raw) > MAX_GATES:
        raise ValueError(f"the gates must be a list of at most {MAX_GATES}")
    gates = [_gate(g, n, i) for i, g in enumerate(raw)]
    return {
        "off_topic": False, "n": n, "gates": gates,
        "expected": _expected(data.get("expected"), n),
        # kets written the way the rest of the page writes them: |101⟩, not |101>
        "explanation": re.sub(r"\|([^|<>\s]{1,8})>", "|\\1⟩", str(data.get("explanation") or "").strip()[:700]),
    }


def layout(n: int, gates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """The Builder's drawing: each gate in the first step after the gates before it on its wires (and the wires its line crosses)."""
    free = [0] * n
    placed = []
    for g in gates:
        qs = g["qubits"]
        lo, hi = min(qs), max(qs)
        col = max(free[lo:hi + 1])
        free[lo:hi + 1] = [col + 1] * (hi - lo + 1)
        placed.append({"gate": g["gate"], "col": col, "target": qs[-1], "controls": qs[:-1],
                       **({"angle": g["angle"]} if "angle" in g else {})})
    return {"n": n, "gates": placed}


def compare(expected: Optional[Dict[str, float]], probs: Dict[str, float]) -> Dict[str, Any]:
    """Do the AI's chances match what the simulator really gives? `matches` is None when the AI gave none."""
    got = {k: p for k, p in probs.items() if p > 1e-6}

    def ranked(d: Dict[str, float]) -> List[Dict[str, Any]]:
        # equal chances in the usual order (000, 001, …), not in the order of rounding noise
        return [{"outcome": k, "chance": round(v, 4)} for k, v in sorted(d.items(), key=lambda kv: (-round(kv[1], 4), kv[0]))]

    if expected is None:
        return {"matches": None, "expected": [], "got": ranked(got)}
    gap = 0.5 * sum(abs(expected.get(k, 0.0) - got.get(k, 0.0)) for k in set(expected) | set(got))
    return {"matches": gap <= TOLERANCE, "expected": ranked(expected), "got": ranked(got)}


def describe(text: str, current_qasm: str, *, user_id: Optional[int]) -> Dict[str, Any]:
    """The AI's circuit for this description, checked. Raises ai.AIUnavailable when the AI can't give a usable one."""
    if ai.looks_like_gibberish(text):
        raise ai.AIUnavailable("rejected", "That doesn't look like a description. Try a few words, such as “a Bell pair”.")
    # Thinking first: without it, circuits such as a W state or a QFT came out wrong or cut off.
    answer = ai.ask(FEATURE, SYSTEM_PROMPT, _material(text, current_qasm), user_id=user_id, max_tokens=8000, think=True)
    try:
        return read_circuit(answer.text)
    except ValueError as e:
        ai.discard(answer)                      # ask again next time, rather than repeat an unusable answer
        log.warning("Unusable circuit from the AI: %s", e)
        raise ai.AIUnavailable("error", "The AI wrote a circuit the Builder can't use. Try saying it another way.") from e
