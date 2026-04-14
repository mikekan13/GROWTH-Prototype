try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 5
  Write-Host "comfyui_up=true status=$($r.StatusCode)"
  $obj = $r.Content | ConvertFrom-Json
  Write-Host "comfy_version=$($obj.system.comfyui_version) pytorch=$($obj.system.pytorch_version)"
  # check FBCache node present
  $o = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/object_info/ApplyFBCacheOnModel' -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
  if ($o.StatusCode -eq 200 -and $o.Content -ne '{}') {
    Write-Host 'fbcache_loaded=true'
  } else {
    Write-Host 'fbcache_loaded=false (need restart)'
  }
} catch {
  Write-Host "comfyui_up=false err=$($_.Exception.Message)"
}
# list comfy processes
$procs = Get-Process | Where-Object { $_.ProcessName -match 'python|pythonw' -and $_.Path -like '*ComfyUI*' -or $_.MainWindowTitle -match 'ComfyUI' } 2>$null
$procs = Get-Process python, pythonw -ErrorAction SilentlyContinue
foreach ($p in $procs) { Write-Host "py_pid=$($p.Id) cmdline=$($p.CommandLine)" }
$p8188 = Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p8188) { Write-Host "port8188_pid=$($p8188.OwningProcess)" }
