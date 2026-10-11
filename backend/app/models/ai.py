"""
AI usage and app settings.

`ai_usage` has one row per AI request: which feature asked, which model
answered, how many tokens it took and what it cost. It never holds the text
that was sent or received. When an account is deleted its rows stay, without
the user, so the app's totals stay right.

`app_settings` is a small key → value store the admin can change while the
app runs (AI on/off, daily limits).
"""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.sql import func

from ..database import Base

# What happened to a request
OUTCOME_OK = "ok"              # Claude answered
OUTCOME_SAVED = "saved"        # answered from a saved copy: nothing sent, nothing paid
OUTCOME_ERROR = "error"        # sent, but no usable answer came back
OUTCOME_LIMIT = "limit"        # refused: a daily limit was reached
OUTCOME_REJECTED = "rejected"  # refused: empty or gibberish input, nothing sent


class AIUsage(Base):
    __tablename__ = "ai_usage"

    id                 = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    feature            = Column(String(40), nullable=False)
    model              = Column(String(80), nullable=False, default="", server_default="")
    outcome            = Column(String(20), nullable=False)
    input_tokens       = Column(Integer, nullable=False, default=0, server_default="0")
    output_tokens      = Column(Integer, nullable=False, default=0, server_default="0")
    cache_read_tokens  = Column(Integer, nullable=False, default=0, server_default="0")
    cache_write_tokens = Column(Integer, nullable=False, default=0, server_default="0")
    cost_usd           = Column(Float, nullable=False, default=0.0, server_default="0")
    latency_ms         = Column(Integer, nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key        = Column(String(60), primary_key=True)
    value      = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
