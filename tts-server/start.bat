@echo off
REM One-click start for the local Kokoro TTS server (port 9001).
REM Uses the global Python 3.13 (kokoro + torch already installed); no venv.

setlocal
cd /d "%~dp0"

set "PY313=C:\Users\Mikek\AppData\Local\Programs\Python\Python313\python.exe"

echo [tts-server] starting...
echo [tts-server] press Ctrl+C to stop
if exist "%PY313%" (
    "%PY313%" server.py
    goto :eof
)
py -3.13 --version >nul 2>&1
if not errorlevel 1 (
    py -3.13 server.py
    goto :eof
)
python server.py
