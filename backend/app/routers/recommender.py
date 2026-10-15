"""
AI Advisor
Accepts a free-text problem description (or an uploaded file) and recommends
whether a Quantum or Classical approach is best, along with the specific
algorithm using a Random Forest Classifier.

Reading the problem: the AI (Claude, through the shared AI service) fills in
the model's ten features and, after the model has chosen, explains the choice
in plain words. When the AI can't answer, or the user picks the built-in
reader, keyword rules fill in the features instead. Either way the Random
Forest makes the recommendation.

Solving it (FE-3): the problem's own data is read from the description or the
uploaded file (data_reader.py) and solved with the chosen algorithm from the
SFOD suite, classical and quantum side by side, on QAIbridge's simulator.

Routes (signed-in users; the AI has a daily allowance per user):
  POST /api/module4/advise        – Analyse free-text problem description
  POST /api/module4/advise-file   – Analyse uploaded file (PDF, DOCX, CSV, TXT…)
  POST /api/module4/read-data     – Read the data to solve from the problem (editable)
  POST /api/module4/solve         – Solve it: classical and quantum, side by side
  GET  /api/module4/algorithms    – List all supported algorithms
  GET  /api/module4/model-info    – Model accuracy, feature importances
"""
from __future__ import annotations

import io
import re
import csv
import json
import numpy as np
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field

from ..ai import service as ai
from ..models.benchmark import KIND_ADVISOR
from ..models.user import User
from ..modules import file_text
from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module4_recommender import ai_reader, data_reader, model, reality
from ..modules.module5_transformer import pipeline
from ..modules.module5_transformer.bridge import KNOWN_CITIES
from ..modules.module8_dashboard import custom_solver, history
from .auth import get_current_user

router = APIRouter(prefix="/api/module4", tags=["AI Advisor"])

# ── Algorithm catalogue ───────────────────────────────────────────────────────

QUANTUM_ALGORITHMS = [
    {
        "id":          "grovers",
        "type":        "quantum",
        "name":        "Grover's Search Algorithm",
        "complexity":  "O(√N)",
        "speedup":     "Quadratic",
        "best_for":    "Unstructured search in unsorted datasets",
        "qubits":      "⌈log₂ N⌉",
        "color":       "#00ffcc",
        "description": (
            "Grover's algorithm uses amplitude amplification to search an unsorted "
            "database of N items in √N steps — a provable quadratic speedup."
        ),
        "use_cases":   ["Database search", "Password cracking", "SAT problems", "Pattern matching"],
    },
    {
        "id":          "shors",
        "type":        "quantum",
        "name":        "Shor's Algorithm (QFT)",
        "complexity":  "O((log N)³)",
        "speedup":     "Exponential",
        "best_for":    "Integer factorisation and cryptanalysis",
        "qubits":      "2⌈log₂ N⌉ + 3",
        "color":       "#cc44ff",
        "description": (
            "Shor's algorithm uses the Quantum Fourier Transform to factorise integers "
            "in polynomial time — exponentially faster than the best classical algorithms."
        ),
        "use_cases":   ["RSA encryption breaking", "Cryptanalysis", "Discrete logarithm"],
    },
    {
        "id":          "qaoa",
        "type":        "quantum",
        "name":        "QAOA",
        "complexity":  "Heuristic",
        "speedup":     "None proven",
        "best_for":    "Combinatorial optimisation with graph structure",
        "qubits":      "N (problem variables)",
        "color":       "#f97316",
        "description": (
            "QAOA is a variational quantum algorithm that encodes combinatorial "
            "optimisation problems into parameterised quantum circuits. It is a heuristic: "
            "no speed-up over the best classical solvers has been shown."
        ),
        "use_cases":   ["Travelling Salesman", "Graph colouring", "Portfolio optimisation", "Scheduling"],
    },
    {
        "id":          "amplitude_amp",
        "type":        "quantum",
        "name":        "Amplitude Amplification",
        "complexity":  "O(√N)",
        "speedup":     "Quadratic",
        "best_for":    "Database queries with multiple matching entries",
        "qubits":      "⌈log₂ N⌉",
        "color":       "#3b82f6",
        "description": (
            "A generalisation of Grover's that amplifies the probability of measuring "
            "any 'good' state — ideal when multiple solutions exist."
        ),
        "use_cases":   ["Multi-record database search", "Constraint satisfaction", "Quantum counting"],
    },
    {
        "id":          "vqe",
        "type":        "quantum",
        "name":        "VQE (Variational Quantum Eigensolver)",
        "complexity":  "Heuristic",
        "speedup":     "None proven",
        "best_for":    "Ground state energy and quantum chemistry",
        "qubits":      "N (molecular orbitals)",
        "color":       "#22c55e",
        "description": (
            "VQE is a hybrid classical-quantum algorithm that estimates the ground "
            "state energy of a Hamiltonian using a parameterised ansatz circuit."
        ),
        "use_cases":   ["Drug discovery", "Material science", "Quantum chemistry"],
    },
    {
        "id":          "qpe",
        "type":        "quantum",
        "name":        "Quantum Phase Estimation (QPE)",
        "complexity":  "O(log(1/ε))",
        "speedup":     "Exponential precision",
        "best_for":    "Eigenvalue estimation and quantum simulation",
        "qubits":      "n + ancilla",
        "color":       "#ec4899",
        "description": (
            "QPE estimates the eigenvalue of a unitary operator to precision ε using "
            "O(log(1/ε)) qubits — a key subroutine in Shor's and HHL."
        ),
        "use_cases":   ["Eigenvalue problems", "Linear systems (HHL)", "Quantum simulation"],
    },
]

