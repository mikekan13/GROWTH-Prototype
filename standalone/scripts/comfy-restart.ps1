# Stop any existing ComfyUI on port 8188 then relaunch
$p = Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) {
  Write-Host "stopping comfy_pid=$($p.OwningProcess)"
  Stop-Process -Id $p.OwningProcess -Force
  Start-Sleep -Seconds 3
}
# Relaunch with same args observed
$log = 'C:/Projects/GRO.WTH/standalone/tmp/comfy-restart.log'
New-Item -ItemType Directory -Force -Path 'C:/Projects/GRO.WTH/standalone/tmp' | Out-Null
Push-Location 'C:/AI/ComfyUI'
$proc = Start-Process -FilePath 'python' -ArgumentList @('main.py', '--normalvram', '--listen', '127.0.0.1', '--port', '8188') -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru
Pop-Location
Write-Host "launched pid=$($proc.Id)"
# Wait up to 120s for http to come up
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
if ($ok) {
  Write-Host "comfy_ready after $(($i+1)*2)s"
  $o = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/object_info/ApplyFBCacheOnModel' -UseBasicParsing -TimeoutSec 5
  if ($o.Content -ne '{}' -and $o.Content -match 'ApplyFBCacheOnModel') { Write-Host 'fbcache_loaded=true' } else { Write-Host 'fbcache_loaded=false' }
} else {
  Write-Host "comfy_failed_to_start check $log"
}
