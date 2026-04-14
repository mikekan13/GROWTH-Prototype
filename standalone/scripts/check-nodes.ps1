$targets = @(
  'ApplyFBCacheOnModel',
  'IPAdapterFluxLoader',
  'ApplyIPAdapterFlux',
  'DownloadAndLoadLivePortraitModels',
  'LivePortraitProcess',
  'LivePortraitCropper',
  'LivePortraitLoadCropper',
  'CatvtonFluxWrapper',
  'CatVTONFluxSampler'
)
foreach ($t in $targets) {
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:8188/object_info/$t" -UseBasicParsing -TimeoutSec 5
    if ($r.Content -match '"input"') { Write-Host "$t : loaded" } else { Write-Host "$t : empty" }
  } catch {
    Write-Host "$t : error $($_.Exception.Message)"
  }
}
# comfy startup errors
Write-Host '---startup-errors---'
$log = 'C:/Projects/GRO.WTH/standalone/tmp/comfy-restart.log.err'
if (Test-Path $log) {
  Get-Content $log | Select-String -Pattern 'error|Error|Traceback|failed|Failed' | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
}