# ── Classical algorithm alternatives ───────────────────────────────────────────

CLASSICAL_ALGORITHMS = [
    {
        "id":          "linear_search",
        "type":        "classical",
        "name":        "Linear Search",
        "complexity":  "O(N)",
        "speedup":     "None",
        "best_for":    "Brute-force unstructured search",
        "color":       "#ef4444",
        "description": (
            "Simple sequential scan through all items. No optimisation possible "
            "for unstructured data — every item must be checked."
        ),
        "use_cases":   ["Small to medium datasets", "Database search", "Pattern matching"],
    },
    {
        "id":          "trial_division",
        "type":        "classical",
        "name":        "Trial Division",
        "complexity":  "O(√N)",
        "speedup":     "None",
        "best_for":    "Integer factorisation for small numbers",
        "color":       "#ef4444",
        "description": (
            "Test divisibility by all primes up to √N. Exponentially slow for "
            "large RSA-sized integers (2048+ bits)."
        ),
        "use_cases":   ["Small integer factoring", "Cryptanalysis (weak keys)"],
    },
    {
        "id":          "dynamic_programming",
        "type":        "classical",
        "name":        "Dynamic Programming",
        "complexity":  "O(2^N) or O(N³) (depends on problem)",
        "speedup":     "None",
        "best_for":    "Combinatorial optimisation (small-scale)",
        "color":       "#ef4444",
        "description": (
            "Cache subproblem solutions to avoid redundant computation. Good for "
            "small instances (N<20) but exponentially slow at scale."
        ),
        "use_cases":   ["Travelling Salesman (N<20)", "Graph optimisation", "Portfolio optimisation"],
    },
    {
        "id":          "binary_search",
        "type":        "classical",
        "name":        "Binary Search",
        "complexity":  "O(log N)",
        "speedup":     "None",
        "best_for":    "Search in sorted/structured data",
        "color":       "#ef4444",
        "description": (
            "Divide-and-conquer search on pre-sorted data. Efficient for structured "
            "data but requires sorting or index structures first."
        ),
        "use_cases":   ["Sorted array search", "Database lookups with indices", "Range queries"],
    },
    {
        "id":          "classical_simulation",
        "type":        "classical",
        "name":        "Classical Simulation",
        "complexity":  "O(2^N)",
        "speedup":     "None",
        "best_for":    "Small-scale quantum system simulation",
        "color":       "#ef4444",
        "description": (
            "Explicitly store and update an exponentially large state vector classically. "
            "Limited to ~20 qubits due to memory constraints."
        ),
        "use_cases":   ["Quantum chemistry (molecules with <10 orbitals)", "Testing algorithms"],
    },
    {
        "id":          "routing_heuristics",
        "type":        "classical",
        "name":        "Routing heuristics (e.g. Google OR-Tools)",
        "complexity":  "Seconds to minutes for hundreds of stops",
        "speedup":     "None",
        "best_for":    "Vehicle routing with many stops, time windows and several vehicles",
        "color":       "#ef4444",
        "description": (
            "Build routes quickly with a savings or insertion method, then improve them with local search "
            "(2-opt, moving and swapping stops) or a metaheuristic such as guided local search or tabu search. "
            "Solvers like Google OR-Tools handle vehicles, time windows and driving limits."
        ),
        "use_cases":   ["Delivery routes", "Vehicle routing with time windows", "Field-service planning"],
    },
    {
        "id":          "optimisation_solver",
        "type":        "classical",
        "name":        "Integer programming solver (e.g. OR-Tools CP-SAT)",
        "complexity":  "Fast in practice for thousands of variables",
        "speedup":     "None",
        "best_for":    "Scheduling, budgets and allocation with constraints",
        "color":       "#ef4444",
        "description": (
            "Describe the choices, limits and goal as an integer program and let a mature solver search it. "
            "It returns proven-optimal answers for many real problems, or good ones within a time limit."
        ),
        "use_cases":   ["Knapsack and budgets", "Scheduling", "Portfolio selection", "Assignment"],
    },
    {
        "id":          "index_lookup",
        "type":        "classical",
        "name":        "Build an index (hash table or B-tree)",
        "complexity":  "O(N) once, then O(1) or O(log N) per lookup",
        "speedup":     "None",
        "best_for":    "Searching the same data many times",
        "color":       "#ef4444",
        "description": (
            "Spend one pass building an index, then every lookup takes a few steps. This is what databases do, "
            "and it beats any one-off scan when you search more than once."
        ),
        "use_cases":   ["Database queries", "Repeated lookups", "Matching records"],
    },
    {
        "id":          "number_field_sieve",
        "type":        "classical",
        "name":        "General number field sieve",
        "complexity":  "Sub-exponential",
        "speedup":     "None",
        "best_for":    "Factoring very large integers",
        "color":       "#ef4444",
        "description": (
            "The fastest known classical method for factoring large numbers. It has factored 829-bit RSA numbers "
            "with huge computing effort; 2048-bit RSA remains far out of reach, which is why it is still used."
        ),
        "use_cases":   ["Cryptanalysis research", "Testing key strength"],
    },
    {
        "id":          "classical_chemistry",
        "type":        "classical",
        "name":        "Classical chemistry methods (DFT, coupled cluster)",
        "complexity":  "Polynomial, with known accuracy limits",
        "speedup":     "None",
        "best_for":    "Energies and properties of molecules and materials",
        "color":       "#ef4444",
        "description": (
            "Density functional theory and coupled-cluster methods are today's workhorses for molecular energies. "
            "They are accurate for most molecules; strongly correlated ones remain hard."
        ),
        "use_cases":   ["Drug discovery", "Materials", "Reaction energies"],
    },
    {
        "id":          "eigensolver",
        "type":        "classical",
        "name":        "Classical eigensolvers (Lanczos, Davidson)",
        "complexity":  "Fast for sparse matrices",
        "speedup":     "None",
        "best_for":    "Finding a few eigenvalues of a large matrix",
        "color":       "#ef4444",
        "description": (
            "Iterative methods that find the lowest or largest eigenvalues of very large, sparse matrices "
            "without ever storing them in full."
        ),
        "use_cases":   ["Vibration and stability analysis", "Physics models", "Network analysis"],
    },
    {
        "id":          "hillclimbing",
        "type":        "classical",
        "name":        "Local search & metaheuristics",
        "complexity":  "O(N) per iteration",
        "speedup":     "None",
        "best_for":    "Approximate solutions for large combinatorial problems",
        "color":       "#ef4444",
        "description": (
            "Greedy local search to find good (but not always optimal) solutions quickly. "
            "No guarantee of optimality but fast in practice."
        ),
        "use_cases":   ["TSP approximation", "Scheduling", "Portfolio optimisation"],
    },
]

