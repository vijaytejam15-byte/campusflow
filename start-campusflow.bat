@echo off
setlocal
title CampusFlow Launcher

echo.
echo  ============================================
echo   CampusFlow  ^|  One-Click Startup
echo  ============================================
echo.

:: Run the PowerShell launcher. -ExecutionPolicy Bypass lets it run without
:: the user changing any Windows security settings.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
  -File "%~dp0start-campusflow.ps1"

if errorlevel 1 (
  echo.
  echo  [ERROR] Startup script failed. See messages above.
  echo.
  pause
)
endlocal
