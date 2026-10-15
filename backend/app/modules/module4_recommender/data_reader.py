"""
AI Advisor — the data to solve, read from the user's problem (FE-3).

After the Advisor has picked the algorithm, "Solve it here" needs the problem's
actual data: the list and the item to find, the records and the query, the
number to factor, the cities, or the items and limits of an optimisation. It is
read from the description (and the uploaded file's lines, when there is one):

  • by the AI, with Code to Quantum's reader, which also understands problems
    described in plain English;
  • otherwise by built-in rules for the four SFOD problems (lists, quoted
    targets, comparisons such as "age > 40", numbers, known city names).

When the problem gives no usable data (e.g. "factor an RSA-2048 key"), a small
example of the same kind is used instead, and that is always said: nothing is
presented as the user's data unless it came from their words or their file.
The result is a Code to Quantum spec, which the user can edit before solving.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from ...ai import service as ai
from ..module2_sfod.grover import MAX_GROVER_QUBITS
from ..module2_sfod.shor import MAX_SHOR_N
from ..module2_sfod.suite import MAX_TSP_CITIES, synthetic_records
from ..module5_transformer.analyzer import ALGORITHM_FOR, analyze_code
from ..module5_transformer.bridge import KNOWN_CITIES, parse_city_line
from ..module5_transformer.examples import EXAMPLES
from ..module5_transformer.llm import LLMError, analyze_with_llm

MAX_ITEMS = 2 ** MAX_GROVER_QUBITS               # 65,536: what the simulator's search holds
QAOA_KINDS = ("knapsack", "maxcut", "partition", "portfolio")
KINDS = ("search", "database", "factoring", "tsp", "qaoa")
LABELS = {"search": "search", "database": "database query", "factoring": "factoring", "tsp": "route",
          "qaoa": "optimisation", "knapsack": "knapsack", "maxcut": "max-cut", "partition": "partitioning",
          "portfolio": "portfolio", "boolean": "logic"}

EXAMPLE_ITEMS = ["Aisha", "Bilal", "Chen", "Diana", "Emeka", "Fatima", "George", "Hana",
                 "Iqbal", "Jade", "Kamran", "Layla", "Musa", "Nadia", "Omar", "Priya"]
EXAMPLE_CITIES = ["Islamabad", "Lahore", "Karachi", "Peshawar"]


def solve_kind(qid: str, routing: bool) -> Optional[str]:
    """Which SFOD problem the Advisor's choice is solved as (None: not one the suite solves)."""
    if qid == "qaoa":
        return "tsp" if routing else "qaoa"
    return {"grovers": "search", "amplitude_amp": "database", "shors": "factoring"}.get(qid)


def _fits(spec_kind: str, wanted: str) -> bool:
    if wanted == "qaoa":
        return spec_kind in QAOA_KINDS or spec_kind == "tsp"
    if wanted in ("search", "database"):
        return spec_kind in ("search", "database", "boolean")
    return spec_kind == wanted


def _spec(kind: str, parameters: Dict[str, Any], engine: str, explanation: str) -> Dict[str, Any]:
    return {"problem_type": kind, "parameters": parameters, "quantum_algorithm": ALGORITHM_FOR[kind],
            "engine": engine, "explanation": explanation, "confidence": 1.0, "evidence": []}


# ── Built-in rules ───────────────────────────────────────────────────────────

_QUOTED = re.compile(r"[\"“'‘]([^\"”'’\n]{1,80})[\"”'’]")
_LIST = re.compile(r"([^\s,:;.][^,:;\n]{0,40}(?:,\s*[^,:;\n]{1,40}){2,})")
_FIND = re.compile(r"\b(?:find|search(?:ing)? for|look(?:ing)? for|locate|where is|is there)\s+(?:the\s+|a\s+|an\s+)?([\w'-]+)", re.I)


def _clean_item(s: str) -> str:
    return re.sub(r"^(?:and|or)\s+", "", s.strip().strip(".!?"), flags=re.I).strip()


def _list_in(text: str) -> List[str]:
    """The longest comma-separated list in the text ("Alice, Bob and Grace")."""
    best: List[str] = []
    for m in _LIST.finditer(text):
        parts = [p for p in (_clean_item(x) for x in re.split(r",|\band\b", m.group(1))) if p]
        if len(parts) > len(best) and all(len(p.split()) <= 4 for p in parts):
            best = parts
    return best


def _target(text: str, items: List[str]) -> str:
    lower = {i.lower(): i for i in items}
    for m in _QUOTED.finditer(text):
        if not items or m.group(1).strip().lower() in lower:
            return m.group(1).strip()
    for m in _FIND.finditer(text):
        word = m.group(1)
        if word.lower() in lower:
            return lower[word.lower()]
    return ""


