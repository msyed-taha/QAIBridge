"""
Shared test setup.

The AI is never called for real in tests: that would cost money and depend on
the network. Every test starts with the AI "not set up" (the key from
backend/.env is hidden), and any attempt to reach Claude fails the test.
Tests that need the AI use the `fake_ai` fixture, which answers instead.
"""
from __future__ import annotations

import pytest
from dotenv import load_dotenv

# Load backend/.env now, so it can't bring the real key back later in the run.
load_dotenv()


@pytest.fixture(autouse=True)
def no_real_ai(monkeypatch):
    from app.ai import service
    for name in ("LLM_API_KEY", "ANTHROPIC_API_KEY", "LLM_MODEL", "LLM_BASE_URL"):
        monkeypatch.delenv(name, raising=False)

    def refuse(*args, **kwargs):
        raise AssertionError("A test tried to call the real AI. Use the fake_ai fixture.")

    monkeypatch.setattr(service, "_send", refuse)
    service.forget_saved_answers()
    yield
    service.forget_saved_answers()


class FakeClaude:
    """Answers instead of Claude. Set `reply` (or queue `replies`), `usage` or `error`; `calls` lists what was sent."""

    def __init__(self):
        self.reply = "{}"
        self.replies: list = []
        self.usage = {"input_tokens": 1000, "output_tokens": 200, "cache_read_tokens": 0, "cache_write_tokens": 0}
        self.error = None
        self.calls: list = []

    def send(self, model, system, user, max_tokens):
        self.calls.append({"model": model, "system": system, "user": user, "max_tokens": max_tokens})
        if self.error is not None:
            raise self.error
        return (self.replies.pop(0) if self.replies else self.reply), dict(self.usage)


@pytest.fixture
def fake_ai(monkeypatch):
    """The AI switched on with a fake Claude. Usage rows and AI settings made during the test are removed after it."""
    from sqlalchemy import func
    from app.ai import service
    from app.database import SessionLocal
    from app.models.ai import AIUsage, AppSetting

    monkeypatch.setenv("LLM_API_KEY", "sk-ant-test")
    with SessionLocal() as db:
        started = db.query(func.now()).scalar()
    fake = FakeClaude()
    monkeypatch.setattr(service, "_send", fake.send)
    yield fake
    with SessionLocal() as db:
        db.query(AIUsage).filter(AIUsage.created_at >= started).delete(synchronize_session=False)
        db.query(AppSetting).filter(AppSetting.key.like("ai.%")).delete(synchronize_session=False)
        db.commit()
