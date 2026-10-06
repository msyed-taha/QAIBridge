"""create learn_progress

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-07

Each signed-in user's progress in the Learn lessons: best stars, best quiz
score, and when each lesson was first finished. Erased with the account.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "learn_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson", sa.String(length=64), nullable=False),
        sa.Column("stars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("quiz_score", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "lesson", name="uq_learn_progress_user_lesson"),
        sa.CheckConstraint("stars BETWEEN 0 AND 3", name="ck_learn_progress_stars"),
        sa.CheckConstraint("quiz_score IS NULL OR quiz_score BETWEEN 0 AND 3", name="ck_learn_progress_quiz_score"),
    )
    op.create_index(op.f("ix_learn_progress_id"), "learn_progress", ["id"])
    op.create_index(op.f("ix_learn_progress_user_id"), "learn_progress", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_learn_progress_user_id"), table_name="learn_progress")
    op.drop_index(op.f("ix_learn_progress_id"), table_name="learn_progress")
    op.drop_table("learn_progress")
