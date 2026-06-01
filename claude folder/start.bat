@echo off
setlocal

set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

echo ============================================
echo          CarPool App - Starting Up
echo ============================================
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found.
    echo Please install from https://nodejs.org
    pause
    exit /b 1
)

:: Check nodemon
call nodemon -v >nul 2>&1
if errorlevel 1 (
    echo Installing nodemon globally...
    call npm install -g nodemon
)

:: Install backend node_modules if missing
if not exist "%BACKEND%\node_modules" (
    echo Installing backend dependencies...
    cd /d "%BACKEND%"
    call npm install
)

:: Install frontend node_modules if missing
if not exist "%FRONTEND%\node_modules" (
    echo Installing frontend dependencies...
    cd /d "%FRONTEND%"
    call npm install
)

echo.
echo Starting Backend and Frontend...
echo.

:: Use /d parameter of start to set working directory (avoids nested quotes)
start "CarPool Backend"  /d "%BACKEND%"  cmd /k "npm run dev"
start "CarPool Frontend" /d "%FRONTEND%" cmd /k "npm start"

endlocal
