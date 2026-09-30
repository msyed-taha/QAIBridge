"""
Module 5 – Classical → Quantum Logic Transformer
analyzer.py  –  Local (offline) understanding of classical code.

Reads Python code (or a plain Boolean formula) with the `ast` module — the
code is parsed, never executed — and produces the same structured
"problem spec" the LLM engine produces:

    {problem_type, parameters, confidence, evidence, explanation, quantum_algorithm}

problem_type ∈ search · database · factoring · tsp · knapsack · maxcut ·
               partition · portfolio · boolean · unsupported

It recognises the common shapes of each problem (loops comparing against a
target, modulo tests, permutations over distances, (name, weight, value)
tuples, edge lists, Boolean return expressions…) and pulls the concrete data
out of literal assignments and call arguments. When the LLM engine is
configured it is used first and this analyzer is the fallback.
"""

from __future__ import annotations

import ast
import re
from typing import Any, Dict, List, Optional, Tuple

from .boolean_logic import parse_logic

ALGORITHM_FOR = {
    "search": "Grover's search",
    "database": "Amplitude amplification",
    "factoring": "Shor's algorithm",
    "tsp": "QAOA on an Ising Hamiltonian (TSP → QUBO)",
    "knapsack": "QAOA on an Ising Hamiltonian (knapsack → QUBO)",
    "maxcut": "QAOA on an Ising Hamiltonian (Max-Cut)",
    "partition": "QAOA on an Ising Hamiltonian (number partitioning)",
    "portfolio": "QAOA on an Ising Hamiltonian (portfolio → QUBO)",
    "boolean": "Reversible oracle + Grover (Boolean satisfiability)",
    "unsupported": "—",
}

UNSUPPORTED_REASONS = {
    "sorting": ("Sorting has no quantum speed-up: comparison sorting needs Ω(N log N) comparisons on a quantum "
                "computer too (Høyer, Neerbek & Shi, 2001). QAIBridge will not invent one — keep it classical."),
    "matrix": ("Dense matrix multiplication has no practical quantum speed-up for classical input/output. "
               "Quantum linear-algebra algorithms (HHL) only help for sparse, well-conditioned systems when a "
               "summary of the answer suffices — not for returning the full product."),
    "general": ("No quantum-suitable structure was recognised. QAIBridge maps search, database queries, factoring, "
                "combinatorial optimisation (routes, knapsack, graph cuts, partitioning) and Boolean constraint "
                "logic. Try one of the examples, or describe the problem in one of these forms."),
}


# ── literal extraction helpers ────────────────────────────────────────────────

def _literal(node: ast.AST) -> Any:
    try:
        return ast.literal_eval(node)
    except Exception:
        return None


