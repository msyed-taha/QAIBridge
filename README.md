# ⚛️ QAIBridge — Interactive Classical-to-Quantum Transformation & Simulation Platform

**QAIBridge** is a web platform that bridges classical computing and quantum computing. It runs quantum
algorithms on its **own state-vector simulator**, translates classical problems and code into
**QUBO / Ising Hamiltonians and oracles**, compares every quantum run against a classical baseline, and
teaches quantum concepts through a gamified circuit builder.

Final Year Project — BS Artificial Intelligence, COMSATS University Islamabad (2023–2027)
Syed Taha · Maqdad Ali — supervised by Mr. Qasim Malik (co-supervisor Dr. Tasawwar Abbas)

---

## ✨ The eight modules

| # | Module | What it does | Where |
|---|--------|--------------|-------|
| 1 | **Custom Simulation Kernel** | Proprietary NumPy state-vector simulator: 30+ gates incl. Toffoli and multi-controlled gates, in-place memory-light gate application, RAM guard ("memory wall"), up to 28 qubits RAM permitting, live per-gate progress over WebSocket, Qiskit export. | `/simulator` · `backend/app/modules/module1_kernel` |
| 2 | **SFOD Model Comparison Suite** | **S**earch (Grover), **F**actoring (Shor — real quantum order finding + continued fractions), **O**ptimisation (QAOA on real city coordinates), **D**atabase (amplitude amplification). Each run executes the classical algorithm *and* the quantum circuit and checks both answers. | `/module2`, `/solve` · `module2_sfod` |
| 3 | **Educational Quantum Simulator** | Drag-and-drop circuit builder with undo/redo, zoom, live re-simulation, a Bloch sphere per qubit (entanglement shown), 10 gamified challenge levels with stars and badges, Qiskit export. | `/module3` · `routers/education.py` |
| 4 | **Data & Architecture Recommender** | Random-Forest advisor that reads a problem description or file (PDF/DOCX/CSV/TXT) and recommends quantum vs classical plus the algorithm — then hands the user's data to the SFOD solver. | `/module4` · `routers/recommender.py` |
| 5 | **Classical → Quantum Logic Transformer** | Understands classical code (LLM engine, or an offline `ast` analyzer), builds the **Mathematical Bridge** (QUBO → Ising Hamiltonian, or Boolean logic → phase oracle / reversible circuit / Pauli-Z Hamiltonian), runs the circuit, **verifies** against the classical answer and exports Qiskit code. Code can also run in a resource-limited sandbox. | `/module5` · `module5_transformer` |
| 6 | **Neural Angle Optimizer** | PyTorch hypernetwork that learns gate angles, live barren-plateau monitor with mitigation, and a **neural QAOA (γ, β) predictor** that cuts optimiser circuit runs by ~80 % on unseen graphs. | `/module6` · `module6_optimizer` |
| 7 | **QNN Converter** | Maps a classical MLP to a variational quantum neural network, trains both and compares them structurally and in accuracy. | `/module7` · `module7_qnn` |
| 8 | **Interactive Performance Dashboard** | Live quantum-vs-classical benchmark suites streamed over WebSocket (search, factoring, QAOA, memory wall, quantum vs classical AI), Plotly charts, saved history of every run and CSV export. | `/dashboard` · `module8_dashboard` |

Plus: accounts with e-mail OTP, user and admin roles (admin allowlist), and self-service account settings.

## ✅ Verified, not just claimed

* **Kernel vs IBM Qiskit 2.5** — 200 random circuits (1–8 qubits, every gate type) plus QFT, Grover, Shor,
  QAOA and Boolean-oracle circuits agree with Qiskit's `Statevector` to fidelity 1 − 10⁻¹² (`tests/test_kernel_vs_qiskit.py`).
* **QFT = DFT matrix** exactly; every gate path checked against an independent einsum reference.
* **Grover** success probability equals sin²((2k+1)θ) at every iteration; **Shor** factors every odd composite
  N ≤ 119 from a quantum-measured period; **QAOA**'s best sample equals the exact optimum on the tested graphs/routes.
* **200+ automated backend tests** (`pytest`), plus a TypeScript type-check of the frontend.

Typical numbers on a 16 GB laptop: 15 qubits / 50 gates in ≈ 9 ms · 24-qubit QFT in ≈ 5 s using 0.6 GB ·
26-qubit GHZ in ≈ 3 s · a full live benchmark run in ≈ 14 s.

## 🏗️ Architecture

