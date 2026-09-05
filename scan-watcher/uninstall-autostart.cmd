@echo off
REM Removes the Scan Bridge auto-start and stops the running hidden instance.
setlocal

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "LAUNCHER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OfficeScanBridge.vbs"

if exist "%LAUNCHER%" del /F /Q "%LAUNCHER%"

REM Stop the currently running bridge (PID written by bridge.js on startup).
set "PID="
if exist "%DIR%\bridge.pid" set /p PID=<"%DIR%\bridge.pid"
if defined PID taskkill /PID %PID% /F >nul 2>nul
if exist "%DIR%\bridge.pid" del /F /Q "%DIR%\bridge.pid" >nul 2>nul

echo [OK] Scan Bridge auto-start removed and stopped.
echo.
pause
