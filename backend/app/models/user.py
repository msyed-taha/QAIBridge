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
    # Set when the user deletes their own account. The row is kept (inactive) so
    # signing up again with the same email restores it. An admin deactivation
    # leaves this NULL, so it can't be undone by re-registering.
    deleted_at    = Column(DateTime(timezone=True), nullable=True)
    # When the user ticked "I agree to the Terms of Use and Privacy Policy" at
    # sign-up, and which version (app/legal.py TERMS_VERSION) that was.
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    terms_version     = Column(String(20), nullable=True)
    # Goes into every sign-in token; adding 1 signs the account out on every
    # device (see auth.security.token_for). Bumped by a password change or reset,
    # an admin switching the account off, and restoring a deleted account.
    token_version     = Column(Integer, nullable=False, default=0, server_default="0")

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
