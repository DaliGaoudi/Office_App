@echo off
REM Double-click to start the Scan Bridge. Keep this window open while using
REM "مسح ضوئي مباشر" in the web app. To run it automatically at login, put a
REM shortcut to this file in:  shell:startup  (Win+R → type it → Enter).
cd /d "%~dp0"
node bridge.js
pause
