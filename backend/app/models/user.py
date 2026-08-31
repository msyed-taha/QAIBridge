"""User model — stored in PostgreSQL via SQLAlchemy."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from ..database import Base

# The two actors in the system. A normal signup is always "user"; "admin" is
# only ever granted out-of-band (scripts/make_admin.py) or by another admin.
ROLE_USER = "user"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_USER, ROLE_ADMIN}


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    username   = Column(String(50),  unique=True,  index=True,  nullable=False)
    email      = Column(String(255), unique=True,  index=True,  nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active  = Column(Boolean, default=True)
    role       = Column(String(20), nullable=False, index=True, server_default=ROLE_USER, default=ROLE_USER)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
