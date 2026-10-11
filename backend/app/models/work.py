"""
A user's own work: saved circuits, the projects that group them, and their
stars in the Circuit Builder's challenge levels. All of it is erased with the
account (ON DELETE CASCADE), like the run history and Learn progress.
"""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from ..database import Base


class Project(Base):
    """A named folder of circuits, e.g. "Grover experiments"."""
    __tablename__ = "projects"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name        = Column(String(100), nullable=False)
    description = Column(String(500), nullable=False, default="", server_default="")
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SavedCircuit(Base):
    """
    A circuit saved from the Circuit Builder or the Quantum Simulator. The
    OpenQASM text is the circuit itself; Builder circuits also keep their
    layout (where each gate sits) so they reopen exactly as drawn.
    """
    __tablename__ = "saved_circuits"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # Deleting a project keeps its circuits; they just no longer belong to one.
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), index=True, nullable=True)
    name       = Column(String(100), nullable=False)
    qasm       = Column(Text, nullable=False)
    layout     = Column(JSON, nullable=True)        # Builder circuits only
    n_qubits   = Column(Integer, nullable=True)     # empty while the text has a mistake in it
    gate_count = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChallengeProgress(Base):
    """Best stars (1–3) in one of the Circuit Builder's challenge levels."""
    __tablename__ = "challenge_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "level", name="uq_challenge_progress_user_level"),
        CheckConstraint("stars BETWEEN 1 AND 3", name="ck_challenge_progress_stars"),
    )

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    level      = Column(String(64), nullable=False)     # the level's id, e.g. "bell"
    stars      = Column(Integer, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
