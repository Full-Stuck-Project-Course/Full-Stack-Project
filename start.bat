@echo off
setlocal EnableExtensions EnableDelayedExpansion

set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend
set BACKEND_ENV=%BACKEND%\.env
set BACKEND_ENV_EXAMPLE=%BACKEND%\.env.example
set DEFAULT_DB_CONNECTION=mongodb://localhost:27017/hailnow

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

:: Create backend .env from the example if it is missing
if not exist "%BACKEND_ENV%" (
    if exist "%BACKEND_ENV_EXAMPLE%" (
        echo backend\.env not found. Creating it from backend\.env.example...
        copy /Y "%BACKEND_ENV_EXAMPLE%" "%BACKEND_ENV%" >nul
    ) else (
        echo ERROR: backend\.env is missing and backend\.env.example was not found.
        pause
        exit /b 1
    )
)

:: Ensure DB_CONNECTION is present and non-empty
findstr /R /C:"^DB_CONNECTION=." "%BACKEND_ENV%" >nul 2>&1
if errorlevel 1 (
    set "EXAMPLE_DB_CONNECTION="
    if exist "%BACKEND_ENV_EXAMPLE%" (
        for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^DB_CONNECTION=." "%BACKEND_ENV_EXAMPLE%"`) do (
            set "EXAMPLE_DB_CONNECTION=%%B"
        )
    )

    if not defined EXAMPLE_DB_CONNECTION (
        set "EXAMPLE_DB_CONNECTION=%DEFAULT_DB_CONNECTION%"
    )

    echo DB_CONNECTION is missing from backend\.env. Adding !EXAMPLE_DB_CONNECTION!
    (
        echo.
        echo DB_CONNECTION=!EXAMPLE_DB_CONNECTION!
    ) >> "%BACKEND_ENV%"
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