ALGORITHMS  = QUANTUM_ALGORITHMS + CLASSICAL_ALGORITHMS
ALGO_IDS    = [a["id"] for a in ALGORITHMS]
ALGO_MAP    = {a["id"]: a for a in ALGORITHMS}
QUANTUM_IDS = [a["id"] for a in QUANTUM_ALGORITHMS]
CLASSICAL_IDS = [a["id"] for a in CLASSICAL_ALGORITHMS]

# ── The model (module4_recommender/model.py) ─────────────────────────────────

FEATURE_NAMES = model.FEATURE_NAMES
_clf = model.train()
_feature_importances = {FEATURE_NAMES[i]: round(float(v) * 100, 2) for i, v in enumerate(_clf.feature_importances_)}

# ── NLP: extract problem features from free text ──────────────────────────────

CATEGORY_KEYWORDS = {
    0: ['search', 'find', 'locate', 'look up', 'lookup', 'retrieve', 'discover', 'detect'],
    1: ['factor', 'factoring', 'factorization', 'prime', 'rsa', 'integer decompos'],
    2: ['optim', 'minimize', 'minimise', 'maximise', 'maximize', 'shortest path', 'route', 'tsp',
        'traveling salesman', 'travelling salesman', 'schedule', 'portfolio', 'allocat', 'budget', 'assign',
        'shift', 'pack', 'container', 'cheapest', 'as few', 'as low as possible', 'most total',
        'shortest trip', 'shortest tour', 'round trip', 'order of stops', 'delivery route'],
    3: ['database', 'query', 'record', 'sql', 'table', 'row', 'column', 'data entry', 'lookup table'],
    4: ['simulat', 'molecule', 'molecular', 'chemistry', 'hamiltonian', 'energy level',
        'protein', 'drug discovery', 'material', 'quantum system', 'eigenvalue', 'eigenvector', 'unitary',
        'enzyme', 'electronic structure', 'binds'],
    5: ['machine learning', 'neural network', 'deep learning', 'classif', 'regression',
        'cluster', 'feature map', 'kernel', 'training data', 'model', 'predict', 'recommend', 'fraud',
        'recognis', 'recogniz', 'labelled examples', 'labeled examples'],
    6: ['graph', 'network flow', 'node', 'edge', 'vertex', 'colou', 'color', 'clique',
        'shortest path', 'spanning tree', 'network', 'power grid', 'substation', 'max cut', 'maximum cut'],
    7: ['encrypt', 'decrypt', 'cryptograph', 'cipher', 'rsa', 'aes', 'key exchange',
        'hash', 'password', 'secure communication', 'digital signature', 'private key', 'public key',
        'elliptic', 'bitcoin', 'wallet', 'discrete log', 'diffie'],
}

