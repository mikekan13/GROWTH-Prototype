$jobs = Get-BitsTransfer -AllUsers -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'hyperflux' }
foreach ($j in $jobs) {
  $pct = if ($j.BytesTotal -gt 0) { [math]::Round(($j.BytesTransferred / $j.BytesTotal) * 100, 1) } else { 0 }
  Write-Host "job=$($j.JobId) state=$($j.JobState) pct=$pct transferred=$($j.BytesTransferred) total=$($j.BytesTotal)"
  if ($j.JobState -eq 'Transferred') {
    Complete-BitsTransfer -BitsJob $j
    Write-Host 'Completed — moved to destination'
  }
}
