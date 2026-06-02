@echo off
cd /d "%~dp0"
echo Starting SocialPilot AI...
echo.
npm run dev
echo.
echo App stopped. Press any key to close this window.
pause >nul