# ── Input validation: reject gibberish / off-topic text before classifying ────
# Without this gate, meaningless input (e.g. "adfg") hits zero category keywords,
# _extract_features_from_text silently falls back to category 0 ("Search") with
# a default data_size of 1,000,000 — a fake "large search problem" profile that
# the classifier then confidently (and wrongly) recommends Quantum for. We catch
# that here, before any feature extraction happens.

VOWELS = set("aeiouy")

_COMMON_WORDS = frozenset("""
a an the i you he she it we they is am are was were be been being have has had do does did
will would shall should can could may might must to of in on at for with by from up about
into over after before between and or but if because as until while this that these those
my your his her its our their not no yes so then than too very just also when where why how
what which who whom all each every some any few more most other such only own same
need needs want wants use uses used find finds finding get gets make makes take takes
give go come see know think look find search retrieve locate detect discover lookup
file files data dataset datasets record records row rows entry entries item items element elements
number numbers large small big huge many much million billion thousand hundred new old good bad
problem problems solve solving solution algorithm algorithms compute computes computation calculate
calculating calculation fast slow speed speedup time system program code test check help please
one two three four five ten hundred set list array table database query queries sort sorting
search searching factor factoring factorise factorize integer prime primes cryptography encrypt
decrypt secure security password key keys hash optimise optimize optimization optimisation
minimise minimize maximise maximize route routes routing shortest path graph network node edge
vertex vertices schedule scheduling portfolio allocation simulate simulation molecule molecular
chemistry energy protein drug material quantum classical machine learning neural deep model
training cluster clustering classify classification regression matrix vector equation function
input output result results value values size scale performance accuracy speed efficient
efficiently large-scale process processing task tasks job jobs
""".split())


def _looks_like_a_word(w: str) -> bool:
    """A loose 'is this plausibly an English/technical word' check — not a dictionary
    lookup, just enough to reject keyboard-mashing gibberish (e.g. 'adfg', 'kjhsdf')
    while accepting real words and domain acronyms (RSA, QAOA, VQE, TSP…)."""
    if len(w) <= 2:
        return True
    if w in _COMMON_WORDS:
        return True
    if not any(c in VOWELS for c in w):
        return False
    consonant_run = 0
    for c in w:
        if c in VOWELS:
            consonant_run = 0
        else:
            consonant_run += 1
            if consonant_run >= 4:
                return False
    return True


_GENERIC_PROBLEM_CUES = [
    'algorithm', 'data', 'dataset', 'record', 'database', 'number', 'compute', 'calculat',
    'search', 'sort', 'optimi', 'simulat', 'encrypt', 'graph', 'network', 'process', 'solve',
    'problem', 'factor', 'query', 'molecule', 'schedule', 'route', 'pattern', 'matrix', 'vector',
]


def _validate_problem_text(text: str, check_topic: bool = True) -> Optional[str]:
    """Return an error message if `text` doesn't read as a genuine problem description
    to analyse, or None if it passes. Runs three gates: enough substance, plausible
    words (not random characters), and at least some computing/problem relevance.
    The AI judges relevance better than keywords, so it skips the third gate."""
    cleaned = text.strip()
    words = re.findall(r"[A-Za-z]+", cleaned)

    if len(cleaned) < 15 or len(words) < 4:
        return (
            "That description is too short to classify reliably. Please describe the "
            "problem in a full sentence — what task you're solving and its scale "
            "(e.g. \"search 10 million unsorted records for a match\")."
        )

    checkable = [w.lower() for w in words if len(w) >= 3]
    if checkable:
        plausible = [w for w in checkable if _looks_like_a_word(w)]
        if len(plausible) / len(checkable) < 0.6:
            return (
                "This doesn't read as a real problem description — it looks like random "
                "characters. Please describe an actual computational problem in plain English."
            )

    if not check_topic:
        return None
    t = cleaned.lower()
    has_category_hit = any(kw in t for kws in CATEGORY_KEYWORDS.values() for kw in kws)
    has_generic_cue = any(c in t for c in _GENERIC_PROBLEM_CUES)
    has_digit = bool(re.search(r'\d', t))
    if not (has_category_hit or has_generic_cue or has_digit):
        return (
            "We couldn't identify a computational problem in that description. Please "
            "describe a task such as searching data, factoring numbers, optimisation/"
            "routing, database queries, or quantum simulation — including roughly how "
            "large the problem is."
        )

    return None