class _Facts(ast.NodeVisitor):
    """Collects literal assignments, calls, comparisons and structural clues."""

    def __init__(self) -> None:
        self.assign: Dict[str, Any] = {}
        self.calls: List[Tuple[str, List[Any]]] = []
        self.names: set = set()
        self.func_names: List[str] = []
        self.modulo_zero = 0
        self.eq_compares: List[Tuple[str, str]] = []
        self.compares: List[ast.Compare] = []
        self.return_exprs: List[ast.AST] = []
        self.loops = 0
        self.swaps = 0
        self.permutations = False
        self.imports: set = set()

    def visit_Import(self, node):
        for a in node.names:
            self.imports.add(a.name.split(".")[0])

    def visit_ImportFrom(self, node):
        if node.module:
            self.imports.add(node.module.split(".")[0])
        for a in node.names:
            if a.name == "permutations":
                self.permutations = True

    def visit_Assign(self, node):
        value = _literal(node.value)
        for t in node.targets:
            if isinstance(t, ast.Name) and value is not None:
                self.assign[t.id] = value
            if isinstance(t, ast.Tuple) and isinstance(node.value, ast.Tuple) and len(t.elts) == len(node.value.elts):
                self.swaps += 1
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self.func_names.append(node.name.lower())
        self.generic_visit(node)

    def visit_For(self, node):
        self.loops += 1
        self.generic_visit(node)

    def visit_While(self, node):
        self.loops += 1
        self.generic_visit(node)

    def visit_Name(self, node):
        self.names.add(node.id.lower())

    def visit_Attribute(self, node):
        if node.attr == "permutations":
            self.permutations = True
        self.generic_visit(node)

    def visit_Call(self, node):
        fname = node.func.id if isinstance(node.func, ast.Name) else (
            node.func.attr if isinstance(node.func, ast.Attribute) else "")
        if fname == "permutations":
            self.permutations = True
        args = []
        for a in node.args:
            if isinstance(a, ast.Name):
                args.append(("name", a.id))
            else:
                lit = _literal(a)
                args.append(("lit", lit))
        self.calls.append((fname.lower(), args))
        self.generic_visit(node)

    def visit_Compare(self, node):
        self.compares.append(node)
        if (isinstance(node.left, ast.BinOp) and isinstance(node.left.op, ast.Mod)
                and any(isinstance(c, ast.Constant) and c.value == 0 for c in node.comparators)):
            self.modulo_zero += 1
        if len(node.ops) == 1 and isinstance(node.ops[0], ast.Eq):
            self.eq_compares.append((ast.unparse(node.left), ast.unparse(node.comparators[0])))
        self.generic_visit(node)

    def visit_Return(self, node):
        if node.value is not None:
            self.return_exprs.append(node.value)
        self.generic_visit(node)


def _resolve(arg: Tuple[str, Any], assign: Dict[str, Any]) -> Any:
    kind, val = arg
    return assign.get(val) if kind == "name" else val


def _numeric_list(v: Any) -> bool:
    return isinstance(v, (list, tuple)) and len(v) >= 2 and all(isinstance(x, (int, float)) for x in v)


def _is_matrix(v: Any) -> bool:
    return (isinstance(v, (list, tuple)) and len(v) >= 3 and all(_numeric_list(r) and len(r) == len(v) for r in v))


def _boolean_expr_text(node: ast.AST) -> Optional[str]:
    """Accept `a and not (b or c)` style expressions over plain names only."""
    allowed = (ast.BoolOp, ast.UnaryOp, ast.Name, ast.And, ast.Or, ast.Not, ast.Load,
               ast.BinOp, ast.BitXor, ast.BitAnd, ast.BitOr, ast.Constant, ast.Compare, ast.Eq, ast.NotEq)
    for sub in ast.walk(node):
        if not isinstance(sub, allowed):
            return None
        if isinstance(sub, ast.UnaryOp) and not isinstance(sub.op, ast.Not):
            return None
        if isinstance(sub, ast.Constant) and not isinstance(sub.value, bool):
            return None
    if not any(isinstance(s, (ast.BoolOp, ast.UnaryOp, ast.BinOp, ast.Compare)) for s in ast.walk(node)):
        return None
    text = ast.unparse(node)
    return text.replace("True", "1").replace("False", "0")


# ── the analyzer ──────────────────────────────────────────────────────────────

