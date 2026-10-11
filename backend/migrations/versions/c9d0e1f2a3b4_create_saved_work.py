"""create projects, saved_circuits, challenge_progress

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-10-11

A user's own work: saved circuits (OpenQASM text, plus the Circuit Builder's
layout), projects that group them, and stars in the Builder's challenge
levels. All erased with the account.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_projects_id"), "projects", ["id"])
    op.create_index(op.f("ix_projects_user_id"), "projects", ["user_id"])

    op.create_table(
        "saved_circuits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("qasm", sa.Text(), nullable=False),
        sa.Column("layout", sa.JSON(), nullable=True),
        sa.Column("n_qubits", sa.Integer(), nullable=True),
        sa.Column("gate_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_saved_circuits_id"), "saved_circuits", ["id"])
    op.create_index(op.f("ix_saved_circuits_user_id"), "saved_circuits", ["user_id"])
    op.create_index(op.f("ix_saved_circuits_project_id"), "saved_circuits", ["project_id"])

    op.create_table(
        "challenge_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("level", sa.String(length=64), nullable=False),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "level", name="uq_challenge_progress_user_level"),
        sa.CheckConstraint("stars BETWEEN 1 AND 3", name="ck_challenge_progress_stars"),
    )
    op.create_index(op.f("ix_challenge_progress_id"), "challenge_progress", ["id"])
    op.create_index(op.f("ix_challenge_progress_user_id"), "challenge_progress", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_challenge_progress_user_id"), table_name="challenge_progress")
    op.drop_index(op.f("ix_challenge_progress_id"), table_name="challenge_progress")
    op.drop_table("challenge_progress")
    op.drop_index(op.f("ix_saved_circuits_project_id"), table_name="saved_circuits")
    op.drop_index(op.f("ix_saved_circuits_user_id"), table_name="saved_circuits")
    op.drop_index(op.f("ix_saved_circuits_id"), table_name="saved_circuits")
    op.drop_table("saved_circuits")
    op.drop_index(op.f("ix_projects_user_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_id"), table_name="projects")
    op.drop_table("projects")
