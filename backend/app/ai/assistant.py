"""
Ask QAIbridge — the assistant on every signed-in page.

It answers questions about quantum computing, about the app, and about what is
on the person's screen (the page sends a short description of it). It can
offer up to three actions: open a page, ask the AI Advisor a question, or open
a small circuit in the Simulator. Every action is checked here before the page
sees it: pages must exist, and circuits must pass the Simulator's own OpenQASM
reader. The conversation lives in the person's browser; the server keeps only
the usage numbers, like every AI feature.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlsplit

from . import service as ai
from ..modules.module1_kernel.qasm import QasmError, parse_qasm

FEATURE = "assistant"
MAX_ACTIONS = 3
MAX_CIRCUIT_QUBITS = 10

PAGES: Dict[str, str] = {
    "/app": "App home: ask the AI Advisor a question, and pick up recent work",
    "/learn": "Learn: 9 short lessons, each with a reading, a picture, a game and a quiz",
    "/simulator": "Quantum Simulator: run any OpenQASM circuit (up to 28 qubits), replay it gate by gate, see its amplitudes and each qubit, download the results",
    "/circuit": "Circuit Builder: put gates on wires, or describe a circuit in words and the AI builds it; see the chances and one Bloch sphere per qubit straight away; 10 challenge levels",
    "/module4": "AI Advisor: describe a problem; it recommends a quantum or classical approach and an algorithm, and explains why",
    "/module5": "Code to Quantum: paste Python code; it becomes a quantum circuit that is run and checked against the code",
    "/module2": "Quantum vs Classical: Grover, Shor, QAOA and amplitude amplification next to the best classical method on the same input",
    "/solve": "Problem Solver: run search, factoring, route planning or a database query on your own data",
    "/module6": "Neural Optimizer: see barren plateaus (why big quantum circuits stop learning), race four ways to train a quantum classifier (random start, random start with a plateau monitor, near-zero start, a neural network that outputs the angles), and train a network that predicts QAOA angles",
    "/module7": "Neural Network Converter: turn a classical neural network into a quantum one and compare them",
    "/dashboard": "Dashboard: benchmarks, your saved runs and CSV export",
    "/work": "My work: your saved circuits and projects",
    "/account": "Account settings",
}
TYPED_PAGES = {"/module2", "/solve"}                 # these open a problem type with ?type=
PROBLEM_TYPES = {"search", "factoring", "optimization", "database"}

LESSONS: Dict[str, str] = {
    "bit-vs-qubit": "1. Bit vs qubit",
    "superposition": "2. Superposition",
    "measurement": "3. Measurement",
    "quantum-gates": "4. Quantum gates",
    "interference": "5. Interference",
    "entanglement": "6. Entanglement",
    "decoherence": "7. Decoherence",
    "quantum-fourier-transform": "8. Quantum Fourier Transform",
    "quantum-advantage": "9. Quantum advantage",
}


def _page_list() -> str:
    pages = "\n".join(f"  {path}: {what}" for path, what in PAGES.items())
    lessons = "\n".join(f"  /learn/{slug}: lesson {title}" for slug, title in LESSONS.items())
    return f"{pages}\n{lessons}\n  /module2 and /solve also take ?type=search, factoring, optimization or database"


SYSTEM_PROMPT = f"""You are Ask QAIbridge, the assistant inside QAIbridge, an app for learning and using quantum computing.
The data block holds: the page the person is on, what that page shows right now (if anything), the chat so far,
and their new message. Answer the new message.

Reply with ONE JSON object and nothing else:
{{"reply": "your answer", "actions": []}}

reply: plain, friendly English, short (at most 120 words unless they ask for more detail). Explain one idea at a
time and use an everyday example when it helps. No headings; simple "- " lists are fine; write maths in words or
simple symbols.

actions: at most {MAX_ACTIONS}, only when they really help the person do the next step. Each is one of:
  {{"type": "open", "label": "short button text", "to": "a page from the list below"}}
  {{"type": "ask_advisor", "label": "short button text", "problem": "the problem in one or two sentences"}}
  {{"type": "run_circuit", "label": "short button text", "qasm": "a complete OpenQASM 2.0 program with at most 8 qubits"}}

Pages you can open:
{_page_list()}

