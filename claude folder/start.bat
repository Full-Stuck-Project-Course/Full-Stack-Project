@echo off
setlocal

:: Save root folder path once
set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

echo Checking and installing dependencies...

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo Node.js not found. Please install from https://nodejs.org
    pause
    exit
)

:: Check nodemon globally
nodemon -v >nul 2>&1
if errorlevel 1 (
    echo Installing nodemon...
    npm install -g nodemon
)

:: Install backend dependencies if needed
if not exist "%BACKEND%\node_modules" (
    echo Installing backend packages...
    cd /d "%BACKEND%"
    npm install
)

:: Install frontend dependencies if needed
if not exist "%FRONTEND%\node_modules" (
    echo Installing frontend packages...
    cd /d "%FRONTEND%"
    npm install
)

echo Starting app...
start "Backend"  cmd /k "cd /d "%BACKEND%" && npm run dev"
start "Frontend" cmd /k "cd /d "%FRONTEND%" && npm start"

endlocal