def _extract_features_from_text(text: str) -> dict:
    """Map free-text problem description to a feature vector for the RF classifier."""
    t = text.lower()

    # ── Explicit problem type detection (takes priority) ───────────────────────
    # These are strong signals that override generic keywords
    explicit_category = None

    # TSP and routing problems are inherently optimization problems
    if any(phrase in t for phrase in ['travelling salesman', 'traveling salesman', 'tsp', 'shortest route', 'shortest path', 'routing problem', 'vehicle routing',
                                      'shortest trip', 'shortest tour', 'round trip', 'order of stops', 'delivery route']):
        explicit_category = 2  # Optimization (TSP is fundamentally optimization, regardless of wording)

    # General optimization problems
    elif any(phrase in t for phrase in ['optimize', 'optimization', 'minimize', 'maximise', 'maximize', 'optimal solution', 'combinatorial']):
        explicit_category = 2  # Optimization

    # Factoring and cryptography problems
    if any(phrase in t for phrase in ['factor', 'factorization', 'factoring', 'prime', 'rsa']):
        explicit_category = 1  # Factoring

    # Quantum chemistry and simulation problems
    if any(phrase in t for phrase in ['drug discovery', 'quantum chemistry', 'molecule', 'molecular', 'hamiltonian', 'ground state', 'molecular simulation']):
        explicit_category = 4  # Quantum simulation/chemistry

    # ── Category detection ────────────────────────────────────────────────────
    category_scores = [0] * 8
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in t:
                category_scores[cat] += 1

    # Use explicit category if detected, otherwise use keyword-based detection
    if explicit_category is not None:
        best_cat = explicit_category
    elif max(category_scores) > 0:
        # "find" makes almost anything a search, so a tie goes to the more specific category
        top = max(category_scores)
        best_cat = next((c for c in range(1, 8) if category_scores[c] == top), 0)
    else:
        best_cat = 0

    # ── Boolean characteristic detection ─────────────────────────────────────
    unstructured  = any(w in t for w in ['unstructured', 'unsorted', 'random order', 'no index', 'unordered', 'scattered'])
    exact         = not any(w in t for w in ['approximate', 'heuristic', 'near optimal', 'near-optimal', 'good enough', 'estimate', 'approximat'])
    graph         = any(w in t for w in ['graph', 'network', 'node', 'edge', 'vertex', 'vertices', 'adjacen',
                                         'route', 'routing', 'city', 'cities', 'travelling', 'traveling', 'tsp', 'map'])
    security      = any(w in t for w in ['encrypt', 'decrypt', 'crypto', 'rsa', 'secure', 'password', 'key', 'cipher', 'hash'])
    continuous    = any(w in t for w in ['continuous', 'real-valued', 'float', 'decimal', 'probability amplitude', 'wave',
                                         'frequency', 'analog', 'energy', 'hamiltonian', 'molecul', 'eigen'])
    periodic      = any(w in t for w in ['periodic', 'period', 'cycle', 'fourier', 'frequency', 'oscillat', 'repeating pattern',
                                         'eigenvalue', 'eigenvector', 'phase', 'spectrum', 'spectral'])
    multi_sol     = any(w in t for w in ['multiple solution', 'many solution', 'several solution', 'all solution', 'satisf',
                                         'any valid', 'all records', 'matching', 'several conditions'])
    # looking for every match (or counting them) rather than one item
    if best_cat in (0, 3) and re.search(r'\b(all|every|each|which|how many|count)\b', t):
        multi_sol = True
    # breaking a cipher by trying keys or passwords is an unstructured search; public-key systems have structure
    if best_cat == 7:
        unstructured = any(w in t for w in ['password', 'hash', 'aes', 'brute', 'candidate', 'symmetric', 'guess'])
    # Combinatorial optimisation: many good candidate solutions, approximate answers are acceptable
    if best_cat in (2, 6):
        multi_sol = True
        exact = exact and any(w in t for w in ['exact', 'guarantee', 'provably'])

    # ── Data size detection ───────────────────────────────────────────────────
    # Look for explicit numbers, words like "billion", "million", "thousand", or counted things
    data_size = _default_size(best_cat)
    size_patterns = [
        (r'(\d[\d,]*)\s*billion', 1_000_000_000),
        (r'(\d[\d,]*)\s*million', 1_000_000),
        (r'(\d[\d,]*)\s*thousand', 1_000),
        (r'(\d[\d,]*)\s*(?:rows?|records?|entries|items?|elements?|samples?)', 1),
        (r'(\d[\d,]*)\s*(?:cities|city|nodes?|locations?|stops?|stores?|trucks?|vehicles?|assets?|stocks?|projects?|'
         r'tasks?|jobs?|users?|patients?|customers?|molecules?|atoms?|orbitals?|qubits?|variables?|hashes|keys?)', 1),
        (r'\bn\s*=\s*(\d[\d,]*)', 1),
    ]
    found_sizes = []
    for pattern, multiplier in size_patterns:
        for m in re.finditer(pattern, t):
            val = int(m.group(1).replace(',', '')) * multiplier
            if val >= 2:
                found_sizes.append(val)
    if not found_sizes:
        bare_numbers = [int(m.replace(',', '')) for m in re.findall(r'\b(\d[\d,]{2,})\b', t)]
        found_sizes = [n for n in bare_numbers if n >= 100]
    if found_sizes:
        data_size = max(found_sizes)
    elif best_cat in (2, 6):
        # a route through named cities: its size is how many there are
        named = [c for c in KNOWN_CITIES if re.search(rf"\b{re.escape(c)}\b", t)]
        if len(named) >= 3:
            data_size = len(named)

    return {
        "problem_category":    best_cat,
        "data_size":           data_size,
        "unstructured_data":   unstructured,
        "needs_exact_answer":  exact,
        "has_graph_structure": graph,
        "is_security_related": security,
        "continuous_vars":     continuous,
        "periodic_structure":  periodic,
        "multi_solution":      multi_sol,
    }

