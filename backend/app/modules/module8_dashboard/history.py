"""
Module 8 – Interactive Performance Dashboard
history.py  –  Saving runs, listing them, CSV export and the overview KPIs.
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ...database import SessionLocal
from ...models.benchmark import (
    KIND_BENCHMARK, KIND_SFOD, KIND_SOLVE, KIND_TRANSFORM, BenchmarkRun,
)

log = logging.getLogger(__name__)


def to_dict(run: BenchmarkRun, with_payload: bool = False) -> Dict[str, Any]:
    d = {
        "id": run.id, "kind": run.kind, "title": run.title, "summary": run.summary or {},
        "duration_ms": run.duration_ms,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
    if with_payload:
        d["payload"] = run.payload
    return d


def record_run(user_id: Optional[int], kind: str, title: str, summary: Dict[str, Any],
               payload: Optional[Dict[str, Any]] = None, duration_ms: Optional[float] = None,
               db: Optional[Session] = None) -> Optional[int]:
    """Best-effort save — a history failure must never break the run itself."""
    own = db is None
    db = db or SessionLocal()
    try:
        run = BenchmarkRun(user_id=user_id, kind=kind, title=title[:200], summary=summary,
                           payload=payload, duration_ms=duration_ms)
        db.add(run)
        db.commit()
        db.refresh(run)
        return run.id
    except Exception as e:           # pragma: no cover — logged, not raised
        log.warning("Could not record %s run: %s", kind, e)
        db.rollback()
        return None
    finally:
        if own:
            db.close()


def list_runs(db: Session, user_id: int, limit: int = 20, kind: Optional[str] = None) -> List[Dict[str, Any]]:
    q = db.query(BenchmarkRun).filter(BenchmarkRun.user_id == user_id)
    if kind:
        q = q.filter(BenchmarkRun.kind == kind)
    return [to_dict(r) for r in q.order_by(BenchmarkRun.created_at.desc(), BenchmarkRun.id.desc()).limit(limit)]


def get_run(db: Session, user_id: int, run_id: int) -> Optional[BenchmarkRun]:
    return db.query(BenchmarkRun).filter(BenchmarkRun.id == run_id, BenchmarkRun.user_id == user_id).first()


def run_to_csv(run: BenchmarkRun) -> str:
    """Flatten every suite's points into one CSV table (suite, index, …columns)."""
    payload = run.payload or {}
    rows: List[Dict[str, Any]] = []
    suites = payload.get("suites")
    if suites:
        for name, suite in suites.items():
            for i, p in enumerate(suite.get("points", [])):
                flat = {"suite": name, "index": i}
                for k, v in p.items():
                    flat[k] = ";".join(map(str, v)) if isinstance(v, list) else v
                rows.append(flat)
    else:
        rows.append({"kind": run.kind, "title": run.title, **(run.summary or {})})
    columns: List[str] = []
    for r in rows:
        for k in r:
            if k not in columns:
                columns.append(k)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue()


def overview(db: Session, user_id: int) -> Dict[str, Any]:
    runs = db.query(BenchmarkRun).filter(BenchmarkRun.user_id == user_id).all()
    by_kind: Dict[str, int] = {}
    kpi: Dict[str, Any] = {}
    for r in runs:
        by_kind[r.kind] = by_kind.get(r.kind, 0) + 1
        s = r.summary or {}
        if r.kind == KIND_BENCHMARK:
            for key, better in (("grover_speedup", max), ("kernel_max_qubits", max), ("qaoa_approx_ratio", max),
                                ("shor_success_rate", max)):
                if s.get(key) is not None:
                    kpi[key] = better(kpi.get(key, s[key]), s[key])
        if r.kind in (KIND_SFOD, KIND_SOLVE, KIND_TRANSFORM) and s.get("qubits"):
            kpi["kernel_max_qubits"] = max(kpi.get("kernel_max_qubits", 0), s["qubits"])
    correct = [r for r in runs if r.kind in (KIND_SFOD, KIND_SOLVE, KIND_TRANSFORM) and "quantum_correct" in (r.summary or {})]
    if correct:
        kpi["quantum_correct_rate"] = round(sum(1 for r in correct if r.summary["quantum_correct"]) / len(correct), 3)
    last = max(runs, key=lambda r: r.id) if runs else None
    return {"total_runs": len(runs), "by_kind": by_kind, "kpi": kpi,
            "last_run_at": last.created_at.isoformat() if last and last.created_at else None}


# ── summaries for runs made elsewhere in the app ──────────────────────────────

def sfod_summary(result: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    algo = result.get("algorithm", "?")
    inp = result.get("input", {})
    q, c = result.get("quantum", {}), result.get("classical", {})
    if algo == "search":
        title = f"Search — {inp.get('n_items')} items"
    elif algo == "database":
        title = f"Database — '{inp.get('query')}' over {inp.get('n_records')} records"
    elif algo == "factoring":
        title = f"Factoring — N = {inp.get('N')}"
    else:
        title = f"Route — {len(inp.get('cities', []))} cities"
    circ = q.get("circuit") or (q.get("detail") or {})
    summary = {
        "algorithm": algo,
        "classical_steps": c.get("steps"), "classical_label": c.get("steps_label"),
        "quantum_steps": q.get("steps"), "quantum_label": q.get("steps_label"),
        "quantum_correct": bool(q.get("correct")), "classical_correct": bool(c.get("correct")),
        "qubits": circ.get("qubits") or inp.get("qubits"),
        "success_probability": q.get("success_probability", q.get("p_optimal")),
        "quantum_ms": q.get("time_ms"),
    }
    return title, summary


def transform_summary(spec: Dict[str, Any], result: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    kind = result.get("problem_type", spec.get("problem_type"))
    title = f"Transform — {kind} ({spec.get('engine', 'local')} engine)"
    summary = {
        "problem_type": kind, "engine": spec.get("engine"), "supported": result.get("supported"),
        "quantum_correct": bool((result.get("verification") or {}).get("match")),
        "algorithm": result.get("algorithm"),
    }
    return title, summary
