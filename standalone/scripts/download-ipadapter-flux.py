"""Download IP-Adapter-Flux + SigLIP weights in background."""
import os
from pathlib import Path
from huggingface_hub import hf_hub_download, snapshot_download

IPA_DIR = Path('C:/AI/ComfyUI/models/ipadapter-flux')
CV_DIR = Path('C:/AI/ComfyUI/models/clip_vision/siglip-so400m-patch14-384')
IPA_DIR.mkdir(parents=True, exist_ok=True)
CV_DIR.mkdir(parents=True, exist_ok=True)

# IP-Adapter weights (single .safetensors file)
print('downloading ip-adapter-flux weights...')
p1 = hf_hub_download(
    repo_id='InstantX/FLUX.1-dev-IP-Adapter',
    filename='ip-adapter.bin',
    local_dir=str(IPA_DIR),
)
print(f'  -> {p1}')

# SigLIP encoder (multiple files)
print('downloading siglip-so400m-patch14-384...')
p2 = snapshot_download(
    repo_id='google/siglip-so400m-patch14-384',
    local_dir=str(CV_DIR),
    allow_patterns=['*.json', '*.safetensors', '*.txt'],
)
print(f'  -> {p2}')

print('DONE')
