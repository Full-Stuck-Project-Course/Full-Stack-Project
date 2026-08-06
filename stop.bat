@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "PID_DIR=%ROOT%.pids"
set "BACKEND_PID_FILE=%PID_DIR%\backend.pid"
set "FRONTEND_PID_FILE=%PID_DIR%\frontend.pid"
set "BACKEND_ENV=%BACKEND%\.env"
set "DEFAULT_BACKEND_PORT=5000"
set "BACKEND_PORT=%DEFAULT_BACKEND_PORT%"
set "FRONTEND_PORT=3000"

:: Read backend PORT from .env when it is configured.
if exist "%BACKEND_ENV%" (
    for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /C:"^PORT=[0-9][0-9]*$" "%BACKEND_ENV%" 2^>nul`) do (
        set "BACKEND_PORT=%%B"
    )
)

echo ============================================
echo          HailNow - Stopping
echo ============================================
echo.
echo Closing existing HailNow processes if any...

call :StopPidFile "%BACKEND_PID_FILE%" "backend" "HailNow Backend"
call :StopPidFile "%FRONTEND_PID_FILE%" "frontend" "HailNow Frontend"
call :StopCmdWindow "HailNow Backend"
call :StopCmdWindow "HailNow Frontend"
call :StopPort "%BACKEND_PORT%" "backend"
call :StopPort "%FRONTEND_PORT%" "frontend"

echo Done.

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

tasklist /FI "PID eq %TARGET_PID%" 2>nul | findstr /R /C:"[ ]%TARGET_PID%[ ]" >nul
if not errorlevel 1 (
    echo Closing previous %SERVICE_NAME% process from PID file, PID %TARGET_PID%...
    taskkill /PID %TARGET_PID% /T /F >nul 2>&1
)
exit /b 0

:StopCmdWindow
set "WINDOW_TITLE=%~1"
taskkill /F /T /FI "IMAGENAME eq cmd.exe" /FI "WINDOWTITLE eq %WINDOW_TITLE%*" >nul 2>&1
exit /b 0

:StopPort
set "TARGET_PORT=%~1"
set "SERVICE_NAME=%~2"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; $port=[int]$env:TARGET_PORT; $service=$env:SERVICE_NAME; $ids=Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $ids) { if ($processId -and $processId -ne 0) { Write-Output ('Closing existing ' + $service + ' process on port ' + $port + ', PID ' + $processId + '...'); Stop-Process -Id $processId -Force } }"
exit /b 0
