"""
Code to Quantum — reading code with the AI.

Claude reads the user's classical code (any language, or a plain-English
description) and returns a structured problem spec: the same JSON the
built-in reader (analyzer.py) produces. The deterministic Bridge then builds
the Hamiltonian or oracle and QAIbridge's simulator runs the circuit, so the
maths never depends on generated text, and every quantum answer is checked
against a classical one.

The call goes through the shared AI service (app/ai/service.py): cheapest
model, saved answers, daily limits, usage records. When the AI can't answer,
the pipeline falls back to the built-in reader.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from ...ai import service as ai
from .analyzer import ALGORITHM_FOR

FEATURE = "code_to_quantum"

SYSTEM_PROMPT = """You are the code reader of QAIbridge's Code to Quantum tool.
Read the user's classical program (any programming language) or problem description and decide which
quantum formulation fits it. Reply with ONE JSON object and nothing else:

{
  "problem_type": "search | database | factoring | tsp | knapsack | maxcut | partition | portfolio | boolean | unsupported",
  "parameters": { ... exactly the fields listed below for that type ... },
  "explanation": "2-4 plain-English sentences: what the classical code does and why this quantum approach fits",
  "confidence": 0.0-1.0,
  "example_data": false,
  "off_topic": false
}

parameters by problem_type (use the concrete data found in the code; keep lists short, at most 64 items):
  search:    {"items": ["..."], "target": "..."}                          (unsorted lookup of one value)
  database:  {"records": ["one text line per record"], "query": "keyword | field = text | field > number"}
  factoring: {"N": integer}                                               (integer factorisation / primality)
  tsp:       {"cities": ["Name, latitude, longitude" or known city names]} or {"distance_matrix": [[...]]}
             (at most 5 cities)
  knapsack:  {"names": [...], "weights": [integers], "values": [numbers], "capacity": integer}
  maxcut:    {"n_nodes": integer, "edges": [[i, j, weight], ...]}         (split a graph into two groups)
  partition: {"numbers": [...]}                                           (two groups with equal sums)
  portfolio: {"names": [...], "returns": [...], "volatility": [...] or "cov": [[...]], "k": integer,
              "risk_aversion": number}                                    (hold the best k of n assets)
  boolean:   {"expression": "formula using and / or / not / xor / -> over at most 10 variables"}
  unsupported: {"reason": "why no quantum speed-up applies"}   — e.g. sorting (no quantum speed-up),
             dense matrix products, simple arithmetic, I/O. Never invent a speed-up that does not exist.

If the material describes one of these problems but gives no concrete data (or not enough to fill the
parameters), still choose its problem_type, fill the parameters with a small made-up example of that problem,
set "example_data": true and say in the explanation that the data is an example. Otherwise "example_data" is false.
If the material is not a program or a computing problem at all (a greeting, a general question, a request
for an essay), set "off_topic": true and "problem_type": "unsupported", and put one polite sentence in
parameters.reason saying that this tool turns code, or a computing problem, into a quantum circuit.

Rules: output valid JSON only (no markdown fences); never include code; prefer "unsupported" over a
forced mapping."""

VALID_TYPES = set(ALGORITHM_FOR)


class LLMError(RuntimeError):
    """Claude answered, but the answer couldn't be used."""


def llm_status(user_id: Optional[int] = None) -> Dict[str, Any]:
    """Whether the AI can read code for this user right now (see ai.status)."""
    return ai.status(user_id)


def analyze_with_llm(code: str, user_id: Optional[int] = None) -> Dict[str, Any]:
    """The problem spec Claude reads from the code. Raises ai.AIUnavailable or LLMError."""
    # reading arbitrary code into exact parameters benefits from thinking first
    answer = ai.ask(FEATURE, SYSTEM_PROMPT, code, user_id=user_id, max_tokens=4000, think=True)
    try:
        return _spec_from(answer)
    except LLMError:
        ai.discard(answer)            # don't serve an unusable answer again
        raise


def _spec_from(answer: ai.Answer) -> Dict[str, Any]:
    try:
        data = ai.json_from(answer.text)
    except ValueError as e:
        raise LLMError(str(e)) from e
    kind = str(data.get("problem_type", "")).strip().lower()
    if kind not in VALID_TYPES:
        raise LLMError(f"The AI chose an unknown problem type '{kind}'.")
    params = data.get("parameters") or {}
    if not isinstance(params, dict):
        raise LLMError("The AI returned parameters in the wrong shape.")
    try:
        confidence = float(data.get("confidence", 0.7))
    except (TypeError, ValueError):
        confidence = 0.7
    spec = {
        "problem_type": kind,
        "parameters": params,
        "confidence": round(min(max(confidence, 0.0), 1.0), 2),
        "evidence": [f"Read by AI ({answer.model})"],
        "explanation": str(data.get("explanation", ""))[:1200],
        "quantum_algorithm": ALGORITHM_FOR[kind],
        "engine": "llm",
        "incomplete": False,
        "llm": {"model": answer.model, "saved": answer.saved, "latency_ms": answer.latency_ms},
    }
    if data.get("example_data") is True and kind != "unsupported":
        spec["ai_note"] = ("Your description gave no data to use, so the AI made up a small example. "
                           "Edit the parameters below to try your own.")
        spec["evidence"].append("Example data made up by the AI: the description gave none")
    if kind == "unsupported":
        category = "off_topic" if data.get("off_topic") is True else "llm"
        spec["parameters"] = {"reason": str(params.get("reason") or spec["explanation"])[:400], "category": category}
    return spec
