try {
  $r = Invoke-WebRequest 'http://127.0.0.1:8188/prompt' -UseBasicParsing
  Write-Host "exec_info: $($r.Content)"
} catch {}
# Try the websocket-style status snapshot via internal API
try {
  $r = Invoke-WebRequest 'http://127.0.0.1:8188/internal/api/status' -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
  Write-Host "internal_status: $($r.Content)"
} catch {}
# pid + cpu/gpu
$p = Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $null }
foreach ($pp in $p) { Write-Host "py_pid=$($pp.Id) cpu=$([math]::Round($pp.CPU,1))s ws_mb=$([math]::Round($pp.WS/1MB,0))" }
# nvidia
nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits
