@echo off
setlocal EnableExtensions EnableDelayedExpansion

set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend
set BACKEND_ENV=%BACKEND%\.env
set BACKEND_ENV_EXAMPLE=%BACKEND%\.env.example
set DEFAULT_DB_CONNECTION=mongodb://localhost:27017/hailnow
set DEFAULT_BACKEND_PORT=5000
set BACKEND_PORT=%DEFAULT_BACKEND_PORT%
set FRONTEND_PORT=3000
set FRONTEND_URL=http://127.0.0.1:3000

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

:: Read backend PORT from .env when it is configured
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^PORT=[0-9][0-9]*$" "%BACKEND_ENV%" 2^>nul`) do (
    set "BACKEND_PORT=%%B"
)

echo.
echo Closing existing CarPool app processes if any...
call :StopWindow "CarPool Backend"
call :StopWindow "CarPool Frontend"
call :StopPort "%BACKEND_PORT%" "backend"
call :StopPort "%FRONTEND_PORT%" "frontend"

:: Install backend node_modules if missing
if not exist "%BACKEND%\node_modules" (
    echo Installing backend dependencies...
    cd /d "%BACKEND%"
    call npm.cmd ci --no-audit --fund=false --loglevel=error
    if errorlevel 1 (
        echo ERROR: backend dependency installation failed.
        pause
        exit /b 1
    )
)

:: Install frontend node_modules if missing
if not exist "%FRONTEND%\node_modules" (
    echo Installing frontend dependencies...
    cd /d "%FRONTEND%"
    call npm.cmd ci --no-audit --fund=false --loglevel=error
    if errorlevel 1 (
        echo ERROR: frontend dependency installation failed.
        pause
        exit /b 1
    )
)

echo.
echo Starting Backend and Frontend...
echo.

:: Use /d parameter of start to set working directory (avoids nested quotes)
start "CarPool Backend"  /d "%BACKEND%"  cmd /k "npm run dev"
start "CarPool Frontend" /d "%FRONTEND%" cmd /k "npm start"

echo Opening %FRONTEND_URL%...
timeout /t 5 /nobreak >nul
start "" "%FRONTEND_URL%"

endlocal
exit /b 0

:StopWindow
set "WINDOW_TITLE=%~1"
for /f "skip=1 tokens=2 delims=," %%P in ('tasklist /V /FO CSV /FI "WINDOWTITLE eq %WINDOW_TITLE%" 2^>nul') do (
    set "WINDOW_PID=%%~P"
    if defined WINDOW_PID (
        echo Closing existing %WINDOW_TITLE% window, PID !WINDOW_PID!...
        taskkill /PID !WINDOW_PID! /T /F >nul 2>&1
    )
)
exit /b 0

:StopPort
set "TARGET_PORT=%~1"
set "SERVICE_NAME=%~2"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
    if not "%%P"=="0" (
        echo Closing existing %SERVICE_NAME% process on port %TARGET_PORT%, PID %%P...
        taskkill /PID %%P /T /F >nul 2>&1
    )
)
exit /b 0
