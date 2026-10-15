"""
AI Advisor — the model that picks the quantum algorithm for a problem.

A Random Forest reads nine facts about the problem (its category, its size and
seven yes/no traits) and ranks the six quantum algorithms. It learns from
generated examples of each algorithm's typical problems: every category of
problem, with the traits that come with it, the way a reader fills them in.

It is tested on real problem descriptions it never learns from, labelled by
hand with the facts a careful reader fills in and the algorithms that genuinely
fit: 48 problems, six per category, used while building it
(labelled_problems.json), and 24 more written afterwards and never used to tune
anything (held_out_problems.json). Those accuracies, not the score on its own
generated examples, are the ones the app reports.

A domain gate keeps the choice consistent with the kind of problem (a route can
never get a search algorithm). The confidence shown is the model's own
probability among the algorithms that fit the category, with nothing added.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

import numpy as np
from sklearn.ensemble import RandomForestClassifier

QUANTUM_IDS = ["grovers", "shors", "qaoa", "amplitude_amp", "vqe", "qpe"]
CATEGORIES = ["search", "factoring", "optimisation", "database", "simulation", "machine_learning", "graph", "cryptography"]
FLAGS = ["unstructured_data", "needs_exact_answer", "has_graph_structure", "is_security_related",
         "continuous_vars", "periodic_structure", "multi_solution"]
FEATURE_NAMES = ["problem_category", "data_size_log", *FLAGS]

# Each algorithm's typical problems: (algorithm, category, log10 size range, chance of each trait).
# In cryptography the "size" may be key bits or a whole key space, so its ranges overlap: whether the attack is
# a brute-force search (Grover's) or exploits structure (Shor's) decides.
# Traits not listed are rare (5%), the way real descriptions sometimes carry an unexpected one.
PROFILES: List[Tuple[str, int, Tuple[float, float], Dict[str, float]]] = [
    ("grovers", 0, (2, 10), {"unstructured_data": .9, "needs_exact_answer": .9}),                    # one item in unsorted data
    ("grovers", 3, (3, 9), {"unstructured_data": .8, "needs_exact_answer": .9}),                     # one record, no index
    ("grovers", 7, (2, 40), {"unstructured_data": .9, "needs_exact_answer": .9, "is_security_related": 1}),  # brute-force keys, hashes
    ("grovers", 6, (1, 4), {"has_graph_structure": .95, "needs_exact_answer": .8}),                  # does a path / cycle exist
    ("amplitude_amp", 3, (3, 9), {"multi_solution": .95, "unstructured_data": .4, "needs_exact_answer": .4}),  # all matching records
    ("amplitude_amp", 0, (3, 10), {"multi_solution": .9, "unstructured_data": .9, "needs_exact_answer": .3}),  # any of many answers
    ("shors", 1, (1, 20), {"needs_exact_answer": .95, "is_security_related": .5, "periodic_structure": .3}),  # factor a number
    ("shors", 7, (1, 12), {"needs_exact_answer": .9, "is_security_related": 1, "periodic_structure": .3}),  # RSA, elliptic curves, discrete logs
    ("qaoa", 2, (1, 4), {"multi_solution": .9, "has_graph_structure": .4, "continuous_vars": .2, "needs_exact_answer": .2}),
    ("qaoa", 6, (1, 4), {"has_graph_structure": .95, "multi_solution": .8, "needs_exact_answer": .3}),   # cuts, colouring, cliques
    ("vqe", 4, (0, 3), {"continuous_vars": .95, "needs_exact_answer": .3, "periodic_structure": .1}),    # molecules and materials
    ("vqe", 5, (3, 7), {"continuous_vars": .4, "multi_solution": .3}),                                  # variational classifiers
    ("qpe", 4, (0, 4), {"continuous_vars": .8, "periodic_structure": .9, "needs_exact_answer": .8}),     # eigenvalues and phases
]
NOISE = 0.05            # chance a trait is set when the profile doesn't call for it
CATEGORY_NOISE = 0.03   # chance an example comes with another category (readers make mistakes)

# Quantum algorithms that genuinely apply to each category: the model ranks within these.
CATEGORY_ALLOWED: Dict[int, List[str]] = {
    0: ["grovers", "amplitude_amp"],
    1: ["shors", "qpe"],
    2: ["qaoa", "vqe"],
    3: ["amplitude_amp", "grovers"],
    4: ["vqe", "qpe"],
    5: ["vqe", "qaoa"],
    6: ["qaoa", "grovers"],
    7: ["shors", "grovers"],
}

LABELLED = Path(__file__).with_name("labelled_problems.json")
HELD_OUT = Path(__file__).with_name("held_out_problems.json")


def size_log(size: Any) -> float:
    return min(max(math.log10(max(2, float(size))), 0.0), 40.0)


def to_vector(f: Dict[str, Any]) -> np.ndarray:
    return np.array([[f["problem_category"], size_log(f["data_size"]), *(int(bool(f[k])) for k in FLAGS)]], dtype=float)


def build_dataset(per_profile: int = 400, seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
    rng = random.Random(seed)
    X, y = [], []
    for algo, category, (lo, hi), traits in PROFILES:
        for _ in range(per_profile):
            cat = rng.randrange(8) if rng.random() < CATEGORY_NOISE else category
            row = [cat, rng.uniform(lo, hi)] + [int(rng.random() < traits.get(k, NOISE)) for k in FLAGS]
            X.append(row)
            y.append(algo)
    return np.array(X, dtype=float), np.array(y)


def train(seed: int = 42) -> RandomForestClassifier:
    X, y = build_dataset(seed=seed)
    clf = RandomForestClassifier(n_estimators=200, max_depth=12, min_samples_split=4, random_state=seed, n_jobs=-1)
    clf.fit(X, y)
    return clf


def rank(clf: RandomForestClassifier, features: Dict[str, Any]) -> List[Tuple[str, float]]:
    """The model's ranking of the quantum algorithms, with its confidence (%), kept consistent with the category."""
    proba = clf.predict_proba(to_vector(features))[0]
    scores = {c: float(p) for c, p in zip(clf.classes_, proba)}
    allowed = CATEGORY_ALLOWED.get(int(features["problem_category"]), QUANTUM_IDS)
    allowed_mass = sum(scores[a] for a in allowed) or 1e-9
    ordered = sorted(QUANTUM_IDS, key=lambda a: (a in allowed, scores[a]), reverse=True)
    out = []
    for a in ordered:
        # within the category: the model's own share; outside it: its raw probability, halved
        conf = scores[a] / allowed_mass * 100 if a in allowed else scores[a] * 50
        out.append((a, round(min(conf, 99.0), 1)))
    return out


def labelled_problems() -> List[Dict[str, Any]]:
    return json.loads(LABELLED.read_text())["items"]


def held_out_problems() -> List[Dict[str, Any]]:
    return json.loads(HELD_OUT.read_text())["items"]


def accuracy(clf: RandomForestClassifier, read: Callable[[Dict[str, Any]], Dict[str, Any]],
             items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """How many of these labelled problems get a fitting algorithm when their facts come from `read`."""
    wrong = []
    for item in items:
        top = rank(clf, read(item))[0][0]
        if top not in item["answers"]:
            wrong.append({"id": item["id"], "picked": top, "fits": item["answers"]})
    right = len(items) - len(wrong)
    return {"right": right, "total": len(items), "pct": round(100 * right / len(items), 1), "wrong": wrong}
