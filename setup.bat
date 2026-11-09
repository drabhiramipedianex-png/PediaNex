@echo off
cd /d "%~dp0"
echo Installing Node and Python dependencies...
call npm run setup
echo.
echo Done. Run start.bat to launch the EMR.
pause
