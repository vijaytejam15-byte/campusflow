@echo off
setlocal EnableDelayedExpansion
title CampusFlow Launcher
color 0A

echo.
echo  ============================================
echo   CampusFlow  ^|  One-Click Startup
echo  ============================================
echo.

:: ── Project root (directory containing this .bat, without trailing backslash)
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

:: ── 1. Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Download from https://nodejs.org
  pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

:: ── 2. MongoDB ───────────────────────────────────────────────────────────────
echo  [..] Checking MongoDB...
sc query MongoDB >nul 2>&1
if not errorlevel 1 (
  sc query MongoDB | find "RUNNING" >nul 2>&1
  if errorlevel 1 (
    echo  [..] Starting MongoDB service...
    net start MongoDB >nul 2>&1
    if errorlevel 1 (
      echo  [WARN] Could not start MongoDB (run as Administrator if needed)
      echo  [INFO] Backend will use in-memory MongoDB (dev mode)
    ) else (
      echo  [OK] MongoDB service started
    )
  ) else (
    echo  [OK] MongoDB already running
  )
) else (
  echo  [INFO] MongoDB service not installed - using in-memory MongoDB
)

:: ── 3. Clear ports 5000 and 3000 ─────────────────────────────────────────────
echo  [..] Clearing ports 5000 and 3000...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| find ":5000 "') do (
  if not "%%P"=="0" taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| find ":3000 "') do (
  if not "%%P"=="0" taskkill /PID %%P /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── 4. Install dependencies if needed ────────────────────────────────────────
if not exist "%ROOT%\backend\node_modules\express" (
  echo  [..] Installing backend dependencies (first run - may take a minute)...
  cd /d "%ROOT%\backend"
  call npm install >nul 2>&1
  echo  [OK] Backend dependencies installed
)
if not exist "%ROOT%\frontend\node_modules\react" (
  echo  [..] Installing frontend dependencies (first run - may take a minute)...
  cd /d "%ROOT%\frontend"
  call npm install >nul 2>&1
  echo  [OK] Frontend dependencies installed
)

:: ── 5. Start Backend ─────────────────────────────────────────────────────────
echo  [..] Starting backend on port 5000...
start "CF-Backend" cmd /k "cd /d "%ROOT%\backend" && node server.js"

:: ── 6. Wait for backend /health ──────────────────────────────────────────────
echo  [..] Waiting for backend (up to 40s)...
set TRIES=0
:WAIT_BE
timeout /t 2 /nobreak >nul
set /a TRIES+=1
curl.exe -s -o nul -w "%%{http_code}" http://localhost:5000/health 2>nul | find "200" >nul 2>&1
if not errorlevel 1 (
  echo  [OK] Backend ready - http://localhost:5000
  goto START_FE
)
if !TRIES! lss 20 goto WAIT_BE
echo  [WARN] Backend not responding after 40s - check the CF-Backend window

:: ── 7. Start Frontend ────────────────────────────────────────────────────────
:START_FE
echo  [..] Starting frontend on port 3000 (React takes 60-120s to compile)...
start "CF-Frontend" cmd /k "cd /d "%ROOT%\frontend" && set BROWSER=none && npm start"

:: ── 8. Wait for frontend (React dev server takes ~60-120s to compile) ────────
echo  [..] Waiting for frontend (please wait, this takes 1-2 minutes)...
set TRIES=0
:WAIT_FE
timeout /t 3 /nobreak >nul
set /a TRIES+=1
curl.exe -s -o nul -w "%%{http_code}" http://localhost:3000 2>nul | find "200" >nul 2>&1
if not errorlevel 1 (
  echo  [OK] Frontend ready - http://localhost:3000
  goto OPEN
)
if !TRIES! lss 60 goto WAIT_FE
echo  [WARN] Frontend not ready after 3 minutes - check the CF-Frontend window
goto OPEN

:: ── 9. Open browser ──────────────────────────────────────────────────────────
:OPEN
echo  [..] Opening browser...
start "" "http://localhost:3000"

echo.
echo  ============================================
echo   CampusFlow is running!
echo  ============================================
echo   Frontend  :  http://localhost:3000
echo   Backend   :  http://localhost:5000
echo   API Docs  :  http://localhost:5000/api/docs
echo   Health    :  http://localhost:5000/health
echo.
echo   The CF-Backend and CF-Frontend windows must
echo   stay open for CampusFlow to keep running.
echo.
echo   To stop: run stop-campusflow.bat
echo.
echo  Press any key to close this launcher...
pause >nul
endlocal
