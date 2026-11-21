@echo off
setlocal
cd /d "%~dp0"
echo Installing Amoons Local Print Agent...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org/ then run this again.
  pause
  exit /b 1
)
node scripts\install-windows-service.js
echo Starting agent...
start "Amoons Print Agent" /MIN cmd /c "node server.js"
echo.
echo Agent should be available at http://127.0.0.1:19100/health
echo Keep this machine on the same LAN as your thermal printer.
pause
