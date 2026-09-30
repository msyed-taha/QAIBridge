"""create contact_messages

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-30

Messages sent from the public Contact form, read by admins in Admin → Messages.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=150), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_contact_messages_id"), "contact_messages", ["id"])
    op.create_index(op.f("ix_contact_messages_email"), "contact_messages", ["email"])
    op.create_index(op.f("ix_contact_messages_user_id"), "contact_messages", ["user_id"])
    op.create_index(op.f("ix_contact_messages_created_at"), "contact_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_contact_messages_created_at"), table_name="contact_messages")
    op.drop_index(op.f("ix_contact_messages_user_id"), table_name="contact_messages")
    op.drop_index(op.f("ix_contact_messages_email"), table_name="contact_messages")
    op.drop_index(op.f("ix_contact_messages_id"), table_name="contact_messages")
    op.drop_table("contact_messages")
