"""
Create or promote an administrator account.

Admins are never created through the public /register + OTP flow — run this
script once to seed the first admin, then that admin can promote others from
the dashboard (Admin → Users → role).

Run from the backend/ folder with the venv Python:

    venv\\Scripts\\python -m scripts.make_admin --email admin@qaibridge.local ^
        --username admin --password "ChangeMe123"

  * If an account with that email already exists, its role is set to "admin"
    (password/username left untouched unless you also pass --password/--username).
  * Otherwise a new active admin account is created, bypassing OTP verification.

List existing admins:

    venv\\Scripts\\python -m scripts.make_admin --list
"""
from __future__ import annotations

import argparse
import os
import sys

# Make "app" importable when run as `python -m scripts.make_admin` or directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

from app.database import SessionLocal  # noqa: E402
from app.models.user import User, ROLE_ADMIN, ROLE_USER  # noqa: E402
from app.auth.security import hash_password  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or promote a QAIbridge admin.")
    parser.add_argument("--email", help="Account email")
    parser.add_argument("--username", help="Username (for a new account, or to rename)")
    parser.add_argument("--password", help="Password (for a new account, or to reset)")
    parser.add_argument("--demote", metavar="EMAIL", help="Set this account's role back to 'user'")
    parser.add_argument("--list", action="store_true", help="List all admin accounts and exit")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            admins = db.query(User).filter(User.role == ROLE_ADMIN).all()
            if not admins:
                print("No admin accounts.")
            for u in admins:
                print(f"  #{u.id:<4} {u.username:<24} {u.email:<32} active={u.is_active}")
            return 0

        if args.demote:
            u = db.query(User).filter(User.email == args.demote).first()
            if not u:
                print(f"No account with email {args.demote!r}.")
                return 1
            if db.query(User).filter(User.role == ROLE_ADMIN).count() <= 1 and u.role == ROLE_ADMIN:
                print("Refusing to demote the last remaining admin.")
                return 1
            u.role = ROLE_USER
            db.commit()
            print(f"Demoted {u.email} to 'user'.")
            return 0

        if not args.email:
            parser.error("--email is required (unless using --list or --demote)")

        user = db.query(User).filter(User.email == args.email).first()

        if user:
            user.role = ROLE_ADMIN
            if args.username:
                user.username = args.username
            if args.password:
                user.hashed_password = hash_password(args.password)
            user.is_active = True
            db.commit()
            print(f"Promoted existing account {user.email} (#{user.id}) to admin.")
            return 0

        # New account
        if not args.username or not args.password:
            parser.error("creating a new admin needs --username and --password")
        if db.query(User).filter(User.username == args.username).first():
            print(f"Username {args.username!r} is already taken.")
            return 1

        user = User(
            username=args.username,
            email=args.email,
            hashed_password=hash_password(args.password),
            role=ROLE_ADMIN,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created admin account {user.email} (#{user.id}).")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
