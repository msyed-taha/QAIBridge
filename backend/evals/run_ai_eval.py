"""
QAIbridge AI evaluation: how often each AI feature gets it right.

Every item in sets/*.json goes through the real route, exactly as the page sends
it, and is scored against its answer key:

  describe   Describe a circuit: does the AI's circuit give the right chances on
             the simulator (total difference ≤ 0.02)? When it is wrong, did the
             built-in check warn? Off-topic requests: turned away?
  advisor    AI Advisor, read by the AI and by the built-in keyword reader: right
             problem category? A sound quantum algorithm? Off-topic: turned away?
  code       Code to Quantum, read by the AI and by the built-in reader: right
             problem type (and number, for factoring)? Then the circuit is run and
             its answer checked against the classical one.

Run from backend/, against the throwaway test database only:

    DATABASE_URL=postgresql+psycopg2://…/qaibridge_test venv/bin/python -m evals.run_ai_eval
        [--only describe,advisor,code] [--limit N] [--fake]

It uses a temporary user, raises the AI daily limits for the run, and afterwards
removes the user and its AI usage rows and restores the limits. Results go to
evals/results/latest.json and latest.md. Real runs cost about $0.10 of Claude
credit; --fake answers with a stand-in (no cost) to check this script itself.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

HERE = Path(__file__).resolve().parent
TOLERANCE = 0.02


def _guard_database() -> None:
    url = os.environ.get("DATABASE_URL", "")
    if not url.rstrip("/").endswith("/qaibridge_test"):
        sys.exit("Refusing to run: set DATABASE_URL to the throwaway qaibridge_test database.")


IDS: List[str] = []                        # when set, only these items run


def _load(name: str) -> List[Dict[str, Any]]:
    items = json.loads((HERE / "sets" / f"{name}.json").read_text())["items"]
    return [i for i in items if i["id"] in IDS] if IDS else items


# ── Scoring ──────────────────────────────────────────────────────────────────

def gap(truth: Dict[str, float], got: Dict[str, float]) -> float:
    """Total variation distance between two outcome distributions."""
    return 0.5 * sum(abs(truth.get(k, 0.0) - got.get(k, 0.0)) for k in set(truth) | set(got))


def score_describe(item: Dict[str, Any], reply: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"id": item["id"], "off_topic": bool(item.get("off_topic"))}
    if item.get("off_topic"):
        out["right"] = reply.get("off_topic") is True
        out["outcome"] = "turned away" if out["right"] else "built a circuit"
        return out
    if "unavailable" in reply or reply.get("off_topic"):
        return {**out, "right": False, "outcome": reply.get("unavailable") or "turned away", "warned": None}
    got = {c["outcome"]: c["chance"] for c in reply["check"]["got"]}
    distance = gap(item["truth"], got)
    matches = reply["check"]["matches"]
    return {**out, "right": distance <= TOLERANCE, "gap": round(distance, 4), "self_check": matches,
            "gates": len(reply["layout"]["gates"]), "qubits": reply["layout"]["n"],
            "got": dict(sorted(got.items(), key=lambda kv: -kv[1])[:4])}


def score_advisor(item: Dict[str, Any], status: int, reply: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"id": item["id"], "off_topic": bool(item.get("off_topic"))}
    turned_away = status == 422 or reply.get("off_topic") is True
    if item.get("off_topic"):
        return {**out, "right": turned_away, "outcome": "turned away" if turned_away else "advised"}
    if turned_away or status != 200:
        return {**out, "right": False, "category_right": False, "quantum_right": False, "outcome": "turned away"}
    category = reply["detected_features"]["category_label"]
    quantum = reply["quantum"]["algorithm_id"]
    category_right = category in item["categories"]
    quantum_right = item["quantum"] is None or quantum in item["quantum"]
    return {**out, "category": category, "quantum": quantum, "engine": reply.get("engine"),
            "fell_back": bool(reply.get("ai_note")), "category_right": category_right,
            "quantum_right": quantum_right, "right": category_right and quantum_right}


def score_code(item: Dict[str, Any], status: int, reply: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"id": item["id"], "expected": item["problem_type"]}
    if status != 200:
        return {**out, "right": False, "found": f"error {status}"}
    spec = reply["spec"]
    found = spec["problem_type"]
    if item["problem_type"] == "off_topic":
        right = found == "unsupported"
    else:
        right = found == item["problem_type"]
        for key, value in (item.get("params") or {}).items():
            right = right and spec["parameters"].get(key) == value
    return {**out, "found": found, "right": right, "fell_back": bool(spec.get("ai_note")),
            "off_topic_seen": spec["parameters"].get("category") == "off_topic" if found == "unsupported" else False}


# ── The run ──────────────────────────────────────────────────────────────────

def _fake_send(model, system, user, max_tokens, think=False):
    """A stand-in for Claude: one fixed, valid answer per feature."""
    from app.ai import describe_circuit
    from app.modules.module4_recommender import ai_reader
    from app.modules.module5_transformer import llm
    usage = {"input_tokens": 1000, "output_tokens": 200, "cache_read_tokens": 0, "cache_write_tokens": 0}
    if system.startswith(describe_circuit.SYSTEM_PROMPT[:40]):
        text = json.dumps({"on_topic": True, "qubits": 2, "gates": [{"gate": "H", "qubits": [0]}, {"gate": "CNOT", "qubits": [0, 1]}],
                           "expected": {"00": 0.5, "11": 0.5}, "explanation": "A Bell pair."})
    elif system.startswith(ai_reader.READ_PROMPT[:40]):
        text = json.dumps({"on_topic": True, "summary": "A search.", "problem_category": "search", "data_size": 1000,
                           "unstructured_data": True, "needs_exact_answer": True, "has_graph_structure": False,
                           "is_security_related": False, "continuous_vars": False, "periodic_structure": False,
                           "multi_solution": False, "redirect": ""})
    elif system.startswith(llm.SYSTEM_PROMPT[:40]):
        text = json.dumps({"problem_type": "search", "parameters": {"items": ["a", "b", "c", "d"], "target": "c"},
                           "explanation": "A linear search.", "confidence": 0.9, "off_topic": False})
    else:
        text = "A short explanation."
    return text, usage


def run(only: List[str], limit: Optional[int], fake: bool) -> Dict[str, Any]:
    from fastapi.testclient import TestClient
    from sqlalchemy import func

    from app.ai import service
    from app.auth.security import hash_password, token_for
    from app.database import SessionLocal
    from app.models.ai import AIUsage, AppSetting
    from app.models.user import ROLE_USER, User
    from main import app

    if fake:
        os.environ["LLM_API_KEY"] = "sk-ant-fake"
        service._send = _fake_send
    elif not service.api_key():
        sys.exit("No LLM_API_KEY in backend/.env: nothing to evaluate. Use --fake to check the script.")
    service.forget_saved_answers()

    tag = uuid.uuid4().hex[:10]
    with SessionLocal() as db:
        saved_settings = [(s.key, s.value) for s in db.query(AppSetting).filter(AppSetting.key.like("ai.%"))]
        user = User(username=f"eval_{tag}", email=f"eval_{tag}@example.com", hashed_password=hash_password(uuid.uuid4().hex),
                    role=ROLE_USER, is_active=True)
        db.add(user); db.commit(); db.refresh(user)
        uid, headers = user.id, {"Authorization": f"Bearer {token_for(user)}"}
        service.update_settings(db, {"enabled": True, "user_daily_limit": 1000, "app_daily_limit": 1000})

    client = TestClient(app)
    results: Dict[str, Any] = {}
    started = time.perf_counter()

    def parallel(items: List[Dict[str, Any]], work: Callable[[Dict[str, Any]], Any], workers: int = 4) -> List[Any]:
        with ThreadPoolExecutor(workers) as pool:
            return list(pool.map(work, items))

    try:
        if "describe" in only:
            items = _load("describe")[:limit]

            def one(item):
                r = client.post("/api/module3/describe", headers=headers,
                                json={"text": item["text"], "current_qasm": item.get("current_qasm", "")})
                return score_describe(item, r.json())
            results["describe"] = parallel(items, one)

        if "advisor" in only:
            items = _load("advisor")[:limit]
            for mode in ("auto", "local"):
                def one(item, mode=mode):
                    r = client.post("/api/module4/advise", headers=headers, json={"problem_text": item["text"], "mode": mode})
                    return score_advisor(item, r.status_code, r.json())
                results[f"advisor_{mode}"] = parallel(items, one)

        if "code" in only:
            items = _load("code")[:limit]
            for mode in ("llm", "local"):
                def one(item, mode=mode):
                    r = client.post("/api/module5/analyze", headers=headers, json={"code": item["code"], "mode": mode})
                    scored = score_code(item, r.status_code, r.json() if r.status_code == 200 else {})
                    if scored["right"] and scored["found"] != "unsupported":
                        ran = client.post("/api/module5/execute", headers=headers, json={"spec": r.json()["spec"], "seed": 7})
                        if ran.status_code == 200:
                            scored["verified"] = bool(ran.json().get("verification", {}).get("match"))
                        else:                              # e.g. a number too big to simulate here: not a wrong answer
                            scored["not_run"] = str(ran.json().get("detail", ran.status_code))[:160]
                    return scored
                results[f"code_{mode}"] = parallel(items, one)
    finally:
        with SessionLocal() as db:
            rows = db.query(AIUsage).filter(AIUsage.user_id == uid)
            cost = float(rows.with_entities(func.coalesce(func.sum(AIUsage.cost_usd), 0)).scalar())
            requests = rows.filter(AIUsage.outcome == "ok").count()
            rows.delete(synchronize_session=False)
            db.query(AppSetting).filter(AppSetting.key.like("ai.%")).delete(synchronize_session=False)
            for key, value in saved_settings:
                db.add(AppSetting(key=key, value=value))
            db.query(User).filter(User.id == uid).delete()
            db.commit()

    return {"when": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": service.model_name(),
            "fake": fake, "seconds": round(time.perf_counter() - started, 1), "requests": requests,
            "cost_usd": round(cost, 4), "results": results}


# ── The report ───────────────────────────────────────────────────────────────

def _share(rows: List[Dict[str, Any]], key: str = "right", where: Callable[[Dict[str, Any]], bool] = lambda r: True) -> str:
    picked = [r for r in rows if where(r)]
    hit = sum(1 for r in picked if r.get(key))
    return f"{hit} of {len(picked)} ({round(100 * hit / len(picked)) if picked else 0}%)"


def report(run_: Dict[str, Any]) -> str:
    R = run_["results"]
    lines = ["# QAIbridge AI evaluation", "",
             f"{run_['when']} · model {run_['model']}{' · FAKE (checks the script only)' if run_['fake'] else ''} · "
             f"{run_['requests']} AI requests · ${run_['cost_usd']:.4f} · {run_['seconds']} s", ""]
    def circuits(r: Dict[str, Any]) -> bool:          # a real task, not an off-topic request
        return not r["off_topic"]

    if "describe" in R:
        d = R["describe"]
        wrong = [r for r in d if circuits(r) and not r["right"]]
        lines += ["## Describe a circuit", "",
                  f"- Right circuit (the simulator gives the asked-for chances): **{_share(d, where=circuits)}**",
                  f"- Its own expected chances agreed with the simulator: {_share(d, 'self_check', circuits)}",
                  f"- When the circuit was wrong, the check warned: {sum(1 for r in wrong if r.get('self_check') is False)} of {len(wrong)}",
                  f"- Off-topic requests turned away: {_share(d, where=lambda r: not circuits(r))}", ""]
        for r in wrong:
            detail = r.get("outcome") or f"off by {r['gap']}, got {r['got']}"
            lines.append(f"  - wrong: `{r['id']}` ({detail})")
        lines.append("")
    for mode, name in (("auto", "AI reader"), ("local", "built-in keyword reader")):
        if f"advisor_{mode}" in R:
            a = R[f"advisor_{mode}"]
            lines += [f"## AI Advisor, {name}", "",
                      f"- Right category and a sound quantum algorithm: **{_share(a, where=circuits)}**",
                      f"- Right category: {_share(a, 'category_right', circuits)}",
                      f"- Sound quantum algorithm: {_share(a, 'quantum_right', circuits)}",
                      f"- Off-topic requests turned away: {_share(a, where=lambda r: not circuits(r))}", ""]
            for r in a:
                if not r["right"]:
                    lines.append(f"  - wrong: `{r['id']}` ({r.get('category', r.get('outcome'))}, {r.get('quantum', '—')})")
            lines.append("")
    for mode, name in (("llm", "AI reader"), ("local", "built-in reader")):
        if f"code_{mode}" in R:
            c = R[f"code_{mode}"]
            runnable = [r for r in c if r["right"] and "verified" in r]
            lines += [f"## Code to Quantum, {name}", "",
                      f"- Right problem type (and number, for factoring): **{_share(c)}**",
                      f"- Of those run, the quantum answer matched the classical one: {_share(runnable, 'verified')}", ""]
            for r in c:
                if "not_run" in r:
                    lines.append(f"  - not run: `{r['id']}` ({r['not_run']})")
            for r in c:
                if not r["right"]:
                    lines.append(f"  - wrong: `{r['id']}` (expected {r['expected']}, found {r['found']})")
            lines.append("")
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--only", default="describe,advisor,code")
    p.add_argument("--limit", type=int, default=None, help="only the first N items of each set")
    p.add_argument("--ids", default="", help="only these items (comma-separated ids); results go to results/partial.*")
    p.add_argument("--fake", action="store_true", help="answer with a stand-in for Claude (no cost)")
    args = p.parse_args()
    _guard_database()
    IDS.extend(i.strip() for i in args.ids.split(",") if i.strip())
    from dotenv import load_dotenv
    load_dotenv(HERE.parent / ".env")                 # the key; DATABASE_URL from the command line wins
    run_ = run([s.strip() for s in args.only.split(",")], args.limit, args.fake)
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    name = "fake" if args.fake else "partial" if IDS or args.limit else "latest"
    (out / f"{name}.json").write_text(json.dumps(run_, indent=1))
    text = report(run_)
    (out / f"{name}.md").write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
