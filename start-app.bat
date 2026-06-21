@echo off
fltmc >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission for LDPlayer automation...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
echo Starting SocialPilot AI...
echo.
npm run dev
echo.
echo App stopped. Press any key to close this window.
pause >nul
