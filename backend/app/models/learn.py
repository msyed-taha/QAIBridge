"""LearnProgress model — how far a signed-in user has got in one Learn lesson."""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from ..database import Base


class LearnProgress(Base):
    __tablename__ = "learn_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson", name="uq_learn_progress_user_lesson"),
        CheckConstraint("stars BETWEEN 0 AND 3", name="ck_learn_progress_stars"),
        CheckConstraint("quiz_score IS NULL OR quiz_score BETWEEN 0 AND 3", name="ck_learn_progress_quiz_score"),
    )

    id           = Column(Integer, primary_key=True, index=True)
    # Erased with the account (ON DELETE CASCADE), like the run history.
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    lesson       = Column(String(64), nullable=False)               # the lesson's slug, e.g. "superposition"
    stars        = Column(Integer, nullable=False, default=0, server_default="0")   # best game result, 0–3
    quiz_score   = Column(Integer, nullable=True)                   # best right-first-time quiz score, 0–3
    completed_at = Column(DateTime(timezone=True), nullable=True)   # when the lesson was first finished
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
