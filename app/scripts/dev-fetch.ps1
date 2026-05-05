try {
  $r = Invoke-WebRequest -Uri 'http://localhost:3001' -UseBasicParsing -TimeoutSec 10
  Write-Host "status=$($r.StatusCode) bytes=$($r.RawContentLength)"
} catch {
  Write-Host "ERR: $($_.Exception.Message)"
}
$p = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) { Write-Host "port3001_pid=$($p.OwningProcess)" } else { Write-Host "port3001_NOT_BOUND" }
