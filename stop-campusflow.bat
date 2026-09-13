@echo off
title CampusFlow — Stop
echo  Stopping CampusFlow...

:: Kill processes on port 5000 (backend)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do (
  if not "%%p"=="0" taskkill /PID %%p /F >nul 2>&1
)

:: Kill processes on port 3000 (frontend)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
  if not "%%p"=="0" taskkill /PID %%p /F >nul 2>&1
)

echo  [OK] Backend and Frontend stopped.
echo  MongoDB service was NOT stopped (it runs independently).
timeout /t 2 /nobreak >nul
