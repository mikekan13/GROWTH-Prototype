try {
  $q = (Invoke-WebRequest -Uri 'http://127.0.0.1:8188/queue' -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
  Write-Host "queue_running=$($q.queue_running.Count) queue_pending=$($q.queue_pending.Count)"
  $p = (Invoke-WebRequest -Uri 'http://127.0.0.1:8188/prompt' -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
  Write-Host "exec_info: $($p | ConvertTo-Json -Compress -Depth 3)"
  # get ComfyUI process cmdline using wmi
  $p = Get-WmiObject Win32_Process -Filter "ProcessId=23136" -ErrorAction SilentlyContinue
  if ($p) { Write-Host "cmdline=$($p.CommandLine)"; Write-Host "cwd=$($p.CommandLine.Split(' ')[0])" }
} catch {
  Write-Host "ERR: $($_.Exception.Message)"
}
