@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "PID_DIR=%ROOT%.pids"
set "BACKEND_PID_FILE=%PID_DIR%\backend.pid"
set "FRONTEND_PID_FILE=%PID_DIR%\frontend.pid"
set "BACKEND_ENV=%BACKEND%\.env"
set "BACKEND_ENV_EXAMPLE=%BACKEND%\.env.example"
set "DEFAULT_DB_CONNECTION=mongodb://localhost:27017/hailnow"
set "DEFAULT_BACKEND_PORT=5000"
set "BACKEND_PORT=%DEFAULT_BACKEND_PORT%"
set "FRONTEND_PORT=3000"
set "FRONTEND_URL=http://localhost:3000"
set "SERVICE_START_TIMEOUT_SECONDS=60"

echo ============================================
echo          HailNow - Starting Up
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
echo Closing existing HailNow processes if any...
call :StopPidFile "%BACKEND_PID_FILE%" "backend" "HailNow Backend"
call :StopPidFile "%FRONTEND_PID_FILE%" "frontend" "HailNow Frontend"
call :StopCmdWindow "HailNow Backend"
call :StopCmdWindow "HailNow Frontend"
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
echo Starting Backend...
echo.

call :StartBackend
if errorlevel 1 (
    echo ERROR: failed to start backend window.
    pause
    exit /b 1
)

echo Waiting for backend on http://127.0.0.1:%BACKEND_PORT%/...
call :WaitForHttp "http://127.0.0.1:%BACKEND_PORT%/" "%SERVICE_START_TIMEOUT_SECONDS%" "backend"
if errorlevel 1 (
    echo ERROR: backend did not become ready on port %BACKEND_PORT%.
    pause
    exit /b 1
)

echo.
echo Starting Frontend...
echo.

call :StartFrontend
if errorlevel 1 (
    echo ERROR: failed to start frontend window.
    pause
    exit /b 1
)

echo Waiting for frontend on %FRONTEND_URL%...
call :WaitForHttp "%FRONTEND_URL%" "%SERVICE_START_TIMEOUT_SECONDS%" "frontend"
if errorlevel 1 (
    echo ERROR: frontend did not become ready on port %FRONTEND_PORT%.
    pause
    exit /b 1
)

echo Opening %FRONTEND_URL%...
start "" "%FRONTEND_URL%"

endlocal
exit /b 0

:StopPidFile
set "PID_FILE=%~1"
set "SERVICE_NAME=%~2"
set "WINDOW_TITLE=%~3"
if not exist "%PID_FILE%" exit /b 0

set "TARGET_PID="
set /p TARGET_PID=<"%PID_FILE%"
del /q "%PID_FILE%" >nul 2>&1

if not defined TARGET_PID exit /b 0
echo(%TARGET_PID%| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 exit /b 0

tasklist /V /FO CSV /FI "PID eq %TARGET_PID%" 2>nul | findstr /I /C:"%WINDOW_TITLE%" >nul
if not errorlevel 1 (
    echo Closing previous %SERVICE_NAME% window, PID %TARGET_PID%...
    taskkill /PID %TARGET_PID% /T /F >nul 2>&1
)
exit /b 0

:StopCmdWindow
set "WINDOW_TITLE=%~1"
taskkill /F /T /FI "IMAGENAME eq cmd.exe" /FI "WINDOWTITLE eq %WINDOW_TITLE%*" >nul 2>&1
exit /b 0

:StartBackend
if not exist "%PID_DIR%" mkdir "%PID_DIR%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force -Path $env:PID_DIR | Out-Null; $process=Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','title HailNow Backend && npm run dev' -WorkingDirectory $env:BACKEND -PassThru; Set-Content -Path $env:BACKEND_PID_FILE -Value $process.Id -Encoding Ascii; Write-Output ('Started Backend, PID ' + $process.Id)"
if errorlevel 1 exit /b 1
exit /b 0

:StartFrontend
if not exist "%PID_DIR%" mkdir "%PID_DIR%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force -Path $env:PID_DIR | Out-Null; $process=Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','title HailNow Frontend && npm start' -WorkingDirectory $env:FRONTEND -PassThru; Set-Content -Path $env:FRONTEND_PID_FILE -Value $process.Id -Encoding Ascii; Write-Output ('Started Frontend, PID ' + $process.Id)"
if errorlevel 1 exit /b 1
exit /b 0

:WaitForHttp
set "WAIT_URL=%~1"
set "WAIT_SECONDS=%~2"
set "WAIT_SERVICE=%~3"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds([int]$env:WAIT_SECONDS); do { try { $res=Invoke-WebRequest -UseBasicParsing -Uri $env:WAIT_URL -TimeoutSec 2; if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); Write-Error ($env:WAIT_SERVICE + ' is not ready at ' + $env:WAIT_URL); exit 1"
if errorlevel 1 exit /b 1
exit /b 0

:StopPort
set "TARGET_PORT=%~1"
set "SERVICE_NAME=%~2"
set "CLOSED_PIDS= "
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
    if not "%%P"=="0" (
        echo !CLOSED_PIDS!| findstr /C:" %%P " >nul
        if errorlevel 1 (
            set "CLOSED_PIDS=!CLOSED_PIDS!%%P "
            echo Closing existing %SERVICE_NAME% process on port %TARGET_PORT%, PID %%P...
            taskkill /PID %%P /T /F >nul 2>&1
        )
    )
)
exit /b 0
