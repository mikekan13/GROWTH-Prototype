# boot.ps1 — Unified GRO.WTH dev launcher
# -----------------------------------------------------------------------------
# Starts the local Whisper STT server (port 9000) and the Next.js dev server
# (port 3000) together, with logs written OUTSIDE the app/ directory so they
# never trip webpack's file watcher (the 2026-06-20 page-reload-in-silence bug).
#
# Usage:   powershell -ExecutionPolicy Bypass -File .\boot.ps1
#          .\boot.ps1 -NoWhisper     # dev server only
#          .\boot.ps1 -Restart       # kill existing node/uvicorn first
#
# Idempotent: if a port is already listening, that service is left alone.
# -----------------------------------------------------------------------------
param(
    [switch]$NoWhisper,
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$Root      = $PSScriptRoot
$AppDir    = Join-Path $Root 'app'
$WhisperDir= Join-Path $Root 'whisper-server'
$LogDir    = Join-Path $Root 'logs'   # <-- OUTSIDE app/, not watched by webpack

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-Port([int]$Port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $Port); $c.Close(); return $true
    } catch { return $false }
}

function Wait-Port([int]$Port, [int]$TimeoutSec = 60) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Milliseconds 750
    }
    return $false
}

if ($Restart) {
    Write-Host '[boot] -Restart: stopping existing node + python servers...' -ForegroundColor Yellow
    Get-Process node, python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# --- Whisper STT server (port 9000) ------------------------------------------
if (-not $NoWhisper) {
    if (Test-Port 9000) {
        Write-Host '[boot] whisper-server already up on :9000 — leaving it.' -ForegroundColor DarkGray
    } else {
        Write-Host '[boot] starting whisper-server (logs -> logs\whisper.*.log)...' -ForegroundColor Cyan
        Start-Process -FilePath 'cmd.exe' `
            -ArgumentList ('/c "' + (Join-Path $WhisperDir 'start.bat') + '"') `
            -WorkingDirectory $WhisperDir `
            -RedirectStandardOutput (Join-Path $LogDir 'whisper.out.log') `
            -RedirectStandardError  (Join-Path $LogDir 'whisper.err.log') `
            -WindowStyle Hidden | Out-Null
    }
}

# --- Next.js dev server (port 3000) ------------------------------------------
if (Test-Port 3000) {
    Write-Host '[boot] dev server already up on :3000 — leaving it.' -ForegroundColor DarkGray
} else {
    Write-Host '[boot] starting Next.js dev (logs -> logs\dev-server.*.log)...' -ForegroundColor Cyan
    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev' `
        -WorkingDirectory $AppDir `
        -RedirectStandardOutput (Join-Path $LogDir 'dev-server.out.log') `
        -RedirectStandardError  (Join-Path $LogDir 'dev-server.err.log') `
        -WindowStyle Hidden | Out-Null
}

# --- Smoke check -------------------------------------------------------------
Write-Host '[boot] waiting for services...' -ForegroundColor Cyan
$devUp = Wait-Port 3000 90
$whUp  = if ($NoWhisper) { $null } else { Wait-Port 9000 120 }  # first run builds venv

Write-Host ''
Write-Host '================ GRO.WTH boot status ================' -ForegroundColor White
Write-Host ("  dev server  (:3000) : {0}" -f $(if ($devUp) {'UP'} else {'DOWN — see logs\dev-server.err.log'})) -ForegroundColor $(if ($devUp){'Green'}else{'Red'})
if ($NoWhisper) {
    Write-Host '  whisper     (:9000) : SKIPPED (-NoWhisper)' -ForegroundColor DarkGray
} else {
    Write-Host ("  whisper     (:9000) : {0}" -f $(if ($whUp) {'UP'} else {'DOWN — see logs\whisper.err.log'})) -ForegroundColor $(if ($whUp){'Green'}else{'Red'})
}

# Confirm whisper actually answers /health, not just an open socket.
if ($whUp) {
    try {
        $h = Invoke-RestMethod -Uri 'http://127.0.0.1:9000/health' -TimeoutSec 5
        Write-Host "  whisper /health     : OK ($($h | ConvertTo-Json -Compress))" -ForegroundColor Green
    } catch {
        Write-Host '  whisper /health     : socket open but /health not ready yet (model may still be loading)' -ForegroundColor Yellow
    }
}
Write-Host '====================================================' -ForegroundColor White
Write-Host '  App:  http://localhost:3000' -ForegroundColor White
Write-Host '  Logs: ' -NoNewline; Write-Host $LogDir -ForegroundColor White
Write-Host '  Stop: .\boot.ps1 -Restart  (or kill the node/python procs)' -ForegroundColor DarkGray
