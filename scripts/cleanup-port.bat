@echo off
echo Cleaning up port 3000...

REM Kill all processes using port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Killing process %%a
    taskkill /F /PID %%a >nul 2>&1
)

REM Wait a moment for processes to fully terminate
timeout /t 2 /nobreak >nul

REM Double check and kill any remaining Node.js processes that might be stuck
wmic process where "name='node.exe' and commandline like '%%next%%'" call terminate >nul 2>&1

echo Port 3000 cleaned up successfully!