def analyze_code(code: str) -> Dict[str, Any]:
    code = (code or "").strip()
    if not code:
        raise ValueError("Paste some classical code or a Boolean formula first.")

    # A bare Boolean formula (not a program) — e.g. "(a and not b) or c"
    if "\n" not in code and not re.search(r"\b(def|for|while|import|print|return)\b", code):
        try:
            _, variables = parse_logic(code)
            return _spec("boolean", {"expression": code}, 0.95,
                         [f"Input is a Boolean formula over {len(variables)} variable(s): {', '.join(variables)}"])
        except ValueError:
            pass

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return _regex_fallback(code, f"Not valid Python (line {e.lineno}): analysed as text instead.")

    f = _Facts()
    f.visit(tree)
    text = code.lower()
    scores: Dict[str, float] = {k: 0.0 for k in ALGORITHM_FOR if k != "unsupported"}
    evidence: Dict[str, List[str]] = {k: [] for k in scores}
    params: Dict[str, Dict[str, Any]] = {k: {} for k in scores}

    def hit(kind: str, weight: float, why: str) -> None:
        scores[kind] += weight
        evidence[kind].append(why)

    lists = {k: v for k, v in f.assign.items() if isinstance(v, (list, tuple))}
    ints = {k: v for k, v in f.assign.items() if isinstance(v, int) and not isinstance(v, bool)}

    # ── factoring ──
    if f.modulo_zero:
        hit("factoring", 2.0, "divisibility test `n % i == 0` inside a loop")
    if re.search(r"factor|prime|divisor|gcd|rsa", text):
        hit("factoring", 1.5, "names mention factors / primes")
    n_candidate = None
    for fname, args in f.calls:
        if re.search(r"factor|prime|divis", fname) and args:
            v = _resolve(args[0], f.assign)
            if isinstance(v, int) and v > 2:
                n_candidate = v
    if n_candidate is None:
        for name in ("n", "number", "num", "N", "target", "value"):
            if isinstance(f.assign.get(name), int) and f.assign[name] > 2:
                n_candidate = f.assign[name]
                break
    if n_candidate is None and ints:
        n_candidate = max(ints.values())
    if n_candidate:
        params["factoring"] = {"N": int(n_candidate)}

    # ── search ──
    if f.loops and f.eq_compares:
        hit("search", 1.5, "loop comparing elements with `==`")
    if re.search(r"search|find|locate|lookup|index", text):
        hit("search", 1.0, "names mention searching")
    items, target = None, None
    for fname, args in f.calls:
        if re.search(r"search|find|locate|index", fname) and len(args) >= 2:
            items = _resolve(args[0], f.assign)
            target = _resolve(args[1], f.assign)
    if items is None:
        for name, v in lists.items():
            if all(isinstance(x, (int, str, float)) for x in v) and len(v) >= 2:
                items = v
                break
    if target is None:
        for name in ("target", "key", "needle", "wanted", "x"):
            if name in f.assign and not isinstance(f.assign[name], (list, tuple, dict)):
                target = f.assign[name]
    if isinstance(items, (list, tuple)) and target is not None:
        params["search"] = {"items": [str(x) for x in items], "target": str(target)}
        hit("search", 0.5, f"found the data ({len(items)} items) and the target {target!r}")

    # ── database ──
    records = None
    for name, v in lists.items():
        if v and all(isinstance(r, dict) for r in v):
            records = v
            break
    if records:
        hit("database", 2.0, f"a table of {len(records)} records (list of dicts)")
        query = _query_from_compares(f.compares)
        rows = [" · ".join(f"{k} {val}" for k, val in r.items()) for r in records]
        params["database"] = {"records": rows, "query": query or ""}
        if query:
            hit("database", 1.0, f"a filter condition: {query}")
    if re.search(r"record|row|table|query|select|where|database|employee", text):
        hit("database", 0.8, "names mention records / queries")

    # ── TSP ──
    matrix = next((v for v in lists.values() if _is_matrix(v)), None)
    if f.permutations:
        hit("tsp", 1.5, "enumerates permutations (every possible route)")
    if re.search(r"distance|dist|route|tour|city|cities|salesman|tsp|travel", text):
        hit("tsp", 1.5, "names mention distances / routes / cities")
    capacity = next((f.assign[k] for k in ("budget", "capacity", "max_weight", "limit", "W", "C")
                     if isinstance(f.assign.get(k), (int, float))), None)
    tsp_words = re.search(r"distance|dist|route|tour|salesman|tsp|travel", text)
    city_coords = next((v for k, v in lists.items()
                        if v and (re.search(r"cit|stop|location|place|point|coord|depot", k.lower()) or
                                  (tsp_words and capacity is None))
                        and all(isinstance(c, (list, tuple)) and len(c) == 3 and isinstance(c[0], str)
                                and all(isinstance(z, (int, float)) for z in c[1:]) for c in v)), None)
    city_names = next((v for k, v in lists.items() if re.search(r"cit", k.lower()) and v
                       and all(isinstance(c, str) for c in v)), None)
    if city_coords:
        params["tsp"] = {"cities": [f"{c[0]}, {c[1]}, {c[2]}" for c in city_coords]}
        hit("tsp", 1.0, f"{len(city_coords)} cities with coordinates")
    elif matrix:
        params["tsp"] = {"distance_matrix": [list(map(float, r)) for r in matrix]}
        hit("tsp", 1.0, f"a {len(matrix)}×{len(matrix)} distance matrix")
    elif city_names:
        params["tsp"] = {"cities": list(city_names)}
        hit("tsp", 0.8, f"{len(city_names)} city names")

    # ── knapsack ──
    if re.search(r"knapsack|budget|capacity|weight|cost", text) and re.search(r"value|profit|benefit|score", text):
        hit("knapsack", 2.0, "maximises value under a budget / capacity")
    item_tuples = next((v for v in lists.values() if v and all(
        isinstance(t, (list, tuple)) and len(t) == 3 and isinstance(t[0], str)
        and all(isinstance(z, (int, float)) for z in t[1:]) for t in v)), None)
    if item_tuples and capacity is not None and item_tuples is not city_coords:
        params["knapsack"] = {"names": [t[0] for t in item_tuples], "weights": [int(t[1]) for t in item_tuples],
                              "values": [float(t[2]) for t in item_tuples], "capacity": int(capacity)}
        hit("knapsack", 1.0, f"{len(item_tuples)} (name, weight, value) items and capacity {capacity}")
    elif capacity is not None and "weights" in f.assign and "values" in f.assign:
        params["knapsack"] = {"names": [f"item{i}" for i in range(len(f.assign['weights']))],
                              "weights": [int(w) for w in f.assign["weights"]],
                              "values": [float(v) for v in f.assign["values"]], "capacity": int(capacity)}
        hit("knapsack", 1.0, "weights, values and capacity lists")

    # ── Max-Cut ──
    edges = next((v for k, v in lists.items() if v and all(
        isinstance(e, (list, tuple)) and len(e) in (2, 3) and all(isinstance(z, (int, float)) for z in e) for e in v)
        and not _is_matrix(v)), None)
    if edges and re.search(r"cut|edge|graph|partition|node|vertex", text):
        n_nodes = int(max(max(e[0], e[1]) for e in edges)) + 1
        params["maxcut"] = {"n_nodes": n_nodes,
                            "edges": [[int(e[0]), int(e[1]), float(e[2]) if len(e) == 3 else 1.0] for e in edges]}
        hit("maxcut", 2.0 if re.search(r"\bcut\b|max_cut|maxcut", text) else 1.0,
            f"a graph with {n_nodes} nodes and {len(edges)} edges")

    # ── number partitioning ──
    if re.search(r"partition|split|equal sum|balance|two groups|subset", text):
        nums = next((v for v in lists.values() if _numeric_list(v)), None)
        if nums and not params["maxcut"]:
            params["partition"] = {"numbers": [float(x) for x in nums]}
            hit("partition", 2.0, f"splits {len(nums)} numbers into two balanced groups")

    # ── portfolio selection (financial data) ──
    if re.search(r"portfolio|stock|asset|invest|sharpe|ticker|volatility", text):
        hit("portfolio", 1.5, "names mention stocks / portfolios / returns")
        num_lists = {k: v for k, v in lists.items() if _numeric_list(v)}
        str_lists = {k: v for k, v in lists.items() if v and all(isinstance(x, str) for x in v)}
        names = next((v for k, v in str_lists.items() if re.search(r"stock|asset|ticker|share|compan|name|symbol", k.lower())),
                     next(iter(str_lists.values()), None))
        rets = next((v for k, v in num_lists.items() if re.search(r"return|mu|expected|gain|yield", k.lower())), None)
        vols = next((v for k, v in num_lists.items() if re.search(r"vol|risk|std|sigma|deviation", k.lower())), None)
        cov = next((v for k, v in lists.items() if _is_matrix(v) and re.search(r"cov|sigma|corr", k.lower())), None)
        k_hold = next((f.assign[k] for k in ("k", "hold", "pick", "choose", "num_assets", "n_assets", "select", "budget")
                       if isinstance(f.assign.get(k), int) and not isinstance(f.assign.get(k), bool)), None)
        q = next((f.assign[k] for k in ("risk_aversion", "q", "lam", "lambda_", "gamma", "risk_weight")
                  if isinstance(f.assign.get(k), (int, float)) and not isinstance(f.assign.get(k), bool)), 0.5)
        if names and rets and len(names) == len(rets) and (vols or cov) and k_hold:
            params["portfolio"] = {"names": list(names), "returns": [float(x) for x in rets], "k": int(k_hold),
                                   "risk_aversion": float(q)}
            if cov:
                params["portfolio"]["cov"] = [[float(x) for x in row] for row in cov]
            else:
                params["portfolio"]["volatility"] = [float(x) for x in vols]
            hit("portfolio", 1.5, f"{len(names)} assets with returns and risk; hold {k_hold}")

    # ── Boolean logic ──
    bool_expr = None
    for expr in f.return_exprs:
        t = _boolean_expr_text(expr)
        if t:
            bool_expr = t
            break
    if bool_expr:
        try:
            _, variables = parse_logic(bool_expr)
            params["boolean"] = {"expression": bool_expr}
            hit("boolean", 3.0, f"returns a Boolean formula over {len(variables)} input(s): {bool_expr}")
        except ValueError:
            pass
    clauses = next((v for k, v in lists.items() if v and all(
        isinstance(c, (list, tuple)) and c and all(isinstance(z, int) and z != 0 for z in c) for c in v)
        and re.search(r"clause|cnf|sat", k.lower() + text)), None)
    if clauses and not bool_expr:
        expr = " and ".join("(" + " or ".join((f"x{abs(z)}" if z > 0 else f"not x{abs(z)}") for z in c) + ")"
                            for c in clauses)
        params["boolean"] = {"expression": expr}
        hit("boolean", 3.0, f"CNF clauses ({len(clauses)}) in DIMACS style")

    # ── patterns with no quantum speed-up (answered honestly) ──
    best_score = max(scores.values())
    sort_score = (2.0 if f.swaps and f.loops >= 2 else 0.0) \
        + (2.0 if any("sort" in fn for fn in f.func_names) else 0.0) \
        + (0.5 if re.search(r"\.sort\(|sorted\(", text) else 0.0)
    if sort_score >= 2.0 and sort_score >= best_score:
        return _unsupported("sorting", ["sorting pattern (element swaps inside nested loops / a sort routine)"])
    if matrix and re.search(r"matmul|matrix_multiply|dot\(|@", text) and scores["tsp"] < 2:
        return _unsupported("matrix", ["matrix multiplication pattern"])

    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    for kind, score in ranked:
        if score >= 1.5 and params[kind]:
            conf = min(0.95, 0.35 + 0.15 * score)
            return _spec(kind, params[kind], conf, evidence[kind])
    best = ranked[0][0]
    if ranked[0][1] >= 1.5:
        return _spec(best, params[best], 0.4, evidence[best] + ["could not extract all the input data — edit the parameters"],
                     incomplete=True)
    return _unsupported("general", ["no known quantum-suitable structure"])


