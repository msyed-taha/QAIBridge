"""BenchmarkRun model — one saved run in the Module 8 dashboard history."""

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func

from ..database import Base

# What produced the run
KIND_BENCHMARK = "benchmark"   # live benchmark suites on the dashboard
KIND_SFOD = "sfod"             # a Module 2 classical-vs-quantum comparison
KIND_SOLVE = "solve"           # a Solve-page quantum run on the user's own data
KIND_TRANSFORM = "transform"   # a Module 5 classical→quantum transformation


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    kind        = Column(String(20), nullable=False, index=True)
    title       = Column(String(200), nullable=False)
    summary     = Column(JSON, nullable=False, default=dict)   # headline numbers shown in lists
    payload     = Column(JSON, nullable=True)                  # benchmark points (CSV export source)
    duration_ms = Column(Float, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), index=True)
