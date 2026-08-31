# ----------------------------------------------------------------------------
#  Starts the QAIbridge backend (FastAPI) on http://localhost:8000
#
#  The server boots with the dummy DATABASE_URL in backend/.env, so you can hit
#  the Module 6 & 7 endpoints at http://localhost:8000/docs without a real
#  database. Logging in through the frontend needs a real PostgreSQL + Gmail
#  creds in backend/.env (see README "Two ways to reach Modules 6 & 7").
#
#  Usage (from the qaibridge/ folder):   .\run-backend.ps1
# ----------------------------------------------------------------------------
$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "backend"
$python  = Join-Path $backend "venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Backend virtualenv not found at:" -ForegroundColor Red
    Write-Host "  $python" -ForegroundColor Red
    Write-Host ""
    Write-Host "Create it once with:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor Yellow
    Write-Host "  python -m venv venv" -ForegroundColor Yellow
    Write-Host "  venv\Scripts\python -m pip install -r requirements.txt" -ForegroundColor Yellow
    Write-Host "  venv\Scripts\python -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $backend ".env"))) {
    Copy-Item (Join-Path $backend ".env.example") (Join-Path $backend ".env")
    Write-Host "Created backend/.env from .env.example (dummy values - edit it for login/DB)." -ForegroundColor Green
}

Write-Host "Backend  ->  http://localhost:8000    (API docs: http://localhost:8000/docs)" -ForegroundColor Cyan
Set-Location $backend
& $python -m uvicorn main:app --reload --port 8000