_COMPARE = re.compile(r"\b([A-Za-z][\w ]{0,20}?)\s*(>=|<=|!=|>|<|=)\s*(-?\d+(?:\.\d+)?)")
_OLDER = re.compile(r"\b(older than|over|above|more than)\s+(\d+)\b", re.I)
_YOUNGER = re.compile(r"\b(younger than|under|below|less than)\s+(\d+)\b", re.I)
_WITH = re.compile(r"\b(?:with|whose|who (?:are|is)|named|called|in the|in)\s+(?:the\s+)?([A-Z][\w-]+)")


def _query(text: str) -> str:
    m = _COMPARE.search(text)
    if m:
        return f"{m.group(1).strip()} {m.group(2)} {m.group(3)}"
    about_age = re.search(r"\b(?:age|aged|years? old)\b", text, re.I)
    for pattern, op, age_words in ((_OLDER, ">", "older than"), (_YOUNGER, "<", "younger than")):
        if (m := pattern.search(text)) and (about_age or m.group(1).lower() == age_words):
            return f"age {op} {m.group(2)}"
    if (m := _QUOTED.search(text)):
        return m.group(1).strip()
    if (m := _WITH.search(text)):
        return m.group(1)
    return ""


_NOT_A_NUMBER_END = r"(?!\.\d|\w|,\d|\s*-?\s*bits?\b)"      # not a decimal, a longer word or a key size ("2048-bit")
_NUMBER = re.compile(r"(?<![\w.,-])(\d{2,13})" + _NOT_A_NUMBER_END, re.I)
_FACTOR = re.compile(r"\b(?:factor(?:i[sz]e|ing)?|split|decompose|break(?:ing)?)\b\D{0,30}?(\d{2,13})" + _NOT_A_NUMBER_END, re.I)


def _number(text: str) -> Optional[int]:
    text = re.sub(r"\bRSA-?\d+", "RSA", text, flags=re.I)     # a key size, not the number
    text = re.sub(r"(?<=\d),(?=\d{3}\b)", "", text)             # 1,000,003 → 1000003
    if (m := _FACTOR.search(text)):
        return int(m.group(1))
    nums = [int(x) for x in _NUMBER.findall(text)]
    nums = [n for n in nums if n >= 4]
    return nums[0] if len(nums) == 1 else None


def _cities(text: str, lines: List[str]) -> List[str]:
    """Places with coordinates given in the file, else known city names in the order they appear."""
    given = [ln for ln in lines if parse_city_line(ln)[1] is not None]
    if len(given) >= 3:
        return given
    found: List[Tuple[int, str]] = []
    for name in KNOWN_CITIES:
        m = re.search(rf"\b{re.escape(name)}\b", text, re.I)
        if m:
            found.append((m.start(), name.title()))
    return [name for _, name in sorted(found)]


def _builtin(kind: str, text: str, lines: List[str]) -> Tuple[Dict[str, Any], bool, List[str]]:
    """(spec, from_the_problem, notes) by the built-in rules."""
    notes: List[str] = []
    if kind == "search" and lines and any(sep in lines[0] for sep in ("·", ",", "\t", "|")):
        spec, ok, notes = _builtin("database", text, lines)
        notes.insert(0, "Your file is a table, so finding records in it is solved as a query: amplitude amplification "
                        "is Grover's search for any number of matching records.")
        return spec, ok, notes
    if kind == "search":
        items = lines if len(lines) >= 2 else _list_in(text)
        if len(items) >= 2:
            target = _target(text, items)
            if not target:
                notes.append("Say which item to find: type it in the box.")
            return _spec("search", {"items": items[:MAX_ITEMS], "target": target}, "local",
                         f"A list of {len(items):,} items, read from your {'file' if lines else 'problem'}."), True, notes
        return _spec("search", {"items": EXAMPLE_ITEMS, "target": "Fatima"}, "local",
                     "A small list of names, as an example."), False, notes
    if kind == "database":
        records = lines if lines else [ln.strip() for ln in text.splitlines() if re.search(r"[,|·;\t-]", ln) and len(ln.split()) >= 2]
        query = _query(text)
        if len(records) >= 2:
            if not query:
                notes.append("Say what to look for: type a keyword, or a comparison such as age > 40, in the query box.")
            return _spec("database", {"records": records[:MAX_ITEMS], "query": query}, "local",
                         f"{len(records):,} records, read from your {'file' if lines else 'problem'}."), True, notes
        return _spec("database", {"records": synthetic_records(32), "query": query or "Research"}, "local",
                     "A small table of 32 employees, as an example."), False, notes
    if kind == "factoring":
        n = _number(text)
        if n is not None:
            return _spec("factoring", {"N": n}, "local", f"The number {n:,}, read from your problem."), True, notes
        return _spec("factoring", {"N": 91}, "local", "The number 91 = 7 × 13, as an example."), False, notes
    if kind == "tsp":
        cities = _cities(text, lines)
        if len(cities) >= 3:
            if len(cities) > MAX_TSP_CITIES:
                notes.append(f"Your route has {len(cities)} stops; the quantum side can simulate up to {MAX_TSP_CITIES} "
                             f"({(MAX_TSP_CITIES - 1) ** 2} qubits), so this uses the first {MAX_TSP_CITIES}. "
                             "Edit the list to choose which.")
            return _spec("tsp", {"cities": cities[:MAX_TSP_CITIES]}, "local",
                         f"{min(len(cities), MAX_TSP_CITIES)} cities, read from your {'file' if lines else 'problem'}."), True, notes
        return _spec("tsp", {"cities": EXAMPLE_CITIES}, "local", "Four cities in Pakistan, as an example."), False, notes
    # other optimisation problems: the built-in rules can't read them from plain words, so a worked example is used
    text_l = text.lower()
    sharing = re.search(r"schedul|assign|split|balanc|share|divide|oven|machine|worker", text_l)
    pick = next((k for k in QAOA_KINDS if k in text_l or (k == "maxcut" and "cut" in text_l)
                 or (k == "knapsack" and "budget" in text_l) or (k == "partition" and sharing)), "knapsack")
    example = next(ex for ex in EXAMPLES if ex["id"] == pick)
    spec = analyze_code(example["code"])
    spec["engine"] = "local"
    return spec, False, notes


