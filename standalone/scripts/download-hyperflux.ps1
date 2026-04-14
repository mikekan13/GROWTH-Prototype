$url = 'https://huggingface.co/ByteDance/Hyper-SD/resolve/main/Hyper-FLUX.1-dev-8steps-lora.safetensors'
$path = 'C:/AI/ComfyUI/models/loras/Hyper-FLUX.1-dev-8steps-lora.safetensors'
$tmp = $path + '.part'
# Use BITS async (stays alive outside this process)
$job = Start-BitsTransfer -Source $url -Destination $tmp -Asynchronous -DisplayName 'hyperflux' -Priority Foreground
Write-Host "BITS job started: $($job.JobId) state=$($job.JobState)"
