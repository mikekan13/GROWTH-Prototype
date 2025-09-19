@echo off
echo Starting GROWTH Development Server...

REM First, clean up port 3000
call "%~dp0cleanup-port.bat"

REM Change to project directory
cd /d "%~dp0.."

echo ==================================================
echo   LOCAL ACCESS:  http://localhost:3000
echo   TUNNEL ACCESS: Will start after server is ready
echo ==================================================
echo.

echo Starting Next.js development server...
echo (Will start tunnel automatically once server is ready)
echo.

REM Start Next.js in background
start "Next.js Dev Server" cmd /c "pnpm dev"

REM Wait for Next.js to be ready (usually takes 3-5 seconds)
echo Waiting for Next.js server to start...
timeout /t 5 >nul

echo Starting Cloudflare tunnel...
start "Cloudflare Tunnel" cmd /c "cloudflared tunnel --url http://localhost:3000"

echo.
echo Both servers are starting...
echo - Next.js: Check the "Next.js Dev Server" window
echo - Tunnel URL: Check the "Cloudflare Tunnel" window
echo.
pause