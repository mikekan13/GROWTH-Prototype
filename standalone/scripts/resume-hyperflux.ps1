$url = 'https://huggingface.co/ByteDance/Hyper-SD/resolve/main/Hyper-FLUX.1-dev-8steps-lora.safetensors'
$path = 'C:/AI/ComfyUI/models/loras/Hyper-FLUX.1-dev-8steps-lora.safetensors'
$log = 'C:/Projects/GRO.WTH/standalone/tmp/hyperflux-download.log'
New-Item -ItemType Directory -Force -Path 'C:/Projects/GRO.WTH/standalone/tmp' | Out-Null
# curl.exe -C - resumes partial file
$curl = 'C:/Windows/System32/curl.exe'
Start-Process -FilePath $curl -ArgumentList @('-L', '-C', '-', '-o', $path, $url) -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') -WindowStyle Hidden -PassThru | Select-Object Id, StartTime | Format-Table
