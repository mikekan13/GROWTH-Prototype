"""Content-preserving style transfer on Qwen-Image-Edit-2509 via DiffSynth-Studio @ 11315d7.

Runs ON the pod (imported by server.py). Two selectable models, both LoRAs on the same base:

  telestyle-v2 (DEFAULT)  Tele-AI/TeleStyleV2  (github.com/Tele-AI/TeleStyleV2, Apache-2.0)
      Copied from gradio_telestylev2_QIE2509_dmd_diffusers.py (repo main, pushed 2026-10-12):
        - DiffSynth model block (commented out in that file): transformer + text_encoder + vae +
          processor ALL from Qwen/Qwen-Image-Edit-2509, tokenizer_config=None.
        - prompt = 'Style Transfer the style of Figure 2 to Figure 1, and keep the content and
          characteristics of Figure 1.'   seed 123, steps 4, CFG 1.0, minedge 1024.
        - BOTH content and style keep their aspect ratio: min edge -> minedge (exact), long edge
          = int(minedge*r) - int(minedge*r) % 16.  image=[content, style].
        - Prompt enhancer (VLM-generated content/style words) is OFF by default in the demo; not used.
        - The demo itself runs diffusers + a patched QwenImageEditPlusPipeline; DiffSynth is the
          authors' commented-out alternative, used here because they ship a diffsynth-format LoRA.
  qwenstyle-v1  witcherderivia/Qwen-Image-Style-Transfer (arXiv 2601.06202) -- authors' script:
        transformer from Qwen-Image-Edit-2509, text_encoder + vae from Qwen/Qwen-Image, processor from
        Qwen/Qwen-Image-Edit; content min edge -> 1024 (x16), style squashed to 1024x1024.

Weights are pre-downloaded by pod_setup.sh into MODELS_DIR/<hf repo id>/... -- the same layout
DiffSynth uses for its own downloads -- so nothing is fetched at load time.
"""
import gc
import glob
import os

import torch
from PIL import Image

MODELS_DIR = os.environ.get("QS_MODELS_DIR", "/workspace/models")
DEFAULT_MODEL = "telestyle-v2"

PROMPT = ("Style Transfer the style of Figure 2 to Figure 1, "
          "and keep the content and characteristics of Figure 1.")

_V1_REPO = "witcherderivia/Qwen-Image-Style-Transfer"
_V2_REPO = "Tele-AI/TeleStyleV2"
QIE = "Qwen/Qwen-Image-Edit-2509"

MODELS = {
    "telestyle-v2": {
        "transformer": (QIE, "transformer/diffusion_pytorch_model*.safetensors"),
        "text_encoder": (QIE, "text_encoder/model*.safetensors"),
        "vae": (QIE, "vae/diffusion_pytorch_model.safetensors"),
        "processor": (QIE, "processor/"),
        "style_lora": (_V2_REPO, "diffsynth-TeleStyleV2-QIE-2509-Lora-bf16.safetensors"),
        # The V2 repo's Lightning file has no "diffsynth-" prefix (the demo loads it with diffusers'
        # load_lora_weights). The V1 repo ships the same Lightning-4steps-V1.0 weights converted to
        # DiffSynth format, so that is the default here. QS_V2_LIGHTNING=native uses the V2 file.
        "lightning": (_V1_REPO, "diffsynth_Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"),
        "lightning_native": (_V2_REPO, "QIE-2509-Lightning-4steps-V1.0-bf16.safetensors"),
        "style_resize": "min_edge",
    },
    "qwenstyle-v1": {
        "transformer": (QIE, "transformer/diffusion_pytorch_model*.safetensors"),
        "text_encoder": ("Qwen/Qwen-Image", "text_encoder/model*.safetensors"),
        "vae": ("Qwen/Qwen-Image", "vae/diffusion_pytorch_model.safetensors"),
        "processor": ("Qwen/Qwen-Image-Edit", "processor/"),
        "style_lora": (_V1_REPO, "diffsynth_Qwen-Image-Edit-2509-Style-Transfer-V1.safetensors"),
        "lightning": (_V1_REPO, "diffsynth_Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"),
        "style_resize": "square1024",
    },
}


