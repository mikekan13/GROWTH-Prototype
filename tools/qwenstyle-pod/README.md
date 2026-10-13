# qwenstyle-pod — batch style transfer on a temporary RunPod GPU

Restyles the content corpus (`style-refs/corpus/content/*.png`) with our style anchor. It keeps each
image's subject and changes only the look. Two models are available. Both are LoRAs on
**Qwen-Image-Edit-2509** and run through **DiffSynth-Studio @ 11315d7**, which both sets of authors pin:

| `--model` | Weights (HF, Apache-2.0) | Resize rule |
|---|---|---|
| `telestyle-v2` (default) | `Tele-AI/TeleStyleV2`: `diffsynth-TeleStyleV2-QIE-2509-Lora-bf16` + Lightning 4-step | Content and style both keep their aspect ratio. The short edge becomes `min_edge` and the long edge is floored to a multiple of 16. |
| `qwenstyle-v1` | `witcherderivia/Qwen-Image-Style-Transfer` (arXiv 2601.06202): Style-Transfer-V1 + Lightning 4-step | The content's short edge becomes 1024 (multiples of 16). The style ref is squashed to 1024×1024. |

Both models use the same prompt (`Style Transfer the style of Figure 2 to Figure 1, and keep the content and characteristics of Figure 1.`) and the same settings: `edit_image=[content, style]`, 4 steps, cfg 1.0, seed 123.

Style refs: `gold` = `style-refs/STYLE-ANCHOR-2026-10-13-sheet6-seed8.png` (primary), and
`headless` = `style-refs/anchor-variants/anchor-headless-desaturated.png` (fallback test).

## Files
- `run.py`: the local driver (Python 3 + `requests` + `Pillow`). Reads `RUNPOD_API_KEY` from `app/.env.local` and never prints it.
- `pod_setup.sh`: the pod's start command. It installs the dependencies and DiffSynth, downloads the weights to `/workspace/models`, writes `READY`, and starts `server.py`.
- `server.py`: the FastAPI server on `:8001`, the pod's **only** exposed port. Every endpoint needs the per-pod random token: `/upload`, `/transfer`, `/job/<id>`, `/status`, `/list`, `/download/<name>`, `/log/<name>`. Nothing is served without auth.
- `transfer_core.py`: the pipeline itself, i.e. model loading, the resize rules and the transfer call.

`run.py up` packs the three pod files into the `dockerArgs` start command (about 10.2 KB). The pod needs no SSH, no network volume and no public URL for your images. Uploads go through the HTTPS proxy.

## Commands (in order)
```
cd C:\Projects\GRO.WTH\tools\qwenstyle-pod
python run.py up --dry-run          # optional: prints the GraphQL payload; sends nothing
python run.py up                    # 1. create the H100 pod, wait for READY + pipeline loaded (~15-25 min)
python run.py push                  # 2. upload gold/headless refs + all content PNGs
python run.py transfer --style gold # 3. run every content image; downloads + contact sheets
python run.py down                  # ALWAYS: terminate + verify gone
```
Optional extras:
- `transfer --model qwenstyle-v1 --style headless --ids a b c --min-edge 832`
- `status`
- `logs [setup.log|download.log|server.log]`
- `list`
- `watch`: run this in a second terminal. It terminates the pod when the cap is reached.

Outputs go to `style-refs/corpus/styled/<model>/<style>/<id>.png`, together with `_contact_NN.png` (before/after pairs) and `_run.json`.

## Cost guards
- `--max-minutes 90` (the default) is enforced three ways:
  - every `run.py` command terminates the pod once the cap is passed;
  - `run.py watch` terminates it when the cap is reached;
  - the pod self-terminates with `runpodctl remove pod` at the same time.
- H100 80GB costs about $2.69/h, so the 90-minute worst case is about $4.04. `--gpu pro6000` (96 GB, about $2.49/h) is an option.
- Typical run: about 15–25 min of setup plus about 15 min for 120 images, which comes to about $1.80–$2.50.
- Weights downloaded:
  - QIE-2509 transformer: about 40 GB.
  - QIE-2509 text encoder: about 16 GB, plus the Qwen-Image text encoder at about 16 GB for V1.
  - LoRAs: about 2.6 GB.
  - Total: about 75 GB. `up --models telestyle-v2` skips the V1-only text encoder.

## After
- Run `python run.py down`. It deletes the pod and its 150 GB pod volume, which leaves no storage cost. It also renames `.state.json` to `.state.<podId>.done.json`.
- Check the RunPod console to confirm no pods remain.
- You can delete the `.state.*.done.json` files. They are gitignored and contain the dead pod's token.

## Known uncertainties
- The TeleStyle V2 authors' tested demo runs **diffusers**. Their DiffSynth block is a commented-out alternative in `gradio_telestylev2_QIE2509_dmd_diffusers.py`, and this tool uses that block.
- The V2 Lightning file is not DiffSynth-prefixed. By default this tool uses the V1 repo's DiffSynth-format copy of the same Lightning-4steps-V1.0 weights. Set `QS_V2_LIGHTNING=native` on the pod to try the V2 file.
- The tool loads models with `ModelConfig(path=...)`. If DiffSynth @ 11315d7 rejects that form, set `QS_LOAD_MODE=modelid` (`local_model_path` + `skip_download`). `setup.log` prints the `ModelConfig` signature to help with this.
- The tool pins `transformers==4.57.3`, because the V2 authors say the version changes the output. Torch stays at the image's 2.8 (the authors tested 2.9.1).
- RunPod's maximum `dockerArgs` length has not been verified. Earlier pods used about 1.5 KB and this one uses about 10.2 KB.
