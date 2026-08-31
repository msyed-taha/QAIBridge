"""
Qaibridge – FastAPI Backend Entry Point
Registers all module routers and configures CORS for the React frontend.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file
load_dotenv()

from app.routers import kernel, dashboard, sfod, education, recommender, transformer, optimizer, qnn, auth, admin

# Schema is managed by Alembic migrations (backend/migrations/) — run
# `alembic upgrade head` before starting the server instead of relying
# on auto-created tables.

app = FastAPI(
    title="Qaibridge API",
    description="AI-Driven Classical-to-Quantum Simulation Platform",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Comma-separated list, e.g. "https://your-demo-domain.com,http://localhost:5173".
# Falls back to the local dev origins so nothing extra is needed to run locally.
_default_origins = "http://localhost:3000,http://localhost:5173,http://frontend:3000"
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)         # Authentication
app.include_router(admin.router)        # Admin actor (user management, stats)
app.include_router(kernel.router)       # Module 1
app.include_router(sfod.router)         # Module 2
app.include_router(education.router)    # Module 3
app.include_router(recommender.router)  # Module 4
app.include_router(transformer.router)  # Module 5
app.include_router(optimizer.router)    # Module 6
app.include_router(qnn.router)          # Module 7
app.include_router(dashboard.router)    # Solve page (custom problem solver + file extraction)


@app.get("/")
async def root():
    return {
        "project": "Qaibridge",
        "version": "1.0.0",
        "modules": {
            "auth":  "Authentication → /api/auth",
            "admin": "Admin — user management + stats → /api/admin (admin role required)",
            "1":    "Custom Simulation Kernel        → /api/kernel",
            "2":    "SFOD Model Comparison Suite      → /api/module2",
            "3":    "Educational Quantum Simulator    → /api/module3",
            "4":    "Real-World Data Recommender      → /api/module4",
            "5":    "Classical→Quantum Transformer    → /api/module5",
            "6":    "Neural Angle Optimizer           → /api/module6",
            "7":    "QNN Converter                    → /api/module7",
        },
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
