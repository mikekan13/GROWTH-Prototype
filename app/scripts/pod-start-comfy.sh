#!/usr/bin/env bash
# Start ComfyUI on the pod in high-vram mode, listening on 0.0.0.0:8188.
# Runs detached so SSH disconnect doesn't kill it. Logs to /workspace/comfy.log.
set -eux

cd /workspace/ComfyUI

# Kill any existing
pkill -f 'main.py.*8188' 2>/dev/null || true
sleep 2

# --highvram = never offload (we have 24GB)
# --listen 0.0.0.0 = accept external connections (RunPod proxy needs this)
nohup python main.py --listen 0.0.0.0 --port 8188 --highvram \
  > /workspace/comfy.log 2>&1 &
disown

echo "comfy pid=$(pgrep -f 'main.py.*8188' | head -1)"
