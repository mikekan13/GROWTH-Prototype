#!/usr/bin/env bash
# Runs ON the RunPod pod as its start command (run.py up packs this dir into dockerArgs and
# extracts it to /workspace/qs). Env from run.py: QS_TOKEN, QS_MAX_MINUTES, QS_MODELS, QS_DEFAULT_MODEL.
#
#  :8001  server.py (FastAPI) is the ONLY exposed port; every endpoint requires X-Token == $QS_TOKEN
#         (/status /upload /transfer /job /list /download /log). Started early so setup progress is
#         visible via /log/setup.log; it loads the pipeline once /workspace/READY exists.
set -u
QS=/workspace/qs
LOGS=/workspace/logs
MODELS=/workspace/models
LOG=$LOGS/setup.log
mkdir -p "$LOGS" /workspace/out "$MODELS" /workspace/inputs/style /workspace/inputs/content
exec > >(tee -a "$LOG") 2>&1
echo "== start $(date -u +%FT%TZ)  pod=${RUNPOD_POD_ID:-?}"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true
python3 -c "import torch;print('torch',torch.__version__,'cuda',torch.version.cuda,'ok',torch.cuda.is_available(),'cap',torch.cuda.get_device_capability(0))" || true
df -h /workspace | tail -1

# ---- self-destruct backstop: the pod stops itself after QS_MAX_MINUTES even if the PC is gone.
# RunPod injects RUNPOD_POD_ID (+ a pod-scoped RUNPOD_API_KEY used by runpodctl). `remove` = terminate.
MAXM=${QS_MAX_MINUTES:-90}
( sleep $((MAXM * 60)); echo "== max ${MAXM} min reached, self-terminating";
  runpodctl remove pod "${RUNPOD_POD_ID:-}" || runpodctl stop pod "${RUNPOD_POD_ID:-}" ) &

export HF_HUB_ENABLE_HF_TRANSFER=1 PIP_ROOT_USER_ACTION=ignore PIP_DISABLE_PIP_VERSION_CHECK=1
python3 -m pip install -q "huggingface_hub[hf_transfer]" hf_transfer || export HF_HUB_ENABLE_HF_TRANSFER=0
python3 -m pip install -q fastapi "uvicorn[standard]" python-multipart pillow

# ---- weights (background, in parallel with the DiffSynth install) -> $MODELS/<repo id>/...
cat > /workspace/dl.py <<'PY'
import os, sys, time
from huggingface_hub import snapshot_download
M = "/workspace/models"
want = os.environ.get("QS_MODELS", "telestyle-v2,qwenstyle-v1").split(",")
QIE = "Qwen/Qwen-Image-Edit-2509"
jobs = [(QIE, ["transformer/*"])]
if "telestyle-v2" in want:
    jobs += [(QIE, ["text_encoder/*", "vae/*", "processor/*"]),
             ("Tele-AI/TeleStyleV2", ["diffsynth-TeleStyleV2-QIE-2509-Lora-bf16.safetensors",
                                      "QIE-2509-Lightning-4steps-V1.0-bf16.safetensors"])]
# The V1 repo also holds the DiffSynth-format Lightning LoRA that telestyle-v2 uses by default.
jobs += [("witcherderivia/Qwen-Image-Style-Transfer",
          ["diffsynth_Qwen-Image-Edit-2509-Style-Transfer-V1.safetensors",
           "diffsynth_Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"])]
if "qwenstyle-v1" in want:
    jobs += [("Qwen/Qwen-Image", ["text_encoder/*", "vae/*"]),
             ("Qwen/Qwen-Image-Edit", ["processor/*"])]
for repo, pats in jobs:
    t = time.time()
    for attempt in range(3):
        try:
            snapshot_download(repo, allow_patterns=pats, local_dir=os.path.join(M, repo), max_workers=8)
            break
        except Exception as e:
            print("retry", repo, e, flush=True); time.sleep(10)
    else:
        sys.exit(f"download failed: {repo}")
    print(f"downloaded {repo} {pats} in {time.time()-t:.0f}s", flush=True)
PY
python3 /workspace/dl.py > "$LOGS/download.log" 2>&1 &
DL=$!

# ---- DiffSynth-Studio @ 11315d7 (both model authors pin this commit)
apt-get update -qq && apt-get install -y -qq git >/dev/null || true
cd /workspace
[ -d DiffSynth-Studio ] || git clone -q https://github.com/modelscope/DiffSynth-Studio.git
cd DiffSynth-Studio && git checkout -q 11315d7 && python3 -m pip install -q -e . || { echo "DIFFSYNTH INSTALL FAILED"; }
# TeleStyle V2 authors: "transformers version has a strong impact towards the generated image" -> their tested pin.
python3 -m pip install -q "transformers==4.57.3"
python3 -c "import torch;print('torch after deps',torch.__version__)"
python3 -c "from diffsynth.pipelines.qwen_image import QwenImagePipeline, ModelConfig; import inspect; print('ModelConfig', inspect.signature(ModelConfig))" || echo "DIFFSYNTH IMPORT FAILED"

# ---- token-guarded server (restart loop). Started AFTER the DiffSynth editable install: a Python that is
# already running never sees a .pth added later (first pod: "No module named 'diffsynth'").
( cd "$QS"; while true; do
    python3 server.py >> "$LOGS/server.log" 2>&1
    echo "server exited rc=$? $(date -u +%T), restarting in 5s" >> "$LOGS/server.log"; sleep 5
  done ) &

echo "== waiting for downloads"; wait $DL; RC=$?
cat "$LOGS/download.log"; du -sh "$MODELS"/*/* 2>/dev/null; df -h /workspace | tail -1
if [ $RC -ne 0 ]; then echo "DOWNLOAD FAILED rc=$RC"; sleep infinity; fi
date -u +%FT%TZ > /workspace/READY
echo "== READY (weights + deps); server on 8001 now loads the pipeline"
wait
