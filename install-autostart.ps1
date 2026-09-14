# CampusFlow Auto-Start Installer
# Run ONCE as Administrator to register Windows Task Scheduler tasks.
# After this, CampusFlow starts automatically every time Windows starts.

param([switch]$Uninstall)

$Root        = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Join-Path $Root "backend"
$FrontendBld = Join-Path $Root "frontend\build"
$NodeExe     = "C:\Program Files\nodejs\node.exe"
$ServeCmd    = Join-Path $Root "node_modules\.bin\serve.cmd"
$LogDir      = Join-Path $Root "logs"

$BackendTask  = "CampusFlow-Backend"
$FrontendTask = "CampusFlow-Frontend"

if ($Uninstall) {
    Write-Host "Removing CampusFlow auto-start tasks..."
    Unregister-ScheduledTask -TaskName $BackendTask  -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $FrontendTask -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Done. CampusFlow will no longer start automatically."
    exit 0
}

# ── Require admin ─────────────────────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "[ERROR] Run this script as Administrator." -ForegroundColor Red
    Write-Host "Right-click install-autostart.ps1 -> Run with PowerShell (as Administrator)"
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Create log directory ──────────────────────────────────────────────────────
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# ── Validate paths ────────────────────────────────────────────────────────────
if (-not (Test-Path $NodeExe)) {
    Write-Host "[ERROR] node.exe not found at $NodeExe" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $BackendDir "server.js"))) {
    Write-Host "[ERROR] backend/server.js not found" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $FrontendBld)) {
    Write-Host "[ERROR] frontend/build not found. Run: npm run build --prefix frontend" -ForegroundColor Red
    exit 1
}

# ── Remove old tasks if they exist ────────────────────────────────────────────
Unregister-ScheduledTask -TaskName $BackendTask  -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $FrontendTask -Confirm:$false -ErrorAction SilentlyContinue

$currentUser = "$env:USERDOMAIN\$env:USERNAME"

# ── Task 1: Backend ───────────────────────────────────────────────────────────
Write-Host "Registering: $BackendTask"

$backendLog = Join-Path $LogDir "backend.log"
$backendCmd = "`"$NodeExe`" `"$BackendDir\server.js`""

$backendAction  = New-ScheduledTaskAction `
    -Execute    "cmd.exe" `
    -Argument   "/c `"$backendCmd`" > `"$backendLog`" 2>&1" `
    -WorkingDirectory $BackendDir

$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit      (New-TimeSpan -Hours 0) `
    -RestartCount            3 `
    -RestartInterval         (New-TimeSpan -Minutes 1) `
    -MultipleInstances       IgnoreNew `
    -StartWhenAvailable      $true

Register-ScheduledTask `
    -TaskName   $BackendTask `
    -Action     $backendAction `
    -Trigger    $trigger `
    -Settings   $settings `
    -RunLevel   Highest `
    -Force | Out-Null

Write-Host "  [OK] $BackendTask registered"

# ── Task 2: Frontend (serve production build) ─────────────────────────────────
Write-Host "Registering: $FrontendTask"

$frontendLog = Join-Path $LogDir "frontend.log"
# serve -s <build> -l 3000 : serves the static build on port 3000, single-page-app mode
$frontendCmd = "`"$ServeCmd`" -s `"$FrontendBld`" -l 3000 --no-clipboard"

$frontendAction = New-ScheduledTaskAction `
    -Execute    "cmd.exe" `
    -Argument   "/c `"$frontendCmd`" > `"$frontendLog`" 2>&1" `
    -WorkingDirectory $Root

# Delay 10 seconds after logon so backend has time to start first
$frontendTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$frontendTrigger.Delay = "PT10S"

$frontendSettings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit      (New-TimeSpan -Hours 0) `
    -RestartCount            3 `
    -RestartInterval         (New-TimeSpan -Minutes 1) `
    -MultipleInstances       IgnoreNew `
    -StartWhenAvailable      $true

Register-ScheduledTask `
    -TaskName   $FrontendTask `
    -Action     $frontendAction `
    -Trigger    $frontendTrigger `
    -Settings   $frontendSettings `
    -RunLevel   Highest `
    -Force | Out-Null

Write-Host "  [OK] $FrontendTask registered"

# ── Start both tasks immediately (no reboot needed) ───────────────────────────
Write-Host ""
Write-Host "Starting tasks now (no reboot needed)..."

# Kill anything on 5000/3000 first
@(5000, 3000) | ForEach-Object {
    Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 1

Start-ScheduledTask -TaskName $BackendTask
Start-Sleep -Seconds 8

# Verify backend
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:5000/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "  [OK] Backend: http://localhost:5000  (status $($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Backend not responding yet — check logs\backend.log" -ForegroundColor Yellow
}

Start-ScheduledTask -TaskName $FrontendTask
Start-Sleep -Seconds 5

# Verify frontend (serve starts fast — no compilation)
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 5
    Write-Host "  [OK] Frontend: http://localhost:3000  (status $($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Frontend not responding yet — check logs\frontend.log" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " CampusFlow Auto-Start installed!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host " Both tasks will run automatically at every Windows login."
Write-Host " Frontend: http://localhost:3000"
Write-Host " Backend:  http://localhost:5000"
Write-Host " Logs:     $LogDir"
Write-Host ""
Write-Host " To uninstall: powershell -File install-autostart.ps1 -Uninstall"
Write-Host ""
Read-Host "Press Enter to close"
