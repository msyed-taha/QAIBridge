"""
Module 5 – Classical → Quantum Logic Transformer
llm.py  –  LLM-driven understanding of classical code (OBJ-5, FE-1)

The language model reads arbitrary classical code (any language, or a plain
English description) and returns a structured problem spec — the same JSON
the offline analyzer produces. The deterministic Bridge then builds the
Hamiltonian / oracle and the Module 1 kernel runs the circuit, so the maths
never depends on generated text, and every quantum answer is checked against
a classical solution.

Configuration (backend/.env):

    LLM_PROVIDER = anthropic | openai          (auto-detected from the key if unset)
    LLM_API_KEY  = …                           (or ANTHROPIC_API_KEY / OPENAI_API_KEY)
    LLM_MODEL    = claude-opus-5-5             (defaults per provider below)
    LLM_BASE_URL = https://…/v1                (optional: any OpenAI-compatible server,
                                                e.g. Groq, OpenRouter, a local Ollama)

Without a key the Transformer runs in offline mode (analyzer.py).
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Dict, Optional, Tuple

import httpx

from .analyzer import ALGORITHM_FOR

DEFAULT_MODELS = {"anthropic": "claude-opus-5-5", "openai": "gpt-4o-mini"}
TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "45"))
MAX_CODE_CHARS = 12_000

SYSTEM_PROMPT = """You are the Transformation Engine of QAIBridge, a quantum-computing education platform.
Read the user's classical program (any programming language) or problem description and decide which
quantum formulation fits it. Reply with ONE JSON object and nothing else:

{
  "problem_type": "search | database | factoring | tsp | knapsack | maxcut | partition | portfolio | boolean | unsupported",
  "parameters": { ... exactly the fields listed below for that type ... },
  "explanation": "2-4 plain-English sentences: what the classical code does and why this quantum approach fits",
  "confidence": 0.0-1.0
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

Rules: output valid JSON only (no markdown fences); never include code; prefer "unsupported" over a
forced mapping."""

VALID_TYPES = set(ALGORITHM_FOR)


class LLMError(RuntimeError):
    pass


def llm_config() -> Dict[str, Optional[str]]:
    provider = (os.getenv("LLM_PROVIDER") or "").strip().lower() or None
    key = (os.getenv("LLM_API_KEY") or "").strip() or None
    if not key:
        if (os.getenv("ANTHROPIC_API_KEY") or "").strip() and provider in (None, "anthropic"):
            key, provider = os.getenv("ANTHROPIC_API_KEY").strip(), "anthropic"
        elif (os.getenv("OPENAI_API_KEY") or "").strip() and provider in (None, "openai"):
            key, provider = os.getenv("OPENAI_API_KEY").strip(), "openai"
    if key and not provider:
        provider = "anthropic" if key.startswith("sk-ant-") else "openai"
    base_url = (os.getenv("LLM_BASE_URL") or "").strip() or None
    if provider not in (None, "anthropic", "openai"):
        provider = "openai"          # any other name is treated as an OpenAI-compatible server
    model = (os.getenv("LLM_MODEL") or "").strip() or (DEFAULT_MODELS.get(provider) if provider else None)
    return {"provider": provider, "api_key": key, "model": model, "base_url": base_url}


def llm_status() -> Dict[str, Any]:
    cfg = llm_config()
    enabled = bool(cfg["api_key"] and cfg["provider"])
    return {
        "enabled": enabled,
        "provider": cfg["provider"] if enabled else None,
        "model": cfg["model"] if enabled else None,
        "base_url": cfg["base_url"] if enabled else None,
        "mode": "AI (LLM)" if enabled else "Offline analyzer",
        "how_to_enable": None if enabled else
            "Add LLM_API_KEY (Anthropic or OpenAI-compatible) to backend/.env and restart the backend.",
    }


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise LLMError("The model did not return JSON.")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        raise LLMError(f"The model returned malformed JSON ({e.msg}).")


def _call_anthropic(cfg: Dict[str, Optional[str]], user: str) -> str:
    url = (cfg["base_url"] or "https://api.anthropic.com").rstrip("/") + "/v1/messages"
    r = httpx.post(
        url,
        headers={"x-api-key": cfg["api_key"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": cfg["model"], "max_tokens": 2000, "system": SYSTEM_PROMPT,
              "messages": [{"role": "user", "content": user}]},
        timeout=TIMEOUT_SECONDS,
    )
    if r.status_code != 200:
        raise LLMError(f"Anthropic API error {r.status_code}: {r.text[:300]}")
    data = r.json()
    return "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")


def _call_openai(cfg: Dict[str, Optional[str]], user: str) -> str:
    base = (cfg["base_url"] or "https://api.openai.com/v1").rstrip("/")
    body: Dict[str, Any] = {
        "model": cfg["model"], "temperature": 0,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
    }
    if "api.openai.com" in base:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(base + "/chat/completions",
                   headers={"Authorization": f"Bearer {cfg['api_key']}", "content-type": "application/json"},
                   json=body, timeout=TIMEOUT_SECONDS)
    if r.status_code != 200:
        raise LLMError(f"LLM API error {r.status_code}: {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


def analyze_with_llm(code: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Returns (spec, meta). Raises LLMError when the engine is off or the call fails."""
    cfg = llm_config()
    if not (cfg["api_key"] and cfg["provider"]):
        raise LLMError("No LLM API key configured.")
    user = "Classical code / problem to transform:\n\n" + code[:MAX_CODE_CHARS]
    t0 = time.perf_counter()
    raw = _call_anthropic(cfg, user) if cfg["provider"] == "anthropic" else _call_openai(cfg, user)
    elapsed = (time.perf_counter() - t0) * 1000
    data = _extract_json(raw)

    kind = str(data.get("problem_type", "")).strip().lower()
    if kind not in VALID_TYPES:
        raise LLMError(f"The model chose an unknown problem type '{kind}'.")
    params = data.get("parameters") or {}
    if not isinstance(params, dict):
        raise LLMError("The model returned parameters in the wrong shape.")
    try:
        confidence = float(data.get("confidence", 0.7))
    except (TypeError, ValueError):
        confidence = 0.7
    spec = {
        "problem_type": kind,
        "parameters": params,
        "confidence": round(min(max(confidence, 0.0), 1.0), 2),
        "evidence": [f"Interpreted by {cfg['provider']} model {cfg['model']}"],
        "explanation": str(data.get("explanation", ""))[:1200],
        "quantum_algorithm": ALGORITHM_FOR[kind],
        "engine": "llm",
        "incomplete": False,
    }
    if kind == "unsupported":
        spec["parameters"] = {"reason": str(params.get("reason") or spec["explanation"]), "category": "llm"}
    return spec, {"provider": cfg["provider"], "model": cfg["model"], "latency_ms": round(elapsed, 1)}
