"""
AI routes.

  GET   /api/ai/status   – can the AI answer for me right now, and how many requests I have left today
  POST  /api/ai/ask      – Ask QAIbridge: a reply about quantum computing, the app or my page, plus checked actions
  GET   /api/admin/ai    – AI usage today and this month, and the settings (admins)
  PATCH /api/admin/ai    – switch the AI on or off, change the daily limits (admins)

The AI itself is used inside the tools (see app/ai/service.py), never on a page of its own.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..ai import assistant, service
from ..database import get_db
from ..models.user import User
from .auth import get_current_admin, get_current_user

router = APIRouter(prefix="/api/ai", tags=["AI"])
admin_router = APIRouter(prefix="/api/admin/ai", tags=["Admin"], dependencies=[Depends(get_current_admin)])


class AISettingsUpdate(BaseModel):
    enabled:          Optional[bool] = None
    user_daily_limit: Optional[int] = Field(None, ge=0, le=1000)
    app_daily_limit:  Optional[int] = Field(None, ge=0, le=100_000)


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(..., max_length=4000)


class AskRequest(BaseModel):
    message:    str = Field(..., min_length=1, max_length=2000)
    history:    List[Turn] = Field(default_factory=list, max_length=20)
    page:       str = Field("", max_length=200)
    page_title: str = Field("", max_length=200)
    details:    str = Field("", max_length=6000)      # what the page shows right now


@router.post("/ask")
def ask(req: AskRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Ask QAIbridge. When the AI can't answer, `reply` is empty and `unavailable` says why."""
    try:
        out = assistant.ask(req.message, page=req.page, page_title=req.page_title, details=req.details,
                            history=[t.model_dump() for t in req.history], user_id=user.id)
    except service.AIUnavailable as e:
        out = {"reply": None, "actions": [], "unavailable": e.message}
    out["ai_status"] = service.status(user.id)
    return out


@router.get("/status")
def ai_status(user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return service.status(user.id)


@admin_router.get("")
def ai_report() -> Dict[str, Any]:
    return service.usage_report()


@admin_router.patch("")
def ai_settings(req: AISettingsUpdate, db: Session = Depends(get_db)) -> Dict[str, Any]:
    changes = req.model_dump(exclude_none=True)
    if changes:
        service.update_settings(db, changes)
    return service.usage_report()
