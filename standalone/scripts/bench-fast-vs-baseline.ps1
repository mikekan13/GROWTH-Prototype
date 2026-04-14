# Benchmark baseline (20-step) vs fast (8-step Hyper-FLUX + FBCache) on same prompt/seed.
# SFW prompt only.
param(
  [string]$Prompt = 'a young woman with long auburn hair, fair skin, green eyes, wearing a simple linen shirt and leather vest, neutral expression, soft natural lighting, painterly fantasy portrait, head and shoulders, detailed face',
  [string]$Negative = 'nude, naked, nsfw, blurry, lowres, deformed',
  [int]$Seed = 42
)

$wfDir = 'C:/Projects/GRO.WTH/standalone/src/ai/portraits/workflows'
$baseline = Get-Content "$wfDir/character-portrait.json" -Raw | ConvertFrom-Json -AsHashtable
$fast     = Get-Content "$wfDir/character-body-fast.json"  -Raw | ConvertFrom-Json -AsHashtable

function Patch-Workflow($wf, $prompt, $negative, $seed) {
  $wf['4'].inputs.clip_l = $prompt
  $wf['4'].inputs.t5xxl  = $prompt
  $wf['5'].inputs.text   = $negative
  $wf['7'].inputs.seed   = $seed
  return $wf
}

function Submit-And-Wait($wf, $label) {
  $body = @{ prompt = $wf } | ConvertTo-Json -Depth 20 -Compress
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/prompt' -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 30
  $promptId = ($resp.Content | ConvertFrom-Json).prompt_id
  Write-Host "[$label] prompt_id=$promptId"
  $history = $null
  for ($i = 0; $i -lt 240; $i++) {
    Start-Sleep -Seconds 2
    try {
      $h = (Invoke-WebRequest -Uri "http://127.0.0.1:8188/history/$promptId" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
      if ($h.$promptId) {
        $history = $h.$promptId
        break
      }
    } catch {}
  }
  $sw.Stop()
  $elapsed = $sw.Elapsed.TotalSeconds
  if ($history) {
    $ok = $history.status.status_str
    # find saved file
    $img = $null
    foreach ($out in $history.outputs.PSObject.Properties) {
      if ($out.Value.images) { $img = $out.Value.images[0].filename; break }
    }
    Write-Host "[$label] elapsed=${elapsed}s status=$ok image=$img"
    return @{ label = $label; elapsed = $elapsed; status = $ok; image = $img }
  } else {
    Write-Host "[$label] TIMEOUT elapsed=${elapsed}s"
    return @{ label = $label; elapsed = $elapsed; status = 'timeout'; image = $null }
  }
}

# Run baseline first (warmup pipeline), then fast.
$results = @()
$results += Submit-And-Wait (Patch-Workflow $baseline $Prompt $Negative $Seed) 'baseline_20step'
$results += Submit-And-Wait (Patch-Workflow $fast     $Prompt $Negative $Seed) 'fast_8step_fbcache'
# Second fast run to measure cached speed
$results += Submit-And-Wait (Patch-Workflow $fast     $Prompt $Negative ($Seed+1)) 'fast_8step_fbcache_run2'

Write-Host ''
Write-Host '=== BENCHMARK RESULTS ==='
foreach ($r in $results) {
  Write-Host ("{0,-28} {1,8:F1}s  {2}  {3}" -f $r.label, $r.elapsed, $r.status, $r.image)
}
if ($results[0].elapsed -and $results[1].elapsed) {
  $speedup = [math]::Round($results[0].elapsed / $results[1].elapsed, 2)
  Write-Host "speedup_baseline_vs_fast=${speedup}x"
}