# ── The reader ───────────────────────────────────────────────────────────────

def _for_the_ai(text: str, lines: List[str], kind: str) -> str:
    out = text.strip()[:6000]
    if lines:
        out += f"\n\nThe uploaded data has {len(lines):,} lines; the first {min(40, len(lines))}:\n" + "\n".join(lines[:40])
    return out + (f"\n\n(QAIbridge's AI Advisor matched this to a {LABELS[kind]} problem. If it gives concrete data, "
                  "use it; for a list longer than 64 items, give only the target or query.)")


def read(text: str, lines: List[str], kind: str, mode: str, user_id: Optional[int]) -> Dict[str, Any]:
    """The data to solve: a Code to Quantum spec, where it came from, and notes for the user."""
    lines = [str(ln).strip() for ln in lines if str(ln).strip()][:MAX_ITEMS]
    notes: List[str] = []
    spec: Optional[Dict[str, Any]] = None
    from_problem = False

    if mode == "auto":
        try:
            got = analyze_with_llm(_for_the_ai(text, lines, kind), user_id)
            if got["problem_type"] != "unsupported" and _fits(got["problem_type"], kind):
                spec = got
                from_problem = not got.get("ai_note")
            else:
                notes.append("The AI found no data of this kind in your problem, so the built-in reader looked instead.")
        except ai.AIUnavailable as e:
            notes.append(f"{e.message} The built-in reader looked for the data instead.")
        except LLMError:
            notes.append("The AI's answer couldn't be used, so the built-in reader looked for the data instead.")

    if spec is None:
        spec, from_problem, more = _builtin(kind, text, lines)
        notes += more
    else:
        p = spec["parameters"]
        # The AI only sees the first lines of a file: the file itself is the data.
        if lines and spec["problem_type"] == "search":
            p["items"] = lines
            from_problem = True
        elif lines and spec["problem_type"] == "database":
            p["records"] = lines
            from_problem = True
        spec.pop("ai_note", None)

    if not from_problem:
        notes.insert(0, "Your problem gives no data QAIbridge can solve directly, so this is a small example of the same "
                        "kind. Change it to your own data and solve again.")
    notes += _size_notes(spec)
    return {"spec": spec, "source": "your problem" if from_problem else "example", "notes": notes}


def _size_notes(spec: Dict[str, Any]) -> List[str]:
    """What won't fit on the simulator, said before running rather than after."""
    p, kind = spec["parameters"], spec["problem_type"]
    if kind == "factoring":
        try:
            n = int(p.get("N"))
        except (TypeError, ValueError):
            return []
        if n > MAX_SHOR_N and n % 2:
            return [f"N = {n:,} needs {3 * n.bit_length()} qubits for Shor's algorithm, more than this exact simulation "
                    f"runs (up to N = {MAX_SHOR_N}). The classical answer will still be found."]
    if kind in ("search", "database"):
        many = len(p.get("items") or p.get("records") or [])
        if many > MAX_ITEMS:
            return [f"{many:,} lines is more than the simulator's search holds ({MAX_ITEMS:,})."]
    return []
