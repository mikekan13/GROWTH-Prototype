@echo off
REM One-click start for the local Whisper STT server.
REM Creates a venv on first run, installs deps, then runs the server.
REM Subsequent runs just reuse the venv and start quickly.

setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [whisper-server] creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [whisper-server] FAILED to create venv. Is Python 3.10+ installed and on PATH?
        pause
        exit /b 1
    )
    echo [whisper-server] installing dependencies ^(one-time, ~1-2 GB download^)...
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [whisper-server] dependency install failed. See above for the error.
        pause
        exit /b 1
    )
)

echo [whisper-server] starting...
echo [whisper-server] press Ctrl+C to stop
".venv\Scripts\python.exe" server.py
