@echo off
echo Starting GROWTH Local Development Server...

REM First, clean up port 3000
call "%~dp0cleanup-port.bat"

REM Change to project directory
cd /d "%~dp0.."

echo ==================================================
echo   LOCAL DEVELOPMENT: http://localhost:3000
echo   (Google OAuth configured for localhost)
echo ==================================================
echo.

echo Starting Next.js development server...
pnpm dev