@echo off
REM Double-click to start the Scan Bridge (visible log window). Keep it open
REM while using "مسح ضوئي مباشر" in the web app. To run it hidden & automatically
REM at login, run install-autostart.cmd instead.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge.ps1"
pause
