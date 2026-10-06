"""
Learn Router — saves each signed-in user's progress in the Learn course.

  GET  /api/learn/progress  – your progress in every lesson you have started
  POST /api/learn/progress  – merge in new progress: one lesson, or several at
                              once when a visitor's browser progress is carried
                              over at sign-in or sign-up

Progress only ever goes up: stars and quiz scores keep their best value, and a
finished lesson stays finished. Each lesson is a single upsert, so two saves
arriving together can't clash. The account always comes from the JWT, never
from the request body.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.learn import LearnProgress
from ..models.user import User
from .auth import get_current_user

router = APIRouter(prefix="/api/learn", tags=["Learn"])

# Keep equal to the slugs in frontend/src/learn/lessons.ts.
LESSON_SLUGS = frozenset({
    "bit-vs-qubit", "superposition", "measurement", "quantum-gates", "interference",
    "entanglement", "decoherence", "quantum-fourier-transform", "quantum-advantage",
})
MAX_STARS = 3        # three game levels per lesson
QUIZ_QUESTIONS = 3   # three questions per lesson's Test


class LessonProgressIn(BaseModel):
    stars: int = Field(0, ge=0, le=MAX_STARS)
    quiz_score: Optional[int] = Field(None, ge=0, le=QUIZ_QUESTIONS)
    completed: bool = False


class ProgressIn(BaseModel):
    lessons: dict[str, LessonProgressIn] = Field(..., max_length=len(LESSON_SLUGS))

    @field_validator("lessons")
    @classmethod
    def _known_lessons(cls, lessons: dict[str, LessonProgressIn]) -> dict[str, LessonProgressIn]:
        unknown = sorted(set(lessons) - LESSON_SLUGS)
        if unknown:
            raise ValueError(f"Unknown lesson: {', '.join(unknown)}.")
        return lessons


class LessonProgressOut(BaseModel):
    stars: int
    quiz_score: Optional[int]
    completed: bool


class ProgressOut(BaseModel):
    lessons: dict[str, LessonProgressOut]


def _progress_of(db: Session, user: User) -> ProgressOut:
    rows = db.query(LearnProgress).filter(LearnProgress.user_id == user.id).all()
    return ProgressOut(lessons={
        r.lesson: LessonProgressOut(stars=r.stars, quiz_score=r.quiz_score, completed=r.completed_at is not None)
        for r in rows
    })


@router.get("/progress", response_model=ProgressOut)
def my_progress(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    return _progress_of(db, me)


@router.post("/progress", response_model=ProgressOut)
def save_progress(req: ProgressIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if req.lessons:
        now = datetime.now(timezone.utc)
        stmt = insert(LearnProgress).values([
            {
                "user_id": me.id,
                "lesson": slug,
                "stars": p.stars,
                "quiz_score": p.quiz_score,
                "completed_at": now if p.completed else None,
            }
            for slug, p in req.lessons.items()
        ])
        # Keep the best of old and new. GREATEST skips NULLs in PostgreSQL, so a
        # missing quiz score never wipes a saved one; COALESCE keeps the first finish time.
        stmt = stmt.on_conflict_do_update(
            constraint="uq_learn_progress_user_lesson",
            set_={
                "stars": func.greatest(LearnProgress.stars, stmt.excluded.stars),
                "quiz_score": func.greatest(LearnProgress.quiz_score, stmt.excluded.quiz_score),
                "completed_at": func.coalesce(LearnProgress.completed_at, stmt.excluded.completed_at),
                "updated_at": func.now(),
            },
        )
        db.execute(stmt)
        db.commit()
    return _progress_of(db, me)
