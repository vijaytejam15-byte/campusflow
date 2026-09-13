@echo off
setlocal EnableDelayedExpansion
title CampusFlow Launcher
color 0A

echo.
echo  ============================================
echo   CampusFlow  ^|  One-Click Startup
echo  ============================================
echo.

:: Use PowerShell to do the heavy lifting - avoids all cmd.exe quoting nightmares
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-campusflow.ps1"
