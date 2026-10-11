"""
My work — each signed-in user's saved circuits, projects and challenge stars.

  GET    /api/work/projects               – your projects, most recently changed first
  POST   /api/work/projects               – new project
  PATCH  /api/work/projects/{id}          – rename / describe
  DELETE /api/work/projects/{id}          – delete it (its circuits are kept, outside any project)
  GET    /api/work/circuits               – your circuits (?project=<id>|none, ?limit=)
  POST   /api/work/circuits               – save a circuit
  GET    /api/work/circuits/{id}          – one circuit, with its text and layout
  PATCH  /api/work/circuits/{id}          – change name, text, layout or project (autosave uses this)
  POST   /api/work/circuits/{id}/copy     – make a copy
  DELETE /api/work/circuits/{id}          – delete it
  GET    /api/work/challenges             – your stars in the Circuit Builder's challenge levels
  POST   /api/work/challenges             – record stars (best result only)

Everything belongs to the account in the JWT: another user's circuit or project
is simply "not found".
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, BeforeValidator, Field, field_validator
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.work import ChallengeProgress, Project, SavedCircuit
from ..modules.module1_kernel.qasm import MAX_SOURCE_CHARS, QasmError, parse_qasm
from .auth import get_current_user

router = APIRouter(prefix="/api/work", tags=["My work"])

MAX_CIRCUITS = 500           # per account
MAX_PROJECTS = 100
MAX_LAYOUT_BYTES = 50_000
BUILDER_MAX_QUBITS = 6
BUILDER_MAX_GATES = 120
# Keep equal to the level ids in frontend/src/components/module3/challenges.ts.
CHALLENGE_LEVELS = frozenset({"flip", "coin", "minus", "tilt", "bell", "anti", "swap", "ghz", "and", "uniform"})


def _strip(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


Name = Annotated[str, BeforeValidator(_strip), Field(min_length=1, max_length=100)]
Description = Annotated[str, BeforeValidator(_strip), Field(max_length=500)]


def _check_layout(layout: Optional[dict]) -> Optional[dict]:
    """A Builder layout: {"n": qubits, "gates": [...]} — only its shape and size are checked here."""
    if layout is None:
        return None
    n, gates = layout.get("n"), layout.get("gates")
    if not isinstance(n, int) or not 1 <= n <= BUILDER_MAX_QUBITS or not isinstance(gates, list) \
            or len(gates) > BUILDER_MAX_GATES or not all(isinstance(g, dict) for g in gates):
        raise ValueError("This isn't a Circuit Builder layout.")
    if len(json.dumps(layout)) > MAX_LAYOUT_BYTES:
        raise ValueError("This layout is too large.")
    return layout


# ── Schemas ──────────────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: Name
    description: Description = ""


class ProjectPatch(BaseModel):
    name: Optional[Name] = None
    description: Optional[Description] = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    circuit_count: int
    created_at: datetime
    updated_at: datetime


class CircuitIn(BaseModel):
    name: Name
    qasm: str = Field(..., max_length=MAX_SOURCE_CHARS)
    layout: Optional[dict] = None
    project_id: Optional[int] = None

    @field_validator("layout")
    @classmethod
    def _layout_shape(cls, v: Optional[dict]) -> Optional[dict]:
        return _check_layout(v)


class CircuitPatch(BaseModel):
    name: Optional[Name] = None
    qasm: Optional[str] = Field(None, max_length=MAX_SOURCE_CHARS)
    layout: Optional[dict] = None
    project_id: Optional[int] = None       # send null to take it out of its project

    @field_validator("layout")
    @classmethod
    def _layout_shape(cls, v: Optional[dict]) -> Optional[dict]:
        return _check_layout(v)


class CircuitSummary(BaseModel):
    id: int
    name: str
    project_id: Optional[int]
    n_qubits: Optional[int]
    gate_count: Optional[int]
    opens_in: Literal["builder", "simulator"]
    created_at: datetime
    updated_at: datetime


class CircuitOut(CircuitSummary):
    qasm: str
    layout: Optional[dict]


class ChallengesIn(BaseModel):
    levels: dict[str, Annotated[int, Field(ge=1, le=3)]] = Field(..., max_length=len(CHALLENGE_LEVELS))

    @field_validator("levels")
    @classmethod
    def _known(cls, levels: dict[str, int]) -> dict[str, int]:
        unknown = sorted(set(levels) - CHALLENGE_LEVELS)
        if unknown:
            raise ValueError(f"Unknown level: {', '.join(unknown)}.")
        return levels


class ChallengesOut(BaseModel):
    levels: dict[str, int]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _summary(c: SavedCircuit) -> dict:
    return {
        "id": c.id, "name": c.name, "project_id": c.project_id, "n_qubits": c.n_qubits,
        "gate_count": c.gate_count, "opens_in": "builder" if c.layout else "simulator",
        "created_at": c.created_at, "updated_at": c.updated_at,
    }


def _full(c: SavedCircuit) -> dict:
    return {**_summary(c), "qasm": c.qasm, "layout": c.layout}


def _measure(c: SavedCircuit) -> None:
    """Qubits and gates for the list; left empty while the text has a mistake in it."""
    try:
        program = parse_qasm(c.qasm)
        c.n_qubits, c.gate_count = program.n_qubits, program.circuit.gate_count()
    except QasmError:
        c.n_qubits = c.gate_count = None


def _project(db: Session, me: User, project_id: int) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == me.id).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return p


def _circuit(db: Session, me: User, circuit_id: int) -> SavedCircuit:
    c = db.query(SavedCircuit).filter(SavedCircuit.id == circuit_id, SavedCircuit.user_id == me.id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circuit not found.")
    return c


def _touch(db: Session, project_id: Optional[int]) -> None:
    """A project counts as changed whenever one of its circuits does."""
    if project_id:
        db.query(Project).filter(Project.id == project_id).update({"updated_at": func.now()}, synchronize_session=False)


def _room_for_circuit(db: Session, me: User) -> None:
    if db.query(SavedCircuit).filter(SavedCircuit.user_id == me.id).count() >= MAX_CIRCUITS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"You have {MAX_CIRCUITS} saved circuits, the most an account can keep. "
                            "Delete some you no longer need, then save again.")


# ── Projects ─────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    counts = dict(db.query(SavedCircuit.project_id, func.count(SavedCircuit.id))
                  .filter(SavedCircuit.user_id == me.id, SavedCircuit.project_id.isnot(None))
                  .group_by(SavedCircuit.project_id).all())
    projects = db.query(Project).filter(Project.user_id == me.id).order_by(Project.updated_at.desc(), Project.id.desc()).all()
    return [{"id": p.id, "name": p.name, "description": p.description, "circuit_count": counts.get(p.id, 0),
             "created_at": p.created_at, "updated_at": p.updated_at} for p in projects]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(req: ProjectIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if db.query(Project).filter(Project.user_id == me.id).count() >= MAX_PROJECTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"You have {MAX_PROJECTS} projects, the most an account can keep.")
    p = Project(user_id=me.id, name=req.name, description=req.description)
    db.add(p); db.commit(); db.refresh(p)
    return {"id": p.id, "name": p.name, "description": p.description, "circuit_count": 0,
            "created_at": p.created_at, "updated_at": p.updated_at}


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, req: ProjectPatch, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    p = _project(db, me, project_id)
    if req.name is not None:
        p.name = req.name
    if req.description is not None:
        p.description = req.description
    db.commit(); db.refresh(p)
    count = db.query(SavedCircuit).filter(SavedCircuit.project_id == p.id).count()
    return {"id": p.id, "name": p.name, "description": p.description, "circuit_count": count,
            "created_at": p.created_at, "updated_at": p.updated_at}


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    p = _project(db, me, project_id)
    # Done here as well as by the database's ON DELETE SET NULL, so it never depends on the driver.
    db.query(SavedCircuit).filter(SavedCircuit.project_id == p.id).update({"project_id": None}, synchronize_session=False)
    db.delete(p); db.commit()


# ── Circuits ─────────────────────────────────────────────────────────────────

@router.get("/circuits", response_model=list[CircuitSummary])
def list_circuits(project: Optional[str] = Query(None, description="a project id, or 'none' for circuits outside projects"),
                  limit: int = Query(MAX_CIRCUITS, ge=1, le=MAX_CIRCUITS),
                  db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    q = db.query(SavedCircuit).filter(SavedCircuit.user_id == me.id)
    if project == "none":
        q = q.filter(SavedCircuit.project_id.is_(None))
    elif project is not None:
        if not project.isdigit():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "project must be a project id or 'none'.")
        q = q.filter(SavedCircuit.project_id == _project(db, me, int(project)).id)
    return [_summary(c) for c in q.order_by(SavedCircuit.updated_at.desc(), SavedCircuit.id.desc()).limit(limit)]


@router.post("/circuits", response_model=CircuitOut, status_code=201)
def save_circuit(req: CircuitIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    _room_for_circuit(db, me)
    if req.project_id is not None:
        _project(db, me, req.project_id)
    c = SavedCircuit(user_id=me.id, name=req.name, qasm=req.qasm, layout=req.layout, project_id=req.project_id)
    _measure(c)
    db.add(c)
    _touch(db, c.project_id)
    db.commit(); db.refresh(c)
    return _full(c)


@router.get("/circuits/{circuit_id}", response_model=CircuitOut)
def get_circuit(circuit_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    return _full(_circuit(db, me, circuit_id))


@router.patch("/circuits/{circuit_id}", response_model=CircuitOut)
def update_circuit(circuit_id: int, req: CircuitPatch, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    c = _circuit(db, me, circuit_id)
    sent = req.model_fields_set
    before = c.project_id
    if "name" in sent and req.name is not None:
        c.name = req.name
    if "qasm" in sent and req.qasm is not None:
        c.qasm = req.qasm
        _measure(c)
    if "layout" in sent:
        c.layout = req.layout
    if "project_id" in sent:
        if req.project_id is not None:
            _project(db, me, req.project_id)
        c.project_id = req.project_id
    _touch(db, before)
    _touch(db, c.project_id)
    db.commit(); db.refresh(c)
    return _full(c)


@router.post("/circuits/{circuit_id}/copy", response_model=CircuitOut, status_code=201)
def copy_circuit(circuit_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    src = _circuit(db, me, circuit_id)
    _room_for_circuit(db, me)
    c = SavedCircuit(user_id=me.id, name=f"Copy of {src.name}"[:100], qasm=src.qasm, layout=src.layout,
                     project_id=src.project_id, n_qubits=src.n_qubits, gate_count=src.gate_count)
    db.add(c)
    _touch(db, c.project_id)
    db.commit(); db.refresh(c)
    return _full(c)


@router.delete("/circuits/{circuit_id}", status_code=204)
def delete_circuit(circuit_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    c = _circuit(db, me, circuit_id)
    _touch(db, c.project_id)
    db.delete(c); db.commit()


# ── Challenge stars ──────────────────────────────────────────────────────────

def _stars_of(db: Session, me: User) -> ChallengesOut:
    rows = db.query(ChallengeProgress).filter(ChallengeProgress.user_id == me.id).all()
    return ChallengesOut(levels={r.level: r.stars for r in rows})


@router.get("/challenges", response_model=ChallengesOut)
def my_challenges(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    return _stars_of(db, me)


@router.post("/challenges", response_model=ChallengesOut)
def save_challenges(req: ChallengesIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if req.levels:
        stmt = insert(ChallengeProgress).values([{"user_id": me.id, "level": lvl, "stars": s} for lvl, s in req.levels.items()])
        stmt = stmt.on_conflict_do_update(
            constraint="uq_challenge_progress_user_level",
            set_={"stars": func.greatest(ChallengeProgress.stars, stmt.excluded.stars), "updated_at": func.now()},
        )
        db.execute(stmt)
        db.commit()
    return _stars_of(db, me)
