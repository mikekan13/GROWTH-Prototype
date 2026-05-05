#!/usr/bin/env bash
# Runs INSIDE the pod. Downloads every model the local stack uses.
# Uses HF_TRANSFER for max throughput (RunPod is 13 Gbps down).
set -ux  # no -e: one failure shouldn't kill the rest

export HF_HUB_ENABLE_HF_TRANSFER=1
cd /workspace/ComfyUI/models

dl() {
  local repo="$1" file="$2" dir="$3"
  if [ -f "$dir/$file" ] || [ -f "$dir/$(basename $file)" ]; then
    echo "[skip] $dir/$file already present"
    return 0
  fi
  mkdir -p "$dir"
  hf download "$repo" "$file" --local-dir "$dir" || echo "[fail] $repo/$file"
}

# FLUX.1 Dev GGUF Q4_K_S (~7.1 GB)
dl city96/FLUX.1-dev-gguf flux1-dev-Q4_K_S.gguf unet

# CLIP encoders
dl comfyanonymous/flux_text_encoders t5xxl_fp8_e4m3fn.safetensors clip
dl comfyanonymous/flux_text_encoders clip_l.safetensors clip

# VAE — use Comfy-Org repackaged (public, free)
dl Comfy-Org/Lumina_Image_2.0_Repackaged split_files/vae/ae.safetensors vae
# Normalize filename if it landed under split_files/vae/
if [ -f vae/split_files/vae/ae.safetensors ] && [ ! -f vae/ae.safetensors ]; then
  mv vae/split_files/vae/ae.safetensors vae/ae.safetensors
  rm -rf vae/split_files
fi

# Hyper-FLUX 8-step
dl ByteDance/Hyper-SD Hyper-FLUX.1-dev-8steps-lora.safetensors loras

# PuLID
dl guozinan/PuLID pulid_flux_v0.9.1.safetensors pulid

# IP-Adapter-Flux (5.29 GB)
dl InstantX/FLUX.1-dev-IP-Adapter ip-adapter.bin ipadapter-flux

# ControlNet Union Pro 2
dl Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0 diffusion_pytorch_model.safetensors controlnet
if [ -f controlnet/diffusion_pytorch_model.safetensors ] && [ ! -f controlnet/flux-controlnet-union-pro2.safetensors ]; then
  mv controlnet/diffusion_pytorch_model.safetensors controlnet/flux-controlnet-union-pro2.safetensors
fi

# LivePortrait (all files)
mkdir -p /workspace/ComfyUI/models/liveportrait
hf download Kijai/LivePortrait_safetensors --local-dir /workspace/ComfyUI/models/liveportrait || true

# SigLIP (cached for Shakker IPA)
python - <<'PY' || true
from huggingface_hub import snapshot_download
snapshot_download('google/siglip-so400m-patch14-384', allow_patterns=['*.json','*.safetensors','*.txt','spiece.model'])
print('siglip cached')
PY

echo '=== final model inventory ==='
du -sh /workspace/ComfyUI/models/*/ 2>/dev/null | sort -h
echo 'DONE'