Rules:
- Only use the pages listed, and never describe features QAIbridge doesn't have.
- When they ask about their result, use only the numbers shown on their page. If there are none, say what you would
  need and which page gives it.
- For a circuit request, explain it briefly and offer it as a run_circuit action; the Simulator checks it.
- If the message isn't about quantum computing, computing problems or QAIbridge, say politely in one sentence what
  you can help with, and suggest something."""


def _clean_turns(history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return [{"role": t["role"], "text": t["text"].strip()[:2000]} for t in history[-6:] if t.get("text", "").strip()]


def _material(message: str, page: str, page_title: str, details: str, history: List[Dict[str, str]]) -> str:
    parts = [f"Page: {page_title.strip() or 'unknown'} ({page.strip() or '?'})"]
    parts.append("What the page shows:\n" + (details.strip()[:4000] or "(nothing extra)"))
    turns = _clean_turns(history)
    if turns:
        parts.append("The chat so far:\n" + "\n".join(
            f"{'Person' if t['role'] == 'user' else 'You'}: {t['text']}" for t in turns))
    parts.append("Their new message:\n" + message.strip())
    return "\n\n".join(parts)


def page_allowed(to: str) -> bool:
    """A page the assistant may send people to: a known page, a lesson, or a problem type on the solver pages."""
    url = urlsplit(to)
    if url.scheme or url.netloc or url.fragment:
        return False
    path = url.path.rstrip("/") or "/"
    if path.startswith("/learn/"):
        return path[len("/learn/"):] in LESSONS and not url.query
    if path not in PAGES:
        return False
    if not url.query:
        return True
    query = parse_qs(url.query)
    return (path in TYPED_PAGES and set(query) == {"type"}
            and len(query["type"]) == 1 and query["type"][0] in PROBLEM_TYPES)


def clean_actions(raw: Any) -> List[Dict[str, Any]]:
    """Keep only actions the app can really carry out: real pages, real questions, circuits the Simulator reads."""
    out: List[Dict[str, Any]] = []
    for a in raw if isinstance(raw, list) else []:
        if len(out) == MAX_ACTIONS:
            break
        if not isinstance(a, dict):
            continue
        label = str(a.get("label") or "").strip()[:48]
        kind = a.get("type")
        if kind == "open":
            to = str(a.get("to") or "").strip()
            if page_allowed(to):
                out.append({"type": "open", "label": label or "Open", "to": to})
        elif kind == "ask_advisor":
            problem = str(a.get("problem") or "").strip()[:500]
            if len(problem) >= 15:
                out.append({"type": "ask_advisor", "label": label or "Ask the AI Advisor", "problem": problem})
        elif kind == "run_circuit":
            qasm = str(a.get("qasm") or "").strip()[:4000]
            try:
                program = parse_qasm(qasm)
            except QasmError:
                continue                      # the Simulator couldn't read it: don't offer it
            n = program.circuit.n_qubits
            if n <= MAX_CIRCUIT_QUBITS:
                out.append({"type": "run_circuit", "label": label or "Open in the Simulator", "qasm": qasm + "\n",
                            "summary": f"{n} qubit{'s' if n != 1 else ''}, {program.circuit.gate_count()} gates"})
    return out


def ask(message: str, *, page: str, page_title: str, details: str, history: List[Dict[str, str]],
        user_id: Optional[int]) -> Dict[str, Any]:
    """The assistant's reply and its checked actions. Raises ai.AIUnavailable when the AI can't answer."""
    if ai.looks_like_gibberish(message):
        raise ai.AIUnavailable("rejected", "That doesn't look like a question. Try asking it in a few words.")
    answer = ai.ask(FEATURE, SYSTEM_PROMPT, _material(message, page, page_title, details, history),
                    user_id=user_id, max_tokens=1500)
    try:
        data = ai.json_from(answer.text)
        reply = str(data.get("reply") or "").strip()
        actions = clean_actions(data.get("actions"))
    except ValueError:
        # Not the JSON we asked for: a plain answer is still an answer, without actions.
        reply, actions = answer.text.strip(), []
    if not reply:
        ai.discard(answer)
        raise ai.AIUnavailable("error", "The AI couldn't answer just now.")
    return {"reply": reply[:3000], "actions": actions}
