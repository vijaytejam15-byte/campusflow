@echo off
title CampusFlow Launcher
color 0A

echo.
echo  ============================================
echo   CampusFlow ^| One-Click Startup
echo  ============================================
echo.

:: ── 1. Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  [ERROR] Node.js is not installed or not in PATH.
  echo  Download from https://nodejs.org
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found

:: ── 2. MongoDB service ────────────────────────────────────────────────────────
echo  [..] Checking MongoDB service...
sc query MongoDB >nul 2>&1
if %errorlevel% equ 0 (
  for /f "tokens=4" %%s in ('sc query MongoDB ^| findstr STATE') do set MONGO_STATE=%%s
  if /i "%MONGO_STATE%"=="RUNNING" (
    echo  [OK] MongoDB is already running
  ) else (
    echo  [..] Starting MongoDB service...
    net start MongoDB >nul 2>&1
    if %errorlevel% equ 0 (
      echo  [OK] MongoDB started
    ) else (
      echo  [WARN] Could not start MongoDB service ^(may need admin rights^)
      echo  [INFO] Backend will use in-memory MongoDB ^(development mode^)
    )
  )
) else (
  echo  [INFO] MongoDB Windows service not found
  echo  [INFO] Backend will use in-memory MongoDB ^(development mode^)
)

:: ── 3. Kill any existing CampusFlow processes on ports 3000 and 5000 ─────────
echo  [..] Checking for existing processes on ports 3000 and 5000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do (
  if not "%%p"=="0" (
    taskkill /PID %%p /F >nul 2>&1
    echo  [OK] Cleared existing process on port 5000
  )
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
  if not "%%p"=="0" (
    taskkill /PID %%p /F >nul 2>&1
    echo  [OK] Cleared existing process on port 3000
  )
)

:: ── 4. Install dependencies if node_modules missing ──────────────────────────
if not exist "%~dp0backend\node_modules" (
  echo  [..] Installing backend dependencies...
  cd /d "%~dp0backend"
  call npm install --silent
  echo  [OK] Backend dependencies installed
)
if not exist "%~dp0frontend\node_modules" (
  echo  [..] Installing frontend dependencies...
  cd /d "%~dp0frontend"
  call npm install --silent
  echo  [OK] Frontend dependencies installed
)

:: ── 5. Start Backend ─────────────────────────────────────────────────────────
echo  [..] Starting CampusFlow Backend ^(port 5000^)...
cd /d "%~dp0backend"
start "CampusFlow Backend" /min cmd /c "npm run dev 2>&1 | tee ..\backend.log"

:: ── 6. Wait for backend to be ready ──────────────────────────────────────────
echo  [..] Waiting for backend to be ready...
set BACKEND_READY=0
set TRIES=0
:WAIT_BACKEND
timeout /t 2 /nobreak >nul
set /a TRIES+=1
curl -s http://localhost:5000/health >nul 2>&1
if %errorlevel% equ 0 (
  set BACKEND_READY=1
  goto BACKEND_DONE
)
if %TRIES% lss 20 goto WAIT_BACKEND
:BACKEND_DONE
if %BACKEND_READY% equ 1 (
  echo  [OK] Backend is ready at http://localhost:5000
) else (
  echo  [WARN] Backend did not respond within 40s — check backend.log
)

:: ── 7. Start Frontend ────────────────────────────────────────────────────────
echo  [..] Starting CampusFlow Frontend ^(port 3000^)...
cd /d "%~dp0frontend"
start "CampusFlow Frontend" /min cmd /c "npm start 2>&1 | tee ..\frontend.log"

:: ── 8. Wait for frontend to be ready ─────────────────────────────────────────
echo  [..] Waiting for frontend to be ready...
set FRONTEND_READY=0
set TRIES=0
:WAIT_FRONTEND
timeout /t 3 /nobreak >nul
set /a TRIES+=1
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
  set FRONTEND_READY=1
  goto FRONTEND_DONE
)
if %TRIES% lss 30 goto WAIT_FRONTEND
:FRONTEND_DONE
if %FRONTEND_READY% equ 1 (
  echo  [OK] Frontend is ready at http://localhost:3000
) else (
  echo  [WARN] Frontend did not respond within 90s — check frontend.log
)

:: ── 9. Open browser ───────────────────────────────────────────────────────────
echo  [..] Opening CampusFlow in browser...
start "" "http://localhost:3000"

echo.
echo  ============================================
echo   CampusFlow is running!
echo  ============================================
echo.
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:5000
echo   API Docs : http://localhost:5000/api/docs
echo   Health   : http://localhost:5000/health
echo.
echo   Logs:
echo     backend.log  ^(in project root^)
echo     frontend.log ^(in project root^)
echo.
echo   To STOP: close the Backend and Frontend windows,
echo            or press Ctrl+C in those terminals.
echo.
echo  Press any key to close this launcher window...
pause >nul