def _query_from_compares(compares: List[ast.Compare]) -> Optional[str]:
    ops = {ast.Gt: ">", ast.Lt: "<", ast.GtE: ">=", ast.LtE: "<=", ast.Eq: "=", ast.NotEq: "!="}
    for c in compares:
        if len(c.ops) != 1:
            continue
        left, right, op = c.left, c.comparators[0], type(c.ops[0])
        if isinstance(c.ops[0], ast.In) and isinstance(left, ast.Constant) and isinstance(left.value, str):
            return left.value
        key = None
        if isinstance(left, ast.Subscript):
            key = _literal(left.slice)
        elif isinstance(left, ast.Attribute):
            key = left.attr
        value = _literal(right)
        if isinstance(key, str) and op in ops and value is not None:
            return f"{key} {ops[op]} {value}"
    return None


def _regex_fallback(code: str, note: str) -> Dict[str, Any]:
    text = code.lower()
    m = re.search(r"(?:number|n)\s*=\s*(\d+)", text)
    if re.search(r"factor|prime|%\s*\w+\s*==\s*0", text) and m:
        return _spec("factoring", {"N": int(m.group(1))}, 0.5, [note, "divisibility / prime keywords"])
    arr = re.search(r"\[([0-9,\s]+)\]", code)
    tgt = re.search(r"(?:target|key)\s*=\s*(\d+)", text)
    if re.search(r"search|find", text) and arr and tgt:
        return _spec("search", {"items": [x.strip() for x in arr.group(1).split(",") if x.strip()],
                                "target": tgt.group(1)}, 0.5, [note, "search keywords"])
    return _unsupported("general", [note])