def _default_size(category: int) -> int:
    """The problem size assumed when the description doesn't give one."""
    return {2: 100, 4: 50, 6: 1_000}.get(category, 1_000_000)


REASON_TEMPLATES = {
    # Quantum algorithms
    "grovers":       "Your problem involves searching an unstructured space — Grover's √N oracle calls give a direct quadratic speedup over any classical linear scan.",
    "shors":         "The periodic or cryptographic nature of your problem maps directly to Shor's QFT-based period-finding, delivering exponential advantage.",
    "qaoa":          "Combinatorial optimisation, choosing the best of very many possible combinations, is what QAOA's variational circuits are built for, though no speed-up over classical solvers has been shown.",
    "amplitude_amp": "Multiple valid solutions in an unstructured space make Amplitude Amplification the strongest match — it generalises Grover's to any 'good state' subspace.",
    "vqe":           "Continuous variables and simulation requirements point to VQE's hybrid variational energy minimisation, designed for quantum chemistry, though it has no proven speed-up yet.",
    "qpe":           "Your need for precise eigenvalue or phase estimation makes Quantum Phase Estimation the optimal choice.",
    # Classical algorithms
    "linear_search":       "For this problem size, a straightforward sequential search is the practical choice — no data structure overhead, simple to implement and debug.",
    "trial_division":      "Trial division is the standard classical approach for small to medium integers. Exponentially slow for RSA-sized numbers, but adequate for testing.",
    "dynamic_programming": "Dynamic Programming caches subproblem results to avoid redundant work. Effective for small instances but becomes impractical at scale.",
    "binary_search":       "Binary search on sorted data provides O(log N) lookup — significantly faster than linear scan for structured, pre-indexed data.",
    "classical_simulation": "Classical state-vector simulation explicitly tracks all quantum amplitudes. Limited to ~20 qubits but works perfectly for small systems and algorithm testing.",
    "hillclimbing":        "Local search and metaheuristics (simulated annealing, tabu search) quickly find good, often near-optimal answers without the exponential blow-up of trying everything.",
    "routing_heuristics":  "Routing heuristics build good routes in seconds to minutes and keep improving them, handling vehicles, time windows and driving limits. They are what delivery companies use today.",
    "optimisation_solver": "A mature integer programming solver handles the constraints directly and returns optimal or near-optimal answers quickly for problems of this size.",
    "index_lookup":        "Build an index once and every later lookup takes a few steps; for a single search, one pass over the data is already fast.",
    "number_field_sieve":  "The number field sieve is the fastest known classical way to factor large numbers; for RSA-sized numbers it is still far too slow, which is what keeps RSA safe today.",
    "classical_chemistry": "Classical chemistry methods such as DFT and coupled cluster give reliable energies for most molecules today.",
    "eigensolver":         "Iterative classical eigensolvers find the eigenvalues you need from very large, sparse matrices.",
}

def _rank_quantum(features: dict) -> List[tuple]:
    """The model's ranking of the quantum algorithms, kept consistent with the problem type (model.rank)."""
    return model.rank(_clf, features)


def _card(algo_id: str, rank: int, confidence: Optional[float] = None) -> dict:
    a = ALGO_MAP[algo_id]
    return {
        "rank":           rank,
        "algorithm_id":   algo_id,
        "algorithm_name": a["name"],
        "confidence":     confidence,
        "color":          a["color"],
        "complexity":     a["complexity"],
        "speedup":        a["speedup"],
        "reason":         REASON_TEMPLATES.get(algo_id, "Suitable based on your problem profile."),
        "use_cases":      a["use_cases"],
    }


