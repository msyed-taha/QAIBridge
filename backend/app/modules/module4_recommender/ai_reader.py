"""
AI Advisor — reading the problem with the AI.

Claude reads the person's description (or the text of their file) and fills
in the same ten facts the built-in keyword reader produces. The Random Forest
still makes the choice, so every recommendation comes from the trained model.
Claude then explains that choice in plain words, using the model's real
output. Both calls go through the shared AI service (app/ai/service.py).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from ...ai import service as ai

FEATURE = "advisor"

# Same order as the model's problem_category feature (0–7).
CATEGORIES = ["search", "factoring", "optimisation", "database", "simulation", "machine_learning", "graph",
              "cryptography"]
FLAGS = ["unstructured_data", "needs_exact_answer", "has_graph_structure", "is_security_related",
         "continuous_vars", "periodic_structure", "multi_solution"]
DEFAULT_REDIRECT = ("This tool recommends a quantum or classical approach for a computing problem. Describe a task, "
                    "such as searching data, factoring numbers or planning routes, and roughly how big it is.")

READ_PROMPT = """You read a problem description for QAIbridge's AI Advisor, which recommends a quantum or a
classical algorithm. Fill in the facts its model needs. Reply with ONE JSON object and nothing else:

{
  "on_topic": true,
  "summary": "one plain sentence: the task and how big it is",
  "problem_category": "search | factoring | optimisation | database | simulation | machine_learning | graph | cryptography",
  "data_size": integer or null,
  "unstructured_data": true or false,
  "needs_exact_answer": true or false,
  "has_graph_structure": true or false,
  "is_security_related": true or false,
  "continuous_vars": true or false,
  "periodic_structure": true or false,
  "multi_solution": true or false,
  "redirect": ""
}

How to fill it in:
- problem_category: search = find one item in unsorted data; factoring = factor integers or find primes;
  optimisation = choose the best option under constraints (routes, schedules, budgets, portfolios);
  database = find all records that match conditions; simulation = molecules, materials, energies, quantum
  systems, eigenvalues; machine_learning = classify, cluster or predict; graph = networks of nodes and edges
  (colouring, cuts, cliques); cryptography = encryption, keys, hashes, signatures.
- data_size: how many items the problem works over (records, cities, stores, assets, nodes, variables), as
  written in the text ("10 million" = 10000000). null if the text doesn't say.
- unstructured_data: the data is unsorted or has no index. needs_exact_answer: an exact answer is required
  (false when an approximate or good-enough answer is fine). has_graph_structure: routes, maps, networks or
  connections. is_security_related: encryption, keys, passwords or hashes. continuous_vars: real-valued
  quantities such as energies or probabilities. periodic_structure: periods, cycles, frequencies, phases or
  eigenvalues. multi_solution: many answers are acceptable, or several records match.
- If the text is not a computing problem at all (small talk, a general question, a request for an essay),
  set "on_topic" to false and put one polite sentence in "redirect" saying what this tool does."""

EXPLAIN_PROMPT = """You explain a recommendation from QAIbridge's AI Advisor to the person who asked for it.
The app's note above the data gives the model's decision and its numbers; the data block holds the person's
problem. Write 2 to 4 short sentences of plain English (at most 90 words), with no lists or headings:
- say what kind of problem it is, in the person's own terms;
- say which approach and algorithm the model chose, and the main reason (use the speed-up and the size given);
- if it helps, add in general terms what would change the advice (for example a much smaller problem).
Use only the facts given, and never mention the note, the model's workings or anything you weren't told.
Don't promise results on real quantum hardware."""


def read_problem(text: str, user_id: Optional[int]) -> Dict[str, Any]:
    """
    The model's features as Claude reads them from the text, or {"off_topic": True, "redirect": …}.
    Raises ai.AIUnavailable (the AI can't answer) or ValueError (its answer couldn't be used).
    """
    answer = ai.ask(FEATURE, READ_PROMPT, text, user_id=user_id, max_tokens=1000)
    try:
        return _read_answer(answer)
    except ValueError:
        ai.discard(answer)            # don't serve an unusable answer again
        raise


def _read_answer(answer: ai.Answer) -> Dict[str, Any]:
    data = ai.json_from(answer.text)
    if data.get("on_topic") is False:
        return {"off_topic": True, "redirect": str(data.get("redirect") or DEFAULT_REDIRECT)[:300]}
    category = str(data.get("problem_category", "")).strip().lower().replace(" ", "_").replace("optimization", "optimisation")
    if category not in CATEGORIES:
        raise ValueError(f"The AI chose an unknown problem type '{category}'.")
    size = data.get("data_size")
    try:
        size = int(size) if size is not None and not isinstance(size, bool) else None
    except (TypeError, ValueError):
        size = None
    features: Dict[str, Any] = {
        "problem_category": CATEGORIES.index(category),
        "data_size": min(max(size, 2), 10 ** 12) if size else None,     # None: the caller uses the usual default
        "speedup_priority": 1,
    }
    for flag in FLAGS:
        features[flag] = data.get(flag) is True
    return {
        "off_topic": False,
        "features": features,
        "summary": str(data.get("summary") or "").strip()[:300],
        "model": answer.model,
        "saved": answer.saved,
    }


def explain(problem: str, result: Dict[str, Any], user_id: Optional[int]) -> Optional[str]:
    """2–4 sentences on why the model chose what it chose, or None when the AI can't write them."""
    top = result["recommendations"][0]
    f = result["detected_features"]
    note = (
        f"Model decision: {result['approach']} approach, best algorithm {top['algorithm_name']} "
        f"(complexity {top['complexity']}, {top['speedup']} speed-up), model confidence {result['top_confidence']}%.\n"
        f"The model's reasons: {result['approach_reason']}\n"
        f"Problem type: {f['category_label']}; size N = {f['data_size']:,}."
    )
    try:
        answer = ai.ask(FEATURE, EXPLAIN_PROMPT, problem, user_id=user_id, note=note, max_tokens=600)
    except ai.AIUnavailable:
        return None
    text = answer.text.strip()
    if not text or len(text) > 1200 or text.startswith("{"):
        ai.discard(answer)
        return None
    return text