def _spec(kind: str, parameters: Dict[str, Any], confidence: float, evidence: List[str],
          incomplete: bool = False) -> Dict[str, Any]:
    explanations = {
        "search": "The code scans an unsorted collection for one value. That is unstructured search, where "
                  "Grover's algorithm needs only ~√N oracle queries instead of ~N comparisons.",
        "database": "The code filters a table of records with a condition. Marking the matching rows with an "
                    "oracle and applying amplitude amplification finds a match in ~√(N/M) queries.",
        "factoring": "The code factors an integer by trial division. Shor's algorithm finds the period of aˣ mod N "
                     "with a quantum Fourier transform and turns it into factors with gcd.",
        "tsp": "The code searches all routes through a set of cities. The route constraints and distances become a "
               "QUBO / Ising Hamiltonian whose ground state is the shortest tour; QAOA searches for it.",
        "knapsack": "The code picks items to maximise value under a capacity. With slack qubits the constraint "
                    "becomes a quadratic penalty, giving an Ising Hamiltonian for QAOA.",
        "maxcut": "The code splits a graph's nodes into two groups to cut as many edges as possible — the "
                  "textbook QAOA problem, with one qubit per node and a Z·Z term per edge.",
        "partition": "The code balances numbers between two groups. Each number gets a spin ±1 and the squared "
                     "imbalance is an Ising Hamiltonian.",
        "portfolio": "The code picks a set of stocks that balances expected return against risk. Each asset becomes "
                     "a qubit, the return/risk trade-off and the 'hold exactly k' budget become a QUBO / Ising "
                     "Hamiltonian, and QAOA searches for the best portfolio.",
        "boolean": "The code evaluates a Boolean condition. The formula becomes a reversible circuit (phase "
                   "oracle) and a diagonal Hamiltonian; Grover's algorithm finds inputs that make it true.",
    }
    return {
        "problem_type": kind,
        "parameters": parameters,
        "confidence": round(confidence, 2),
        "evidence": evidence,
        "explanation": explanations.get(kind, ""),
        "quantum_algorithm": ALGORITHM_FOR[kind],
        "engine": "local",
        "incomplete": incomplete,
    }


def _unsupported(reason_key: str, evidence: List[str]) -> Dict[str, Any]:
    return {
        "problem_type": "unsupported",
        "parameters": {"reason": UNSUPPORTED_REASONS[reason_key], "category": reason_key},
        "confidence": 0.8 if reason_key != "general" else 0.3,
        "evidence": evidence,
        "explanation": UNSUPPORTED_REASONS[reason_key],
        "quantum_algorithm": "—",
        "engine": "local",
        "incomplete": False,
    }