def _recommend(features: dict, text: str = "") -> dict:
    """
    The model picks the quantum algorithm that fits; the reality check then says what to use today
    (and why), what a future error-corrected quantum computer could offer, and the limits right now.
    """
    ranked = _rank_quantum(features)
    qid, qconf = ranked[0]
    q = ALGO_MAP[qid]
    check = reality.assess(qid, q["name"], features, text)
    classical = [_card(c, i) for i, c in enumerate(check["classical"], 1)]
    best = classical[0]
    return {
        "approach":           check["today"]["approach"],      # the best approach today
        "approach_reason":    check["today"]["reason"],
        "top_algorithm_id":   best["algorithm_id"],
        "top_algorithm_name": best["algorithm_name"],
        "today":              {**check["today"], "algorithm": best},
        "classical_options":  classical,
        "quantum": {
            "algorithm_id":  qid,
            "name":          q["name"],
            "complexity":    q["complexity"],
            "color":         q["color"],
            "speedup":       check["speedup"],
            "proven":        check["proven"],
            "qubits_needed": check["qubits_needed"],
            "verdict":       check["future"]["approach"],
            "reason":        check["future"]["reason"],
            "confidence":    qconf,
        },
        "limits":             check["limits"],
        "try_here":           check["try_here"],
        "solve":              _solve_plan(qid, check["routing"]),
        "model_confidence":   qconf,
        "recommendations":    [_card(a, i, c) for i, (a, c) in enumerate(ranked, 1)],
        "detected_features":  {
            "category_label":      CATEGORY_LABELS.get(features["problem_category"], "Unknown"),
            "data_size":           features["data_size"],
            "unstructured_data":   features["unstructured_data"],
            "has_graph_structure": features["has_graph_structure"],
            "is_security_related": features["is_security_related"],
            "continuous_vars":     features["continuous_vars"],
            "periodic_structure":  features["periodic_structure"],
        },
    }

def _solve_plan(qid: str, routing: bool) -> Optional[dict]:
    """How "Solve it here" solves this problem with the SFOD suite (None: the suite doesn't cover it)."""
    kind = data_reader.solve_kind(qid, routing)
    if kind is None:
        return None
    classical = {"search": "linear search", "database": "a sequential scan", "factoring": "trial division",
                 "tsp": "exhaustive search", "qaoa": "exhaustive search"}[kind]
    quantum = "QAOA" if kind == "tsp" else ALGO_MAP[qid]["name"]
    return {"kind": kind, "label": data_reader.LABELS[kind], "classical": classical, "quantum": quantum}


CATEGORY_LABELS = {
    0: "Search", 1: "Factoring", 2: "Optimisation", 3: "Database",
    4: "Simulation", 5: "Machine Learning", 6: "Graph", 7: "Cryptography",
}

# ── File text for the reader ──────────────────────────────────────────────────

ADVISOR_FORMATS = file_text.FORMATS


def _reader_text(ext: str, lines: List[str]) -> str:
    """What the reader sees: a data file is described by its size and first rows; other files are read as text."""
    if ext in ("csv", "tsv", "json"):
        return (f"A data file with {len(lines):,} records. The first ones:\n" + "\n".join(lines[:5])
                + f"\nThis is a structured database query or search problem over {len(lines):,} records.")
    return "\n".join(lines)[:20_000]


def _looks_like_data(ext: str, lines: List[str]) -> bool:
    """A table, or a list of short lines, is data to solve; a page of sentences describes the problem."""
    if ext in ("csv", "tsv", "json"):
        return True
    short = sum(1 for ln in lines if len(ln.split()) <= 12)
    return len(lines) >= 3 and short >= 0.8 * len(lines)


# ── Endpoints ─────────────────────────────────────────────────────────────────

Mode = Literal["auto", "local"]


class AdviseTextRequest(BaseModel):
    problem_text: str = Field(..., max_length=20_000)
    mode:         Mode = "auto"          # auto: the AI reads it (built-in reader if it can't); local: built-in only


def _advise(text: str, mode: str, user: User) -> Dict[str, Any]:
    """Read the problem (AI or keywords), let the Random Forest choose, and have the AI explain the choice."""
    # Too short, or random characters: turned away before anything is sent to the AI.
    problem = _validate_problem_text(text, check_topic=False)
    if problem:
        raise HTTPException(422, problem)

    read, note = None, None
    if mode == "auto":
        try:
            read = ai_reader.read_problem(text, user.id)
        except ai.AIUnavailable as e:
            note = f"{e.message} The built-in reader was used instead."
        except ValueError:
            note = "The AI's answer couldn't be used, so the built-in reader was used instead."

    if read and read["off_topic"]:
        return {"off_topic": True, "message": read["redirect"], "ai_status": ai.status(user.id)}

    if read:
        features = dict(read["features"])
        if features["data_size"] is None:
            features["data_size"] = _default_size(features["problem_category"])
    else:
        problem = _validate_problem_text(text)
        if problem:
            raise HTTPException(422, problem)
        features = _extract_features_from_text(text)

    result = _recommend(features, text)
    result["engine"] = "ai" if read else "built-in"
    if read:
        result["summary"] = read["summary"]
        result["ai"] = {"model": read["model"], "saved": read["saved"]}
        # the person's own words when short (so a direct question gets answered), else the AI's summary
        result["explanation"] = ai_reader.explain(text if len(text) <= 2000 else read["summary"] or text[:2000],
                                                  result, user.id)
    if note:
        result["ai_note"] = note
    result["ai_status"] = ai.status(user.id)
    return result


@router.post("/advise")
def advise_text(req: AdviseTextRequest, user: User = Depends(get_current_user)):
    """Analyse a free-text problem description and recommend the best approach."""
    if not req.problem_text.strip():
        raise HTTPException(400, "problem_text cannot be empty.")
    result = _advise(req.problem_text, req.mode, user)
    result["source"] = "text"
    result["input_preview"] = req.problem_text[:300]
    return result


