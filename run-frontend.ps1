# ----------------------------------------------------------------------------
#  Starts the QAIbridge frontend (Vite + React) on http://localhost:3000
#
#  It proxies /api calls to the backend on port 8000, so start the backend
#  first (.\run-backend.ps1 in another terminal).
#
#  Usage (from the qaibridge/ folder):   .\run-frontend.ps1
# ----------------------------------------------------------------------------
$ErrorActionPreference = "Stop"

$frontend = Join-Path $PSScriptRoot "frontend"
Set-Location $frontend

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies (first run only)..." -ForegroundColor Yellow
    npm install
}

Write-Host "Frontend ->  http://localhost:3000    (module pages need login; or use http://localhost:8000/docs)" -ForegroundColor Cyan
npm run dev
