"""Face-parsing helper using ONNX-exported Segformer (jonathandinu/face-parsing).

Labels (19 classes, matching CelebAMask-HQ):
    0 background   1 skin       2 nose       3 eyeglasses
    4 l_eye        5 r_eye      6 l_brow     7 r_brow
    8 l_ear        9 r_ear     10 mouth     11 u_lip
    12 l_lip      13 hair      14 hat       15 earring
    16 necklace   17 neck      18 clothing

Usage:
    py face_parse.py <image_path> --out-dir <dir> [--region eyes|mouth|hair|...]

Outputs per-label PNG masks (8-bit, 0/255) into --out-dir.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

# --- Constants ---
REPO = "jonathandinu/face-parsing"
ONNX_FILE = "onnx/model.onnx"
CACHE_DIR = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))

LABELS = [
    "background", "skin", "nose", "eyeglasses",
    "l_eye", "r_eye", "l_brow", "r_brow",
    "l_ear", "r_ear", "mouth", "u_lip",
    "l_lip", "hair", "hat", "earring",
    "necklace", "neck", "clothing",
]
NUM_LABELS = len(LABELS)

# Region compositions for inpainting presets
REGIONS: dict[str, list[str]] = {
    "eyes": ["l_eye", "r_eye"],
    "eyes_brows": ["l_eye", "r_eye", "l_brow", "r_brow"],
    "mouth": ["mouth", "u_lip", "l_lip"],
    "nose": ["nose"],
    "hair": ["hair"],
    "face_no_hair": ["skin", "nose", "l_eye", "r_eye", "l_brow", "r_brow", "mouth", "u_lip", "l_lip"],
    "head_with_hair": ["skin", "nose", "l_eye", "r_eye", "l_brow", "r_brow", "mouth", "u_lip", "l_lip", "hair"],
    "accessories": ["eyeglasses", "hat", "earring", "necklace"],
    "clothing": ["clothing"],
}

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)
MODEL_SIZE = 512  # segformer-b5 canonical input


def ensure_model() -> Path:
    from huggingface_hub import hf_hub_download
    path = hf_hub_download(repo_id=REPO, filename=ONNX_FILE, cache_dir=str(CACHE_DIR))
    return Path(path)


def preprocess(img: Image.Image) -> tuple[np.ndarray, tuple[int, int]]:
    w, h = img.size
    resized = img.convert("RGB").resize((MODEL_SIZE, MODEL_SIZE), Image.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) / 255.0  # HWC
    arr = np.transpose(arr, (2, 0, 1))[None, ...]  # 1xCxHxW
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return arr.astype(np.float32), (h, w)


def run_segmentation(session: ort.InferenceSession, img: Image.Image) -> np.ndarray:
    inp, (h, w) = preprocess(img)
    logits = session.run(None, {session.get_inputs()[0].name: inp})[0]  # 1 x C x h' x w'
    # Upsample argmax to original image size with nearest neighbour
    pred = np.argmax(logits[0], axis=0).astype(np.uint8)  # h' x w'
    pred_img = Image.fromarray(pred, mode="L").resize((w, h), Image.NEAREST)
    return np.asarray(pred_img, dtype=np.uint8)


def masks_for_labels(pred: np.ndarray, labels: list[str], feather: int = 0) -> np.ndarray:
    ids = [LABELS.index(lbl) for lbl in labels]
    mask = np.isin(pred, ids).astype(np.uint8) * 255
    if feather > 0:
        from PIL import ImageFilter
        mask = np.asarray(Image.fromarray(mask, mode="L").filter(ImageFilter.GaussianBlur(radius=feather)), dtype=np.uint8)
    return mask


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("image", type=Path)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--region", action="append", default=[], help="Named region preset (may be repeated). If omitted, writes all labels.")
    ap.add_argument("--feather", type=int, default=0, help="Gaussian blur radius on mask edges.")
    ap.add_argument("--provider", default="CPUExecutionProvider", help="ONNX provider: CPUExecutionProvider | CUDAExecutionProvider")
    args = ap.parse_args()

    if not args.image.exists():
        print(f"ERR: image not found: {args.image}", file=sys.stderr)
        return 2

    args.out_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    model_path = ensure_model()
    session = ort.InferenceSession(str(model_path), providers=[args.provider, "CPUExecutionProvider"])
    t_load = time.perf_counter() - t0

    img = Image.open(args.image)
    t1 = time.perf_counter()
    pred = run_segmentation(session, img)
    t_seg = time.perf_counter() - t1

    out: dict[str, str] = {}
    if args.region:
        for r in args.region:
            if r not in REGIONS:
                print(f"ERR: unknown region '{r}'. Known: {sorted(REGIONS)}", file=sys.stderr)
                return 2
            mask = masks_for_labels(pred, REGIONS[r], feather=args.feather)
            out_path = args.out_dir / f"mask_{r}.png"
            Image.fromarray(mask, mode="L").save(out_path)
            out[r] = str(out_path)
    else:
        for i, lbl in enumerate(LABELS):
            mask = np.where(pred == i, 255, 0).astype(np.uint8)
            out_path = args.out_dir / f"mask_{i:02d}_{lbl}.png"
            Image.fromarray(mask, mode="L").save(out_path)
            out[lbl] = str(out_path)

    # Save composite: label image (colorized) for debugging
    debug_path = args.out_dir / "segmap.png"
    Image.fromarray(pred, mode="L").save(debug_path)

    result = {
        "image": str(args.image),
        "provider": session.get_providers()[0],
        "load_s": round(t_load, 2),
        "segment_s": round(t_seg, 2),
        "masks": out,
        "segmap": str(debug_path),
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
