"""ContactMessage model — a message sent from the public Contact form."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from ..database import Base


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    email      = Column(String(255), nullable=False, index=True)
    subject    = Column(String(150), nullable=True)
    message    = Column(Text, nullable=False)
    # Filled in when the sender was signed in; kept (as NULL) if that account is removed.
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    is_read    = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