def _local(repo, pattern):
    hits = sorted(glob.glob(os.path.join(MODELS_DIR, repo, pattern)))
    if not hits:
        raise FileNotFoundError(f"no weights match {repo}/{pattern} under {MODELS_DIR}")
    return hits if len(hits) > 1 else hits[0]


def load_pipeline(model=DEFAULT_MODEL, lora_scale=1.0):
    """DiffSynth fuses LoRAs into the DiT at load, so a different model or scale needs a full reload."""
    from diffsynth.pipelines.qwen_image import QwenImagePipeline, ModelConfig

    spec = MODELS[model]
    mode = os.environ.get("QS_LOAD_MODE", "path")
    if mode == "path":
        # Explicit local files -- no hub access at all.
        model_configs = [ModelConfig(path=_local(*spec[k])) for k in ("transformer", "text_encoder", "vae")]
        processor_config = ModelConfig(path=os.path.join(MODELS_DIR, *spec["processor"]))
    else:
        # Fallback: the authors' model_id form, pointed at the pre-downloaded tree.
        kw = dict(local_model_path=MODELS_DIR, skip_download=True)
        model_configs = [ModelConfig(model_id=spec[k][0], origin_file_pattern=spec[k][1], **kw)
                         for k in ("transformer", "text_encoder", "vae")]
        processor_config = ModelConfig(model_id=spec["processor"][0],
                                       origin_file_pattern=spec["processor"][1], **kw)

    pipe = QwenImagePipeline.from_pretrained(
        torch_dtype=torch.bfloat16,
        device="cuda",
        model_configs=model_configs,
        tokenizer_config=None,
        processor_config=processor_config,
    )
    lightning = spec["lightning"]
    if model == "telestyle-v2" and os.environ.get("QS_V2_LIGHTNING") == "native":
        lightning = spec["lightning_native"]
    pipe.load_lora(pipe.dit, _local(*spec["style_lora"]), alpha=lora_scale)  # style LoRA only
    pipe.load_lora(pipe.dit, _local(*lightning))
    return pipe


def free_cuda():
    """Call AFTER the caller has dropped every reference to the pipeline."""
    gc.collect()
    torch.cuda.empty_cache()
    torch.cuda.ipc_collect()


def resize_v1_min_edge(img, min_edge=1024):
    """QwenStyle V1: shortest edge -> min_edge, both sides rounded to multiples of 16."""
    w, h = img.size
    s = min_edge / min(w, h)
    return img.resize((max(16, int(round(w * s / 16)) * 16), max(16, int(round(h * s / 16)) * 16)),
                      Image.LANCZOS)


def resize_v2_min_edge(img, minedge=1024):
    """TeleStyle V2 demo, verbatim arithmetic: min edge = minedge, long edge floored to x16.
    (PIL default resample, as in the demo's .resize((w, h)).)"""
    w, h = img.size
    if w > h:
        r = w / h
        h = minedge
        w = int(h * r) - int(h * r) % 16
    else:
        r = h / w
        w = minedge
        h = int(w * r) - int(w * r) % 16
    return img.resize((w, h))


def load_rgb(path):
    img = Image.open(path)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, img)
    return img.convert("RGB")


def transfer(pipe, model, content_path, style_path, min_edge=1024, seed=123, steps=4):
    if model == "telestyle-v2":
        content = resize_v2_min_edge(load_rgb(content_path), min_edge)
        style = resize_v2_min_edge(load_rgb(style_path), min_edge)
    else:
        content = resize_v1_min_edge(load_rgb(content_path), min_edge)
        style = load_rgb(style_path).resize((1024, 1024), Image.LANCZOS)
    w, h = content.size
    return pipe(
        PROMPT,
        edit_image=[content, style],
        seed=seed,
        num_inference_steps=steps,
        height=h,
        width=w,
        edit_image_auto_resize=False,
        cfg_scale=1.0,
    )
