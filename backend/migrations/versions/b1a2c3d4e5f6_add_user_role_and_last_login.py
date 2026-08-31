"""add user role and last_login_at

Revision ID: b1a2c3d4e5f6
Revises: 8e49933fd676
Create Date: 2026-08-28

Adds the second-actor support to the users table:
  * role           — "user" (default) or "admin"
  * last_login_at  — updated on every successful login (feeds the admin dashboard)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1a2c3d4e5f6"
down_revision: Union[str, None] = "8e49933fd676"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="user"),
    )
    op.add_column(
        "users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "role")
