# GROWTH standalone — Cloud dev setup

ComfyUI runs on a RunPod RTX 4090 so dev iteration is fast. The Next.js app stays local at `localhost:3001`; only the ComfyUI backend moves to cloud.

## TL;DR daily use

| I want to… | Command |
|---|---|
| Start gen-testing for the day | `node scripts/cloud-up.mjs` |
| Check pod status / model inventory | `node scripts/cloud-status.mjs` |
| Hibernate when done (save money) | `node scripts/cloud-down.mjs` |

`cloud-up` rewrites `standalone/.env` → `COMFYUI_URL` to point at the pod proxy URL. `cloud-down` leaves the volume + config intact; `cloud-up` again picks up where you left off. Only hourly runtime costs while the pod is RUNNING.

## Pod specs

- **GPU**: RTX 4090 24GB (Secure Cloud)
- **RAM**: 41GB, 21 vCPUs
- **Datacenter**: US-IL-1
- **Docker image**: `runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04`
- **Volume**: 50GB network volume at `/workspace` — persists across pod restarts. Holds all model weights (~25GB) and ComfyUI's own checkout.
- **Cost**: ~$0.59/hr running, ~$0.10/day hibernated.

## Cost budget (as of 2026-04-15)

$50 credit loaded. At 4 hrs/day dev pace: **~60 days**. Hibernate aggressively.

## Credentials

- RunPod API key → `standalone/.env.local` (`RUNPOD_API_KEY=…`). Gitignored.
- SSH keypair → `standalone/.ssh/runpod_growth` + `.pub`. Gitignored.
- Pod ID → `standalone/.ssh/pod-id.txt`.

If any of these go missing, see "Rebuilding the pod" below.

## Helper scripts

All in `standalone/scripts/`:

- **`runpod-api.mjs`** — thin REST wrapper. Exports `rp(path, init)`. CLI: `node runpod-api.mjs me`.
- **`pod-info-json.mjs`** — one-liner JSON of pod status + port mappings (used by other helpers).
- **`cloud-status.mjs`** — human status: pod state, model inventory, download log, comfy running?
- **`cloud-up.mjs`** — resume hibernated pod, wait for RUNNING, patch `.env`.
- **`cloud-down.mjs`** — hibernate (`/pods/{id}/stop`).
- **`pod-setup-comfy.sh`** — runs inside pod. Installs ComfyUI + custom nodes + applies patches. Idempotent.
- **`pod-download-models.sh`** — runs inside pod. Downloads ~25GB of models via `hf download`. Independent downloads; one failure doesn't kill the rest.
- **`pod-start-comfy.sh`** — runs inside pod. Starts ComfyUI `--highvram --listen 0.0.0.0 --port 8188` detached.

## Accessing the ComfyUI UI directly

While the pod is running: `https://{pod-id}-8188.proxy.runpod.net/`. RunPod's HTTPS proxy routes to port 8188 inside the pod. No auth by default — if the pod is public, everyone who knows the URL can use your GPU. The proxy URL is generally unguessable but treat it as semi-private.

## Custom node patches (pinned)

Three patches mirror the local stack's compat fixes and are applied automatically by `pod-setup-comfy.sh`:

1. `Comfy-WaveSpeed/first_block_cache.py` — add `**kwargs` to `forward_orig`.
2. `ComfyUI-IPAdapter-Flux/flux/layers.py` — `flipped_img_txt = getattr(…, False)`.
3. `ComfyUI-IPAdapter-Flux/utils.py` — add `**kwargs` to `forward_orig_ipa`.

These are ComfyUI 0.18+ compat patches. If the node upstream merges fixes, they become no-ops. If they merge conflicting changes, re-examine.

## Rebuilding the pod (if ever needed)

If the pod is deleted (not just hibernated) or the volume is corrupted:

1. `node scripts/runpod-api.mjs me` — verify API key works.
2. Create new volume (or reuse): `POST /v1/networkvolumes { size: 50, dataCenterId: 'US-IL-1' }` — save the ID to `.ssh/pod-id.txt`.
3. Create new pod: `POST /v1/pods { gpuTypeIds: ['NVIDIA GeForce RTX 4090'], cloudType: 'SECURE', imageName: 'runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04', containerDiskInGb: 30, networkVolumeId: '<vol>', volumeMountPath: '/workspace', ports: ['8188/http','22/tcp'], env: { PUBLIC_KEY: <pub> } }`.
4. Once `portMappings['22']` is populated, SCP `pod-setup-comfy.sh` + `pod-download-models.sh` + `pod-start-comfy.sh` to `/workspace/`.
5. SSH in, run setup, download models, start comfy. ~15 min total (models dominate).
6. Volume persistence means step 5 only runs the first time if you re-use an existing volume.

## Local fallback

If the pod is down and you need to gen locally, point `.env` back:

```
COMFYUI_URL=http://127.0.0.1:8188
```

Your local 8GB GPU works as before. The 8GB workarounds (768×768, CPU-offload IPA, VAEDecodeTiled) are baked into the workflow JSONs so they work on both.

## What's mirrored vs. what's local-only

Model weights mirrored on pod: FLUX Dev GGUF, CLIP encoders, VAE, Hyper-FLUX LoRA, PuLID, IP-Adapter-Flux, ControlNet Union Pro 2, LivePortrait, SigLIP (HF cache).

**Not mirrored yet:** `extreme-detailer-flux`, `painterly-fantasy-ckpf`, `hand-detail-flux`, `dark-fantasy-v2-flux`, `flux-nsfw-unlock` — these came from Civitai/private sources locally. Cloud gens currently run without these style LoRAs. TODO: either add source URLs to `pod-download-models.sh` or `scp` from local one-time.

## Commercial licensing reminder

Pod runs FLUX.1 Dev — **non-commercial license**. Same as local. Don't ship this as-is. See `memory/project-commercial-context.md`.
