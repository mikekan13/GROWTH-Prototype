$q = (Invoke-WebRequest -Uri 'http://127.0.0.1:8188/queue' -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
Write-Host 'RUNNING:'
$q.queue_running | ConvertTo-Json -Depth 4
Write-Host 'PENDING:'
$q.queue_pending | ConvertTo-Json -Depth 4 | Select-Object -First 50
Write-Host "running_count=$($q.queue_running.Count) pending_count=$($q.queue_pending.Count)"
