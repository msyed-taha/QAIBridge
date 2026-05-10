"""
Qaibridge – FastAPI Backend Entry Point
Registers all module routers and configures CORS for the React frontend.
"""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file
load_dotenv()

from app.database import engine, Base
from app.models import user as _user_models          # noqa: F401 — ensure model is registered
from app.routers import kernel, dashboard, sfod, education, recommender, transformer, optimizer, qnn, auth

# ── Create DB tables on startup ───────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Qaibridge API",
    description="AI-Driven Classical-to-Quantum Simulation Platform",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)         # Authentication
app.include_router(kernel.router)       # Module 1
app.include_router(sfod.router)         # Module 2
app.include_router(education.router)    # Module 3
app.include_router(recommender.router)  # Module 4
app.include_router(transformer.router)  # Module 5
app.include_router(optimizer.router)    # Module 6
app.include_router(qnn.router)          # Module 7
app.include_router(dashboard.router)    # Module 8


@app.get("/")
async def root():
    return {
        "project": "Qaibridge",
        "version": "1.0.0",
        "modules": {
            "auth": "Authentication → /api/auth",
            "1":    "Custom Simulation Kernel        → /api/kernel",
            "2":    "SFOD Model Comparison Suite      → /api/module2 (stub)",
            "3":    "Educational Quantum Simulator    → /api/module3 (stub)",
            "4":    "Real-World Data Recommender      → /api/module4 (stub)",
            "5":    "Classical→Quantum Transformer    → /api/module5 (stub)",
            "6":    "Neural Angle Optimizer           → /api/module6 (stub)",
            "7":    "QNN Converter                    → /api/module7 (stub)",
            "8":    "Interactive Performance Dashboard → /api/dashboard",
        },
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
