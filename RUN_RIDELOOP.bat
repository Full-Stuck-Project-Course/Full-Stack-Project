@echo off
setlocal

cd /d "%~dp0"

echo.
echo Starting RideLoop Carpool Web App
echo --------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this app.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm enabled.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies. This can take a minute the first time...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Opening http://127.0.0.1:5173/
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://127.0.0.1:5173/"
call npm.cmd run dev -- --host 127.0.0.1 --port 5173

echo.
pause
