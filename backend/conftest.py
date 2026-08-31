"""
Ensures `backend/` is on sys.path regardless of the directory pytest is
invoked from, so `import app...` and `import main` resolve the same way
they do when uvicorn runs from `backend/` (see Dockerfile: WORKDIR /app,
CMD ["uvicorn", "main:app", ...]).

Also loads backend/.env before any test module imports `app.database`, which
refuses to import without DATABASE_URL set. (main.py does its own load_dotenv()
for the uvicorn path; this covers tests that import app.* directly.)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
