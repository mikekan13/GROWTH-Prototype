"""Download KlingTeam/LivePortrait weights for ComfyUI-LivePortraitKJ."""
from pathlib import Path
from huggingface_hub import snapshot_download

# KJ node looks under ComfyUI/models/liveportrait
TARGET = Path('C:/AI/ComfyUI/models/liveportrait')
TARGET.mkdir(parents=True, exist_ok=True)

print('downloading KlingTeam/LivePortrait...')
p = snapshot_download(
    repo_id='Kijai/LivePortrait_safetensors',
    local_dir=str(TARGET),
)
print(f'-> {p}')
print('DONE')
