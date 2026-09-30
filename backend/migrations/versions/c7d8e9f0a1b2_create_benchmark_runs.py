"""create benchmark_runs (Module 8 dashboard history)

Revision ID: c7d8e9f0a1b2
Revises: b1a2c3d4e5f6
Create Date: 2026-09-29

Stores every benchmark / comparison run a user makes so the Module 8
dashboard can show history, trends and export CSV:
  * kind        — benchmark | sfod | solve | transform
  * summary     — headline numbers (JSON)
  * payload     — the benchmark points (JSON), source of the CSV export
Rows are deleted together with their user (ON DELETE CASCADE).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "b1a2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "benchmark_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_benchmark_runs_id"), "benchmark_runs", ["id"], unique=False)
    op.create_index(op.f("ix_benchmark_runs_user_id"), "benchmark_runs", ["user_id"], unique=False)
    op.create_index(op.f("ix_benchmark_runs_kind"), "benchmark_runs", ["kind"], unique=False)
    op.create_index(op.f("ix_benchmark_runs_created_at"), "benchmark_runs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_benchmark_runs_created_at"), table_name="benchmark_runs")
    op.drop_index(op.f("ix_benchmark_runs_kind"), table_name="benchmark_runs")
    op.drop_index(op.f("ix_benchmark_runs_user_id"), table_name="benchmark_runs")
    op.drop_index(op.f("ix_benchmark_runs_id"), table_name="benchmark_runs")
    op.drop_table("benchmark_runs")
