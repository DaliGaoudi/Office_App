@echo off
REM ============================================================================
REM  Scan Bridge - one-time auto-start installer (no admin needed)
REM
REM  Double-click this once. It makes the Scan Bridge start hidden in the
REM  background every time you log in, so the web app's "scan" button just works.
REM ============================================================================
setlocal

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LAUNCHER=%STARTUP%\OfficeScanBridge.vbs"

echo.
echo Installing Scan Bridge auto-start...
echo   Bridge folder: %DIR%

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [X] Node.js is not installed on this PC.
    echo     Install it from https://nodejs.org/  then run this installer again.
    echo.
    pause
    exit /b 1
)

REM Generate a hidden launcher in the Startup folder with the absolute path baked in.
> "%LAUNCHER%" echo Set sh = CreateObject("WScript.Shell"^)
>>"%LAUNCHER%" echo sh.CurrentDirectory = "%DIR%"
>>"%LAUNCHER%" echo sh.Run "node bridge.js", 0, False
if errorlevel 1 (
    echo [X] Could not write to the Startup folder.
    pause
    exit /b 1
)

REM Start it right now (hidden) so you don't have to log out and back in.
wscript.exe "%LAUNCHER%"

echo.
echo [OK] Done. The Scan Bridge is running and will start automatically at every login.
echo      Open a record in the web app and click "مسح ضوئي مباشر" - it will just work.
echo      To remove it later, run uninstall-autostart.cmd.
echo.
pause
