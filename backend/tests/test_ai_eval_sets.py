"""
The AI evaluation's answer keys (evals/sets) and scoring: the keys must be
valid answers the app could give, so a score is never wrong because of the key.
No AI is called here; the evaluation itself is run by hand (evals/run_ai_eval.py).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.modules.module5_transformer.analyzer import ALGORITHM_FOR
from app.routers.recommender import CATEGORY_LABELS, QUANTUM_IDS
from evals.run_ai_eval import gap, score_advisor, score_code, score_describe

SETS = Path(__file__).resolve().parent.parent / "evals" / "sets"


def items(name):
    return json.loads((SETS / f"{name}.json").read_text())["items"]


def test_describe_keys_are_real_distributions():
    seen = set()
    for item in items("describe"):
        assert item["id"] not in seen and item["text"]
        seen.add(item["id"])
        if item.get("off_topic"):
            continue
        truth = item["truth"]
        n = len(next(iter(truth)))
        assert 1 <= n <= 6 and all(len(k) == n and set(k) <= {"0", "1"} for k in truth)
        assert sum(truth.values()) == pytest.approx(1.0) and all(v > 0 for v in truth.values())


def test_advisor_keys_use_real_categories_and_algorithms():
    for item in items("advisor"):
        if item.get("off_topic"):
            continue
        assert set(item["categories"]) <= set(CATEGORY_LABELS.values())
        assert item["quantum"] is None or set(item["quantum"]) <= set(QUANTUM_IDS)


def test_code_keys_use_real_problem_types():
    for item in items("code"):
        assert item["problem_type"] in set(ALGORITHM_FOR) | {"off_topic"} and item["code"].strip()


def test_scoring():
    assert gap({"00": 0.5, "11": 0.5}, {"00": 0.5, "11": 0.5}) == 0
    assert gap({"0": 1.0}, {"1": 1.0}) == 1
    bell = {"id": "bell", "truth": {"00": 0.5, "11": 0.5}}
    reply = {"off_topic": False, "layout": {"n": 2, "gates": [{}, {}]},
             "check": {"matches": True, "got": [{"outcome": "00", "chance": 0.5}, {"outcome": "11", "chance": 0.5}]}}
    assert score_describe(bell, reply)["right"]
    assert not score_describe(bell, {"unavailable": "The AI couldn't answer."})["right"]
    assert score_describe({"id": "off", "text": "x", "off_topic": True}, {"off_topic": True})["right"]
    ok = {"detected_features": {"category_label": "Factoring"}, "quantum": {"algorithm_id": "shors"}, "engine": "ai"}
    assert score_advisor({"id": "rsa", "categories": ["Factoring"], "quantum": ["shors"]}, 200, ok)["right"]
    assert score_advisor({"id": "joke", "off_topic": True}, 422, {})["right"]
    spec = {"spec": {"problem_type": "factoring", "parameters": {"N": 77}}}
    assert score_code({"id": "f", "problem_type": "factoring", "params": {"N": 77}}, 200, spec)["right"]
    assert not score_code({"id": "f", "problem_type": "factoring", "params": {"N": 91}}, 200, spec)["right"]