@router.post("/advise-file")
async def advise_file(file: UploadFile = File(...), mode: Mode = Form("auto"), user: User = Depends(get_current_user)):
    """Read an uploaded file (up to 5 MB) and analyse the problem; its lines come back as the data to solve."""
    ext, lines = await file_text.read_lines(file, ADVISOR_FORMATS)
    extracted = _reader_text(ext, lines)
    result = _advise(extracted, mode, user)
    result["source"]        = "file"
    result["filename"]      = file.filename
    result["input_preview"] = extracted[:300]
    data = _looks_like_data(ext, lines)
    # a table's description above is QAIbridge's own words, not the user's: only the rows go on to be solved
    result["problem_text"]  = "" if ext in ("csv", "tsv", "json") else extracted
    result["data_lines"]    = lines[:data_reader.MAX_ITEMS] if data else []
    return result


# ── Solving it (FE-3) ─────────────────────────────────────────────────────────

class ReadDataRequest(BaseModel):
    problem_text: str = Field("", max_length=20_000)
    data_lines:   List[str] = Field(default_factory=list, max_length=data_reader.MAX_ITEMS)
    kind:         Literal["search", "database", "factoring", "tsp", "qaoa"]
    mode:         Mode = "auto"


@router.post("/read-data")
def read_data(req: ReadDataRequest, user: User = Depends(get_current_user)):
    """The data to solve, read from the problem (or a small example, said so), for the user to check and edit."""
    if not req.problem_text.strip() and not req.data_lines:
        raise HTTPException(422, "There is no problem to read the data from.")
    out = data_reader.read(req.problem_text, req.data_lines, req.kind, req.mode, user.id)
    out["ai_status"] = ai.status(user.id)
    return out


class SolveRequest(BaseModel):
    spec:   Dict[str, Any]
    layers: int = Field(2, ge=1, le=3)


def _classical_only(spec: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The classical answer alone, for data too big for the simulator (None for other problem types)."""
    kind, p = spec.get("problem_type"), spec.get("parameters") or {}
    if kind == "search":
        return custom_solver.solve_search_classical([str(x) for x in p.get("items") or []], str(p.get("target") or "")).to_dict()
    if kind == "database":
        return custom_solver.solve_database_classical([str(x) for x in p.get("records") or []], str(p.get("query") or "")).to_dict()
    if kind == "factoring":
        return custom_solver.solve_factoring_classical(int(p["N"])).to_dict()
    if kind == "tsp" and p.get("cities") and 3 <= len(p["cities"]) <= 12:
        return custom_solver.solve_optimization_classical([str(c) for c in p["cities"]]).to_dict()
    return None


@router.post("/solve")
def solve(req: SolveRequest, user: User = Depends(get_current_user)):
    """
    Solve the problem's data both ways with the SFOD suite. When the data is too big for the simulator,
    the classical answer comes back alone, with the reason.
    """
    try:
        with simulation_slot():
            result = pipeline.execute(req.spec, layers=req.layers, shots=1024)
    except MemoryError as e:
        raise HTTPException(400, str(e))
    except (ValueError, KeyError, TypeError, IndexError) as e:
        reason = f"Missing {e} in the data." if isinstance(e, KeyError) else str(e)
        try:
            classical = _classical_only(req.spec)
        except (ValueError, KeyError, TypeError, IndexError):
            classical = None
        if classical is None or classical.get("error"):
            raise HTTPException(422, reason)
        return {"classical_only": True, "reason": reason, "classical": classical}
    title, summary = history.advisor_summary(req.spec, result)
    history.record_run(user.id, KIND_ADVISOR, title, summary, duration_ms=result.get("total_ms"))
    return result


@router.get("/algorithms")
def get_algorithms():
    return {"algorithms": ALGORITHMS}

# How well the model does on real problems it never trained on: with the facts filled in correctly, and with the
# built-in keyword reader filling them in from the text. "held_out" was never used to tune the model or the reader;
# "labelled" was used while building them, so it flatters them.
MODEL_TEST = {
    name: {"facts": model.accuracy(_clf, lambda item: item["features"], items),
           "built_in_reader": model.accuracy(_clf, lambda item: _extract_features_from_text(item["text"]), items)}
    for name, items in (("held_out", model.held_out_problems()), ("labelled", model.labelled_problems()))
}


@router.get("/model-info")
def model_info():
    return {
        "model":               "Random Forest Classifier",
        "n_estimators":        _clf.n_estimators,
        "trained_on":          f"{len(model.PROFILES) * 400} generated examples of {len(model.PROFILES)} problem profiles",
        "tested_on":           "real problem descriptions labelled by hand, never used for training (held_out: never used "
                               "to tune anything either)",
        "test":                MODEL_TEST,
        "features":            FEATURE_NAMES,
        "feature_importances": _feature_importances,
        "classes":             QUANTUM_IDS,
    }
