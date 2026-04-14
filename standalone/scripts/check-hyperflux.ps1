$url = 'https://huggingface.co/ByteDance/Hyper-SD/resolve/main/Hyper-FLUX.1-dev-8steps-lora.safetensors'
$path = 'C:/AI/ComfyUI/models/loras/Hyper-FLUX.1-dev-8steps-lora.safetensors'
$r = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 5 -UseBasicParsing
$expected = [int64]$r.Headers['Content-Length']
$actual = (Get-Item $path).Length
Write-Host "expected=$expected actual=$actual"
if ($expected -eq $actual) { Write-Host 'COMPLETE' } else {
  $mb = [math]::Round(($expected - $actual)/1MB, 1)
  Write-Host "MISSING_MB=$mb"
}
