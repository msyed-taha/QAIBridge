"""
Module 8 – Interactive Performance Dashboard  +  Solve API  (FastAPI Router)

Dashboard (login required):
  GET    /api/dashboard/suites               – Benchmark suites, defaults and limits
  POST   /api/dashboard/benchmark            – Run suites and return all points (also saved to history)
  WS     /api/dashboard/ws/benchmark?token=  – Same, streaming every point live
  GET    /api/dashboard/overview             – KPI cards across the user's saved runs
  GET    /api/dashboard/history              – Saved runs (benchmarks, SFOD, Solve, Transformer)
  GET    /api/dashboard/history/{id}         – One run with its points
  GET    /api/dashboard/history/{id}/csv     – CSV export
  DELETE /api/dashboard/history/{id}         – Delete a run

Solve page:
  POST  /api/dashboard/solve         – Solve a user-supplied problem (classical OR quantum)
  POST  /api/dashboard/extract-file  – Extract text from an uploaded file
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter, Depends, File as FastAPIFile, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models.benchmark import KIND_BENCHMARK, KIND_SOLVE
from ..models.user import User
from ..modules.module8_dashboard import history
from ..modules.module8_dashboard.benchmarker import (
    DEFAULT_OPTIONS, LIMITS, SUITES, headline, run_benchmark,
)
from ..routers.auth import get_current_user, get_optional_user, user_from_token

from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module8_dashboard.custom_solver import (
    solve_search_classical,    solve_search_quantum,
    solve_factoring_classical, solve_factoring_quantum,
    solve_optimization_classical, solve_optimization_quantum,
    solve_database_classical,  solve_database_quantum,
)

router = APIRouter(prefix="/api/dashboard", tags=["Solve"])


# ──────────────────────────────────────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    problem_type: str  = Field(..., description="search | factoring | optimization | database")
    approach:     str  = Field(..., description="classical | quantum")
    # Search
    dataset:      Optional[List[str]] = None
    target:       Optional[str]       = None
    # Factoring
    number:       Optional[int]       = Field(default=None, ge=2, le=10**12)
    # Optimization
    cities:       Optional[List[str]] = None
    # Database
    records:      Optional[List[str]] = None
    query:        Optional[str]       = None


# ──────────────────────────────────────────────────────────────────────────────
# REST Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/solve")
async def solve_user_problem(req: SolveRequest, user: Optional[User] = Depends(get_optional_user)) -> Dict:
    """
    Run a user-supplied problem through classical OR quantum algorithm.
    Returns the algorithm result, step count, complexity, and explanation.
    The quantum approach executes real circuits on the Module 1 kernel.
    """
    ptype    = req.problem_type.lower()
    approach = req.approach.lower()
    if approach not in ("classical", "quantum"):
        raise HTTPException(status_code=400, detail="approach must be 'classical' or 'quantum'.")
    loop = asyncio.get_running_loop()

    def run_in_worker(fn, *args):
        def work():
            if approach == "quantum":
                with simulation_slot():
                    return fn(*args)
            return fn(*args)
        return loop.run_in_executor(None, work)

    try:
        if ptype == "search":
            if not req.dataset or req.target is None:
                raise HTTPException(status_code=400, detail="'dataset' (list) and 'target' (string) are required for search.")
            fn = solve_search_classical if approach == "classical" else solve_search_quantum
            result = await run_in_worker(fn, req.dataset, req.target)

        elif ptype == "factoring":
            if req.number is None:
                raise HTTPException(status_code=400, detail="'number' (integer ≥ 2) is required for factoring.")
            fn = solve_factoring_classical if approach == "classical" else solve_factoring_quantum
            result = await run_in_worker(fn, req.number)

        elif ptype == "optimization":
            if not req.cities or len(req.cities) < 3:
                raise HTTPException(status_code=400, detail="'cities' list with at least 3 cities is required for optimization.")
            if len(req.cities) > 12:
                raise HTTPException(status_code=400, detail="Maximum 12 cities supported.")
            fn = solve_optimization_classical if approach == "classical" else solve_optimization_quantum
            result = await run_in_worker(fn, req.cities)

        elif ptype == "database":
            if not req.records or req.query is None:
                raise HTTPException(status_code=400, detail="'records' (list) and 'query' (string) are required for database.")
            fn = solve_database_classical if approach == "classical" else solve_database_quantum
            result = await run_in_worker(fn, req.records, req.query)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown problem_type '{ptype}'. Choose: search | factoring | optimization | database")

        out = result.to_dict()
        if user is not None and approach == "quantum" and out.get("success"):
            r = out["result"]
            history.record_run(user.id, KIND_SOLVE, f"Solve — {ptype} ({out['algorithm']})", {
                "algorithm": ptype, "quantum_steps": out["steps"], "quantum_label": out.get("steps_label"),
                "quantum_correct": bool(out["success"]), "qubits": r.get("qubits"),
                "success_probability": r.get("success_probability", r.get("p_optimal")),
                "quantum_ms": out["elapsed_ms"], "input_size": out["input_size"],
            }, duration_ms=out["elapsed_ms"])
        return {"status": "ok", "result": out}

    except HTTPException:
        raise
    except MemoryError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── File extraction endpoint for Solve page ───────────────────────────────────

ALLOWED_EXTENSIONS = {
    "pdf", "docx", "doc", "csv", "txt", "md", "json",
    "tex", "rtf", "tsv", "log", "xml", "yaml", "yml",
}

@router.post("/extract-file")
async def extract_file(file: UploadFile = FastAPIFile(...)):
    """
    Extract plain text from an uploaded file.
    Supports: PDF, DOCX, CSV, TXT, JSON, MD, and more.
    Returns the extracted text so the frontend can populate input fields.
    """
    fname = (file.filename or "").lower()
    ext   = fname.rsplit(".", 1)[-1] if "." in fname else ""

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type '.{ext}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = await file.read()
    text    = ""

    try:
        if ext == "pdf":
            try:
                from pypdf import PdfReader
                import io
                reader = PdfReader(io.BytesIO(content))
                text   = "\n".join(p.extract_text() or "" for p in reader.pages)
            except ImportError:
                raise HTTPException(503, "pypdf not installed. Run: pip install pypdf")

        elif ext in ("docx", "doc"):
            try:
                from docx import Document
                import io
                doc  = Document(io.BytesIO(content))
                text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            except ImportError:
                raise HTTPException(503, "python-docx not installed. Run: pip install python-docx")

        elif ext == "csv":
            import csv, io
            reader = csv.reader(io.StringIO(content.decode("utf-8", errors="replace")))
            rows   = [", ".join(row) for row in reader if any(c.strip() for c in row)]
            text   = "\n".join(rows)

        elif ext == "tsv":
            import csv, io
            reader = csv.reader(
                io.StringIO(content.decode("utf-8", errors="replace")), delimiter="\t"
            )
            rows = ["\t".join(row) for row in reader if any(c.strip() for c in row)]
            text = "\n".join(rows)

        elif ext == "json":
            import json
            obj  = json.loads(content.decode("utf-8", errors="replace"))
            text = json.dumps(obj, indent=2)

        elif ext in ("xml", "yaml", "yml"):
            text = content.decode("utf-8", errors="replace")

        else:
            # Plain text formats: txt, md, tex, rtf, log, etc.
            text = content.decode("utf-8", errors="replace")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to extract text: {e}")

    text = text.strip()
    if not text:
        raise HTTPException(400, "No readable text found in the uploaded file.")

    return {
        "filename":   file.filename,
        "extension":  ext,
        "text":       text,
        "char_count": len(text),
        "line_count": len(text.splitlines()),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Module 8 — benchmark dashboard
# ══════════════════════════════════════════════════════════════════════════════

class BenchmarkRequest(BaseModel):
    suites:  List[str] = Field(default_factory=lambda: list(SUITES))
    options: Dict[str, Any] = Field(default_factory=dict)


def _suite_names(names: List[str]) -> List[str]:
    chosen = [n for n in names if n in SUITES]
    if not chosen:
        raise HTTPException(422, f"Choose at least one suite from: {', '.join(SUITES)}")
    return chosen


def _save_benchmark(user_id: int, results: Dict[str, Any]) -> Optional[int]:
    names = ", ".join(results["suites"].keys())
    return history.record_run(user_id, KIND_BENCHMARK, f"Benchmark — {names}", headline(results),
                              payload=results, duration_ms=results["duration_ms"])


@router.get("/suites")
def list_suites():
    return {"suites": [{"key": k, **v} for k, v in SUITES.items()], "defaults": DEFAULT_OPTIONS,
            "limits": {k: {"min": lo, "max": hi} for k, (lo, hi) in LIMITS.items()}}


@router.post("/benchmark")
def benchmark(req: BenchmarkRequest, user: User = Depends(get_current_user)):
    suites = _suite_names(req.suites)
    try:
        with simulation_slot():
            results = run_benchmark(suites, req.options)
    except MemoryError as e:
        raise HTTPException(503, str(e))
    run_id = _save_benchmark(user.id, results)
    return {"run_id": run_id, "headline": headline(results), **results}


@router.websocket("/ws/benchmark")
async def benchmark_ws(websocket: WebSocket, token: str = Query(default="")):
    """
    Live benchmark stream. Client sends {"action": "run", "suites": [...], "options": {...}};
    the server answers with start / suite_start / point / suite_done / done events.
    """
    db = SessionLocal()
    try:
        user = user_from_token(token, db)
    finally:
        db.close()
    await websocket.accept()
    if user is None:
        await websocket.send_json({"type": "error", "detail": "Please sign in again (invalid or expired token)."})
        await websocket.close(code=4401)
        return
    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("action") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if msg.get("action") != "run":
                await websocket.send_json({"type": "error", "detail": "Unknown action."})
                continue
            suites = [n for n in msg.get("suites", []) if n in SUITES] or list(SUITES)
            loop = asyncio.get_running_loop()
            queue: asyncio.Queue = asyncio.Queue()

            def on_event(event: Dict[str, Any]) -> None:
                loop.call_soon_threadsafe(queue.put_nowait, event)

            def work() -> Dict[str, Any]:
                with simulation_slot():
                    return run_benchmark(suites, msg.get("options") or {}, on_event)

            task = loop.run_in_executor(None, work)
            while not task.done() or not queue.empty():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    continue
                await websocket.send_json(event)
            try:
                results = await task
            except MemoryError as e:
                await websocket.send_json({"type": "error", "detail": str(e)})
                continue
            run_id = await loop.run_in_executor(None, _save_benchmark, user.id, results)
            await websocket.send_json({"type": "done", "run_id": run_id, "headline": headline(results),
                                       "duration_ms": results["duration_ms"]})
    except WebSocketDisconnect:
        return


@router.get("/overview")
def dashboard_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return history.overview(db, user.id)


@router.get("/history")
def list_history(limit: int = Query(20, ge=1, le=100), kind: Optional[str] = None,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"runs": history.list_runs(db, user.id, limit, kind)}


@router.get("/history/{run_id}")
def get_history(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = history.get_run(db, user.id, run_id)
    if not run:
        raise HTTPException(404, "Run not found.")
    return history.to_dict(run, with_payload=True)


@router.get("/history/{run_id}/csv")
def get_history_csv(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = history.get_run(db, user.id, run_id)
    if not run:
        raise HTTPException(404, "Run not found.")
    stamp = run.created_at.strftime("%Y%m%d-%H%M") if run.created_at else str(run.id)
    return Response(history.run_to_csv(run), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="qaibridge-{run.kind}-{run.id}-{stamp}.csv"'})


@router.delete("/history/{run_id}", status_code=204)
def delete_history(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = history.get_run(db, user.id, run_id)
    if not run:
        raise HTTPException(404, "Run not found.")
    db.delete(run)
    db.commit()
    return Response(status_code=204)