```text
 React 18 + TypeScript + Vite + Tailwind + Plotly          (frontend/)
        │  REST (JSON)  +  WebSockets (live progress / benchmarks)
        ▼
 FastAPI  ──  routers/ (auth · account · admin · kernel · module2 … module8)
        │
        ├── module1_kernel      state vector · gates · circuits · memory guard · Qiskit export
        ├── module2_sfod        Grover · Shor · QAOA · amplitude amplification · classical baselines
        ├── module5_transformer bridge (QUBO/Ising) · Boolean logic · analyzer · LLM engine · sandbox
        ├── module6_optimizer   PyTorch angle optimiser · barren plateaus · QAOA angle predictor
        ├── module7_qnn         MLP → QNN mapping and training
        └── module8_dashboard   benchmark suites · history · Solve-page solver
        │
        ▼
 PostgreSQL (users, benchmark history) — schema managed by Alembic migrations
```

**Stack:** Python 3.11 · FastAPI · NumPy · SciPy · scikit-learn · PyTorch (CPU) · SQLAlchemy · Alembic · PostgreSQL ·
React 18 · TypeScript · Vite · Tailwind CSS · Plotly · Docker. Qiskit is used only as an external benchmark
(optional test), never inside the simulator. The optional LLM engine speaks to Anthropic Claude or any
OpenAI-compatible API.

## ⚙️ Running QAIBridge

### Option A — Docker (one command)

```bash
cp backend/.env.example backend/.env      # then edit: JWT_SECRET_KEY, ADMIN_EMAILS, e-mail settings
docker compose up --build
```

Frontend → http://localhost:3000 · API docs → http://localhost:8000/docs. PostgreSQL runs as a container and
migrations run automatically.

### Option B — Local development

Requirements: Python 3.11, Node 20, PostgreSQL (database `qaibridge`, see `backend/.env.example`).

```bash
# backend
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt     # (Windows helper scripts: run-backend.ps1 / run-frontend.ps1)
cp .env.example .env                # fill in JWT_SECRET_KEY, DATABASE_URL, ADMIN_EMAILS, e-mail
alembic upgrade head
uvicorn main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev                         # http://localhost:3000 — proxies /api and WebSockets to :8000
```

### Optional: AI (LLM) engine for Module 5

Add to `backend/.env` and restart the backend:

```bash
LLM_API_KEY=sk-ant-…                # Anthropic (auto-detected) — or an OpenAI-compatible key
# LLM_MODEL=claude-opus-5-5         # optional; any model the provider offers
# LLM_BASE_URL=https://…/v1         # only for OpenAI-compatible servers (Groq, OpenRouter, Ollama …)
```

Without a key the Transformer uses its offline analyzer; the page shows which engine is active.

## 🧪 Tests

```bash
cd backend
# uses the DATABASE_URL in .env — point it at a throw-away database, and allow the test domain:
ADMIN_EMAILS="you@example.org,@example.com" python -m pytest -q

# optional accuracy check against IBM Qiskit
pip install "qiskit>=2.0" qiskit-aer && python -m pytest tests/test_kernel_vs_qiskit.py -v

cd ../frontend && npx tsc --noEmit    # type-check the frontend
```

## 📏 Honest limits (by design)

* **Simulation only** — no connection to physical QPUs in this version (Scope LI-2).
* **Memory wall** — a state vector needs 16 B × 2ⁿ; the kernel refuses runs above 85 % of free RAM (≈ 26 qubits on 16 GB).
  Algorithm demos are sized accordingly: Grover ≤ 16 qubits, Shor N ≤ 127 (21 qubits), QAOA ≤ 16 qubits (TSP ≤ 5 cities).
* **Wall-clock time of a simulated quantum circuit is not quantum speed** — comparisons use queries / circuit
  evaluations; simulation time is reported separately.
* **QAOA is a heuristic** — its answers are always checked against the exact optimum.
* **No fake speed-ups** — code with no known quantum advantage (e.g. sorting) gets an honest explanation instead.
* The code sandbox (static checks, isolated interpreter, CPU/memory limits) is defence in depth for a teaching
  tool; a public deployment should also isolate it in a locked-down container.

## 📁 Project structure

```text
backend/
  main.py                    FastAPI app (routers, CORS)
  app/routers/               HTTP + WebSocket endpoints, one file per module
  app/modules/module1_kernel … module8_dashboard/
  app/models/                SQLAlchemy models (users, benchmark_runs)
  migrations/                Alembic migrations
  tests/                     pytest suites (kernel, SFOD, transformer, dashboard, auth, admin, …)
frontend/
  src/pages/                 one page per module + Solve, Dashboard, auth and admin pages
  src/components/            charts, circuit builder, Bloch spheres, shared UI
  src/api/                   typed API clients
docs/                        developer guide, actor design, Module 6/7 guide
docker-compose.yml           db + backend + frontend
```

## 📄 License

Developed as an academic Final Year Project; intended for educational, research and demonstration purposes.
