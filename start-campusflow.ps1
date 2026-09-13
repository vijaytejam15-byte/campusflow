# CampusFlow One-Click Startup
# Called by start-campusflow.bat — handles all quoting/path issues cleanly

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

function Write-Step($msg)  { Write-Host "  [..] $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host " [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ── 1. Node.js ────────────────────────────────────────────────────────────────
$nodePath = $null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $nodePath = $nodeCmd.Source }
if (-not $nodePath) {
    Write-Fail "Node.js not found. Download from https://nodejs.org"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-OK "Node.js $(node --version)"

# ── 2. MongoDB ────────────────────────────────────────────────────────────────
Write-Step "Checking MongoDB..."
$svc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -ne "Running") {
        Write-Step "Starting MongoDB service..."
        try {
            Start-Service -Name "MongoDB" -ErrorAction Stop
            Write-OK "MongoDB service started"
        } catch {
            Write-Warn "Could not start MongoDB (try running as Administrator)"
            Write-Host "  [INFO] Backend will use in-memory MongoDB (dev mode)" -ForegroundColor Gray
        }
    } else {
        Write-OK "MongoDB already running"
    }
} else {
    Write-Host "  [INFO] MongoDB service not found - backend uses in-memory MongoDB" -ForegroundColor Gray
}

# ── 3. Kill existing processes on ports 5000 and 3000 ────────────────────────
Write-Step "Clearing ports 5000 and 3000..."
@(5000, 3000) | ForEach-Object {
    $port = $_
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Milliseconds 500

# ── 4. Install dependencies if needed ────────────────────────────────────────
if (-not (Test-Path (Join-Path $BackendDir "node_modules\express"))) {
    Write-Step "Installing backend dependencies (first run)..."
    Push-Location $BackendDir
    npm install --silent 2>&1 | Out-Null
    Pop-Location
    Write-OK "Backend dependencies installed"
}
if (-not (Test-Path (Join-Path $FrontendDir "node_modules\react"))) {
    Write-Step "Installing frontend dependencies (first run)..."
    Push-Location $FrontendDir
    npm install --silent 2>&1 | Out-Null
    Pop-Location
    Write-OK "Frontend dependencies installed"
}

# ── 5. Start Backend ──────────────────────────────────────────────────────────
Write-Step "Starting backend on port 5000..."
$backendLog = Join-Path $Root "backend.log"
$backendProc = Start-Process -FilePath "node" `
    -ArgumentList "server.js" `
    -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError (Join-Path $Root "backend-err.log") `
    -PassThru -WindowStyle Normal
Write-OK "Backend process started (PID $($backendProc.Id))"

# ── 6. Wait for backend /health ───────────────────────────────────────────────
Write-Step "Waiting for backend (up to 40s)..."
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if ($ready) {
    Write-OK "Backend ready - http://localhost:5000"
} else {
    Write-Warn "Backend not responding after 40s"
    Write-Host "  Last backend output:" -ForegroundColor Yellow
    if (Test-Path $backendLog) { Get-Content $backendLog -Tail 10 | ForEach-Object { Write-Host "    $_" } }
    Write-Host "  Check backend.log and backend-err.log in the project folder" -ForegroundColor Yellow
}

# ── 7. Start Frontend ─────────────────────────────────────────────────────────
Write-Step "Starting frontend on port 3000 (takes 1-2 minutes to compile)..."
$frontendLog = Join-Path $Root "frontend.log"
$env:BROWSER = "none"
$npmCmd = $null
$npmCmdObj = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if ($npmCmdObj) { $npmCmd = $npmCmdObj.Source }
if (-not $npmCmd) { $npmCmd = "npm.cmd" }
$frontendProc = Start-Process -FilePath $npmCmd `
    -ArgumentList "start" `
    -WorkingDirectory $FrontendDir `
    -RedirectStandardOutput $frontendLog `
    -RedirectStandardError (Join-Path $Root "frontend-err.log") `
    -PassThru -WindowStyle Normal
Write-OK "Frontend process started (PID $($frontendProc.Id))"

# ── 8. Wait for frontend ──────────────────────────────────────────────────────
Write-Step "Waiting for frontend - please wait, React compiles on first start..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    # Show progress every 10 iterations
    if ($i % 10 -eq 9) {
        $elapsed = ($i + 1) * 3
        Write-Host "  ... still waiting ($elapsed`s elapsed) ..." -ForegroundColor Gray
        # Show last line of frontend log so user sees progress
        if (Test-Path $frontendLog) {
            $last = Get-Content $frontendLog -Tail 1
            if ($last) { Write-Host "  Frontend: $last" -ForegroundColor Gray }
        }
    }
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if ($ready) {
    Write-OK "Frontend ready - http://localhost:3000"
} else {
    Write-Warn "Frontend not ready after 3 minutes"
    Write-Host "  Last frontend output:" -ForegroundColor Yellow
    if (Test-Path $frontendLog) { Get-Content $frontendLog -Tail 10 | ForEach-Object { Write-Host "    $_" } }
    Write-Host "  Check frontend.log and frontend-err.log in the project folder" -ForegroundColor Yellow
}

# ── 9. Open browser ───────────────────────────────────────────────────────────
Write-Step "Opening browser..."
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   CampusFlow is running!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   Frontend  :  http://localhost:3000" -ForegroundColor White
Write-Host "   Backend   :  http://localhost:5000" -ForegroundColor White
Write-Host "   API Docs  :  http://localhost:5000/api/docs" -ForegroundColor White
Write-Host "   Health    :  http://localhost:5000/health" -ForegroundColor White
Write-Host ""
Write-Host "   Logs: backend.log, backend-err.log, frontend.log, frontend-err.log" -ForegroundColor Gray
Write-Host "   To stop: run stop-campusflow.bat" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close this launcher"
