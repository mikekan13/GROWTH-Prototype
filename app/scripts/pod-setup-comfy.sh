#!/usr/bin/env bash
# Runs INSIDE the pod via SSH. Installs ComfyUI + all custom nodes + applies patches.
set -euxo pipefail

cd /workspace

# 1. ComfyUI core
if [ ! -d ComfyUI ]; then
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git
fi
cd ComfyUI

# 2. Python deps (pod image has torch 2.8 cuda 12.8)
pip install --quiet -r requirements.txt
pip install --quiet \
    transformers einops diffusers sentencepiece protobuf \
    dill pykalman imageio-ffmpeg mediapipe \
    timm ultralytics tyro albumentations lmdb \
    onnxruntime-gpu \
    huggingface_hub[hf_transfer]

# 3. Custom nodes (mirror of local stack)
cd custom_nodes
for repo in \
    "https://github.com/city96/ComfyUI-GGUF.git" \
    "https://github.com/balazik/ComfyUI-PuLID-Flux.git" \
    "https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git" \
    "https://github.com/chengzeyi/Comfy-WaveSpeed.git" \
    "https://github.com/kijai/ComfyUI-LivePortraitKJ.git" \
    "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git" \
    "https://github.com/Fannovel16/comfyui_controlnet_aux.git" \
    "https://github.com/XLabs-AI/x-flux-comfyui.git" \
    "https://github.com/lujiazho/ComfyUI-CatvtonFluxWrapper.git"
do
  name=$(basename "$repo" .git)
  if [ ! -d "$name" ]; then git clone --depth 1 "$repo"; fi
done

# Install any per-node python deps
for d in */; do
  if [ -f "${d}requirements.txt" ]; then
    pip install --quiet -r "${d}requirements.txt" || true
  fi
done

# 4. Apply the three patches that the local stack needed.
#    WaveSpeed: forward_orig kwargs absorb
python - <<'PY'
from pathlib import Path
f = Path('/workspace/ComfyUI/custom_nodes/Comfy-WaveSpeed/first_block_cache.py')
s = f.read_text()
needle = "        attn_mask: Tensor = None,\n    ) -> Tensor:"
if '**kwargs,\n    ) -> Tensor:' not in s:
    s = s.replace(needle, "        attn_mask: Tensor = None,\n        **kwargs,\n    ) -> Tensor:", 1)
    f.write_text(s)
    print('patched WaveSpeed')
else:
    print('WaveSpeed already patched')

# IPAdapter-Flux layers.py flipped_img_txt getattr
f = Path('/workspace/ComfyUI/custom_nodes/ComfyUI-IPAdapter-Flux/flux/layers.py')
s = f.read_text()
needle = 'self.flipped_img_txt = original_block.flipped_img_txt'
repl = "self.flipped_img_txt = getattr(original_block, 'flipped_img_txt', False)"
if repl not in s:
    s = s.replace(needle, repl, 1)
    f.write_text(s)
    print('patched IPA layers.py')
else:
    print('IPA layers.py already patched')

# IPAdapter-Flux utils.py forward_orig_ipa kwargs
f = Path('/workspace/ComfyUI/custom_nodes/ComfyUI-IPAdapter-Flux/utils.py')
s = f.read_text()
needle = "    attn_mask: Tensor = None,\n) -> Tensor:"
if '    **kwargs,\n) -> Tensor:' not in s:
    s = s.replace(needle, "    attn_mask: Tensor = None,\n    **kwargs,\n) -> Tensor:", 1)
    f.write_text(s)
    print('patched IPA utils.py')
else:
    print('IPA utils.py already patched')

# PuLID-Flux pulidflux.py forward_orig kwargs (ComfyUI 0.19+ timestep_zero_index compat)
f = Path('/workspace/ComfyUI/custom_nodes/ComfyUI-PuLID-Flux/pulidflux.py')
s = f.read_text()
old = "    guidance: Tensor = None,\n    control=None,\n) -> Tensor:"
new = "    guidance: Tensor = None,\n    control=None,\n    **kwargs,\n) -> Tensor:"
if '**kwargs,\n) -> Tensor:' not in s:
    s = s.replace(old, new, 1)
    f.write_text(s)
    print('patched PuLID pulidflux.py')
else:
    print('PuLID already patched')
PY

echo 'ComfyUI setup complete.'
