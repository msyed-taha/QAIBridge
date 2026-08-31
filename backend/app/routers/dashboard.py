"""
Solve API  (FastAPI Router)
Backs the standalone "Solve" page — runs a user-supplied problem through a
classical OR quantum algorithm, and extracts text from uploaded files to
populate its input fields.
Routes:
  POST  /api/dashboard/solve         – Solve a user-supplied problem
  POST  /api/dashboard/extract-file  – Extract text from an uploaded file
"""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from fastapi import APIRouter, File as FastAPIFile, HTTPException, UploadFile
from pydantic import BaseModel, Field

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
