"""
Module 8 – Interactive Performance Dashboard  (FastAPI Router)
Routes:
  POST  /api/dashboard/benchmark          – Run a specific SFOD benchmark
  GET   /api/dashboard/benchmark/suite    – Run all 4 SFOD benchmarks
  GET   /api/dashboard/theoretical/{alg}  – Theoretical complexity for size n
  WS    /ws/dashboard/{session_id}        – Real-time benchmark progress stream
"""

from __future__ import annotations

import asyncio
from typing import Dict

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import List, Optional

from ..modules.module8_dashboard import (
    benchmark_search,
    benchmark_factoring,
    benchmark_optimization,
    benchmark_database,
    run_full_benchmark_suite,
    theoretical_speedup,
)
from ..modules.module8_dashboard.custom_solver import (
    solve_search_classical,    solve_search_quantum,
    solve_factoring_classical, solve_factoring_quantum,
    solve_optimization_classical, solve_optimization_quantum,
    solve_database_classical,  solve_database_quantum,
)
from ..websocket_manager import manager

router = APIRouter(prefix="/api/dashboard", tags=["Module 8 – Performance Dashboard"])


# ──────────────────────────────────────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────────────────────────────────────

class BenchmarkRequest(BaseModel):
    algorithm:    str  = Field(..., description="search | factoring | optimization | database")
    problem_size: int  = Field(default=16, ge=2, le=512)


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

@router.post("/benchmark")
async def run_benchmark(req: BenchmarkRequest) -> Dict:
    """
    Run a single Quantum vs Classical benchmark for the specified SFOD algorithm.

    Returns side-by-side timing, speedup factor, accuracy comparison,
    and chart data for Plotly visualisation.
    """
    alg = req.algorithm.lower()
    n   = req.problem_size

    dispatch = {
        "search":       benchmark_search,
        "factoring":    benchmark_factoring,
        "optimization": benchmark_optimization,
        "database":     benchmark_database,
    }

    if alg not in dispatch:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown algorithm '{alg}'. Choose from: {list(dispatch.keys())}"
        )

    try:
        report = await asyncio.get_event_loop().run_in_executor(
            None, lambda: dispatch[alg](n)
        )
        return {"status": "ok", "report": report.to_dict()}

    except MemoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/benchmark/suite")
async def run_suite() -> Dict:
    """
    Run all four SFOD benchmarks and return a combined summary.
    Used by the dashboard overview panel.
    """
    try:
        results = await asyncio.get_event_loop().run_in_executor(
            None, run_full_benchmark_suite
        )
        return {"status": "ok", "suite": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/solve")
async def solve_user_problem(req: SolveRequest) -> Dict:
    """
    Run a user-supplied problem through classical OR quantum algorithm.
    Returns the algorithm result, step count, complexity, and explanation.
    """
    ptype    = req.problem_type.lower()
    approach = req.approach.lower()

    try:
        if ptype == "search":
            if not req.dataset or req.target is None:
                raise HTTPException(status_code=400, detail="'dataset' (list) and 'target' (string) are required for search.")
            fn = solve_search_classical if approach == "classical" else solve_search_quantum
            result = await asyncio.get_event_loop().run_in_executor(None, lambda: fn(req.dataset, req.target))

        elif ptype == "factoring":
            if req.number is None:
                raise HTTPException(status_code=400, detail="'number' (integer ≥ 2) is required for factoring.")
            fn = solve_factoring_classical if approach == "classical" else solve_factoring_quantum
            result = await asyncio.get_event_loop().run_in_executor(None, lambda: fn(req.number))

        elif ptype == "optimization":
            if not req.cities or len(req.cities) < 3:
                raise HTTPException(status_code=400, detail="'cities' list with at least 3 cities is required for optimization.")
            if len(req.cities) > 12:
                raise HTTPException(status_code=400, detail="Maximum 12 cities supported.")
            fn = solve_optimization_classical if approach == "classical" else solve_optimization_quantum
            result = await asyncio.get_event_loop().run_in_executor(None, lambda: fn(req.cities))

        elif ptype == "database":
            if not req.records or req.query is None:
                raise HTTPException(status_code=400, detail="'records' (list) and 'query' (string) are required for database.")
            fn = solve_database_classical if approach == "classical" else solve_database_quantum
            result = await asyncio.get_event_loop().run_in_executor(None, lambda: fn(req.records, req.query))

        else:
            raise HTTPException(status_code=400, detail=f"Unknown problem_type '{ptype}'. Choose: search | factoring | optimization | database")

        return {"status": "ok", "result": result.to_dict()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/theoretical/{algorithm}")
async def get_theoretical_speedup(
    algorithm: str,
    n: int = Query(default=16, ge=2, le=10000)
) -> Dict:
    """
    Return the theoretical complexity and expected speedup for a given
    algorithm at problem size n.  Used by the complexity panels.
    """
    result = theoretical_speedup(algorithm, n)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — real-time benchmark progress stream
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def dashboard_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket for streaming benchmark progress to the dashboard.
    Clients send {action: 'benchmark', payload: {algorithm, problem_size}}
    and receive a stream of progress events followed by the final result.
    """
    channel = f"dashboard_{session_id}"
    await manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "benchmark":
                await _ws_benchmark(websocket, channel, data)
            elif action == "suite":
                await _ws_suite(websocket, channel)
            elif action == "ping":
                await manager.send_to(websocket, {"type": "pong"})
            else:
                await manager.send_to(websocket, {
                    "type": "error",
                    "detail": f"Unknown action: {action}"
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)


async def _ws_benchmark(websocket: WebSocket, channel: str, data: dict):
    """Stream a single benchmark run over WebSocket."""
    try:
        req     = BenchmarkRequest(**data.get("payload", {}))
        alg     = req.algorithm.lower()
        n       = req.problem_size
        dispatch = {
            "search":       benchmark_search,
            "factoring":    benchmark_factoring,
            "optimization": benchmark_optimization,
            "database":     benchmark_database,
        }
        if alg not in dispatch:
            await manager.send_to(websocket, {
                "type": "error",
                "detail": f"Unknown algorithm '{alg}'."
            })
            return

        await manager.broadcast_progress(channel, "Running quantum simulation", 20)
        await asyncio.sleep(0)

        report = await asyncio.get_event_loop().run_in_executor(
            None, lambda: dispatch[alg](n)
        )

        await manager.broadcast_progress(channel, "Running classical baseline", 60)
        await asyncio.sleep(0)

        await manager.broadcast_progress(channel, "Computing metrics", 85)
        await asyncio.sleep(0)

        await manager.send_to(websocket, {
            "type":   "result",
            "report": report.to_dict(),
        })

        await manager.broadcast_progress(channel, "Complete", 100)

    except Exception as e:
        await manager.send_to(websocket, {"type": "error", "detail": str(e)})


async def _ws_suite(websocket: WebSocket, channel: str):
    """Stream the full SFOD benchmark suite."""
    try:
        await manager.broadcast_progress(channel, "Running SFOD suite", 10)
        results = await asyncio.get_event_loop().run_in_executor(
            None, run_full_benchmark_suite
        )
        await manager.send_to(websocket, {
            "type":  "suite_result",
            "suite": results,
        })
        await manager.broadcast_progress(channel, "Suite complete", 100)
    except Exception as e:
        await manager.send_to(websocket, {"type": "error", "detail": str(e)})


# ── File extraction endpoint for Solve page ───────────────────────────────────

from fastapi import UploadFile, File as FastAPIFile

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
