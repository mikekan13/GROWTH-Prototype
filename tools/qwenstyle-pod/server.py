"""Job server ON the pod (port 8001). Token-guarded via header X-Token == $QS_TOKEN.

  GET  /status            pipeline state, loaded model, GPU, uploaded inputs, current job
  POST /upload            multipart: kind=style|content, files=...  -> saved to /workspace/inputs/<kind>/
  POST /transfer          json {model, style, ids[], min_edge, seed, steps} -> {job_id}  (runs in background;
                          RunPod's proxy cuts requests at ~100 s, so the client polls /job/<id>)
  GET  /job/{job_id}      progress + output names (paths relative to /workspace/out)
  GET  /list              every output file (relative paths), optional ?prefix=<model>/<style>
  GET  /download/{name}   one output file, name = relative path from /job or /list
  GET  /log/{name}        setup.log | download.log | server.log (tail, ?lines=N)

This is the ONLY exposed port; every endpoint requires the token. server.py is started early by
pod_setup.sh (before the weights land) so setup progress is visible; the pipeline load waits for
/workspace/READY. Outputs: /workspace/out/<model>/<style>/<id>.png.
The pipeline is loaded once and kept; a job asking for the other model triggers a reload (~2-4 min).
"""
import os
import re
import threading
import time
import traceback
import uuid
from typing import List, Optional

import uvicorn
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

import transfer_core as tc

TOKEN = os.environ.get("QS_TOKEN", "")
ROOT = "/workspace"
INPUTS = os.path.join(ROOT, "inputs")
OUT = os.path.join(ROOT, "out")
LOGS = os.path.join(ROOT, "logs")
READY = os.path.join(ROOT, "READY")
SAFE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

app = FastAPI()
state = {"pipeline": "idle", "model": None, "error": None, "loaded_at": None}
jobs = {}
_pipe = None
_lock = threading.Lock()  # one GPU job (or load) at a time


def auth(x_token: str = Header(default="")):
    if not TOKEN or x_token != TOKEN:
        raise HTTPException(401, "bad token")


def _unload():
    """Drop the ONLY reference to the pipeline, then free VRAM (no local aliases may survive)."""
    global _pipe
    if _pipe is not None:
        _pipe = None
        state.update(pipeline="unloaded", model=None, lora_scale=None)
    tc.free_cuda()


def _load(model, lora_scale=1.0):
    """Pipeline cache key = (model, lora_scale). Same key -> no-op; else full unload + reload."""
    global _pipe
    if _pipe is not None and state.get("model") == model and state.get("lora_scale") == lora_scale:
        return
    _unload()
    state.update(pipeline="loading", model=model, lora_scale=lora_scale, error=None)
    try:
        t = time.time()
        _pipe = tc.load_pipeline(model, lora_scale=lora_scale)
        state.update(pipeline="ready", loaded_at=time.time(), load_seconds=round(time.time() - t, 1))
    except Exception as e:  # noqa: BLE001
        state.update(pipeline="error", model=None, lora_scale=None,
                     error=f"{e}\n{traceback.format_exc()[-3000:]}")
        _pipe = None
        tc.free_cuda()
        raise


@app.on_event("startup")
def _startup():
    for k in ("style", "content"):
        os.makedirs(os.path.join(INPUTS, k), exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    def boot():
        state["pipeline"] = "waiting for weights"
        while not os.path.exists(READY):
            time.sleep(5)
        with _lock:
            try:
                _load(os.environ.get("QS_DEFAULT_MODEL", tc.DEFAULT_MODEL))
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=boot, daemon=True).start()


@app.get("/status", dependencies=[Depends(auth)])
def status():
    gpu = None
    try:
        import torch
        gpu = {"name": torch.cuda.get_device_name(0),
               "mem_alloc_gb": round(torch.cuda.memory_allocated(0) / 2**30, 1),
               "mem_total_gb": round(torch.cuda.get_device_properties(0).total_memory / 2**30, 1)}
    except Exception:  # noqa: BLE001
        pass
    return {**state, "gpu": gpu, "ready": os.path.exists(READY),
            "inputs": {k: sorted(os.listdir(os.path.join(INPUTS, k))) for k in ("style", "content")},
            "jobs": {j: {kk: v[kk] for kk in ("status", "done", "total")} for j, v in jobs.items()}}


@app.post("/upload", dependencies=[Depends(auth)])
async def upload(kind: str = Form(...), files: List[UploadFile] = File(...)):
    if kind not in ("style", "content"):
        raise HTTPException(400, "kind must be style|content")
    saved = []
    for f in files:
        name = os.path.basename(f.filename or "")
        if not SAFE.match(name):
            raise HTTPException(400, f"bad filename {name!r}")
        with open(os.path.join(INPUTS, kind, name), "wb") as out:
            out.write(await f.read())
        saved.append(name)
    return {"saved": saved}


class TransferReq(BaseModel):
    model: str = tc.DEFAULT_MODEL
    style: str                      # filename in inputs/style (e.g. gold.png)
    ids: Optional[List[str]] = None  # content stems; None = every uploaded content image
    min_edge: int = 1024
    seed: int = 123
    steps: int = 4
    lora_scale: float = 1.0          # style LoRA alpha (Lightning stays 1.0)
    overwrite: bool = False


def out_subdir(req):
    """<model>/<style>[__ls<scale>][__seed<n>] -- defaults keep the plain <model>/<style> path."""
    tag = os.path.splitext(req.style)[0]
    if req.lora_scale != 1.0:
        tag += f"__ls{req.lora_scale:g}"
    if req.seed != 123:
        tag += f"__seed{req.seed}"
    if req.min_edge != 1024:
        tag += f"__me{req.min_edge}"
    return f"{req.model}/{tag}"


def _run(job_id, req: TransferReq, items):
    job = jobs[job_id]
    with _lock:
        try:
            if _pipe is None or state.get("model") != req.model or state.get("lora_scale") != req.lora_scale:
                job["status"] = f"loading {req.model} @ lora_scale {req.lora_scale}"
                _load(req.model, req.lora_scale)
            job["status"] = "running"
            style_path = os.path.join(INPUTS, "style", req.style)
            out_dir = os.path.join(OUT, *out_subdir(req).split("/"))
            os.makedirs(out_dir, exist_ok=True)
            for stem, src in items:
                dst = os.path.join(out_dir, stem + ".png")
                rel = os.path.relpath(dst, OUT).replace(os.sep, "/")
                if os.path.exists(dst) and not req.overwrite:
                    job["outputs"].append(rel)
                else:
                    t = time.time()
                    try:
                        img = tc.transfer(_pipe, req.model, src, style_path,
                                          min_edge=req.min_edge, seed=req.seed, steps=req.steps)
                        img.save(dst)
                        job["outputs"].append(rel)
                        job["seconds"].append(round(time.time() - t, 2))
                    except Exception as e:  # noqa: BLE001  (e.g. OOM on one image: record, continue)
                        job["errors"].append({"id": stem, "error": str(e)[:500]})
                        try:
                            import torch
                            torch.cuda.empty_cache()
                        except Exception:  # noqa: BLE001
                            pass
                job["done"] += 1
            job["status"] = "done"
        except Exception as e:  # noqa: BLE001
            job["status"] = "error"
            job["errors"].append({"id": None, "error": f"{e}\n{traceback.format_exc()[-2000:]}"})


@app.post("/transfer", dependencies=[Depends(auth)])
def transfer(req: TransferReq):
    if req.model not in tc.MODELS:
        raise HTTPException(400, f"model must be one of {list(tc.MODELS)}")
    if not SAFE.match(req.style) or not os.path.exists(os.path.join(INPUTS, "style", req.style)):
        raise HTTPException(400, f"style {req.style!r} not uploaded")
    if req.min_edge % 16:
        raise HTTPException(400, "min_edge must be a multiple of 16")
    if not 0.0 <= req.lora_scale <= 2.0:
        raise HTTPException(400, "lora_scale must be within 0..2")
    cdir = os.path.join(INPUTS, "content")
    avail = {os.path.splitext(n)[0]: os.path.join(cdir, n) for n in sorted(os.listdir(cdir))}
    stems = req.ids or sorted(avail)
    missing = [s for s in stems if s not in avail]
    if missing:
        raise HTTPException(400, f"content not uploaded: {missing[:20]}")
    job_id = uuid.uuid4().hex[:10]
    jobs[job_id] = {"status": "queued", "done": 0, "total": len(stems), "outputs": [], "errors": [],
                    "seconds": [], "model": req.model, "style": req.style, "created": time.time()}
    threading.Thread(target=_run, args=(job_id, req, [(s, avail[s]) for s in stems]), daemon=True).start()
    return {"job_id": job_id, "total": len(stems), "out_subdir": out_subdir(req)}


@app.get("/job/{job_id}", dependencies=[Depends(auth)])
def job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "no such job")
    return jobs[job_id]


@app.post("/restart", dependencies=[Depends(auth)])
def restart():
    """Hard-exit this process (frees all VRAM); pod_setup.sh's loop restarts it in ~5 s and the
    new process reloads QS_DEFAULT_MODEL @ 1.0. Running jobs are lost; finished outputs stay on disk."""
    threading.Thread(target=lambda: (time.sleep(1), os._exit(3)), daemon=True).start()
    return {"restarting": True, "running_jobs": [j for j, v in jobs.items()
                                                 if v["status"] not in ("done", "error")]}


def _safe_out_path(name):
    p = os.path.realpath(os.path.join(OUT, name))
    if not p.startswith(os.path.realpath(OUT) + os.sep) or not os.path.isfile(p):
        raise HTTPException(404, "no such output")
    return p


@app.get("/list", dependencies=[Depends(auth)])
def list_outputs(prefix: str = ""):
    files = []
    for d, _, names in os.walk(OUT):
        for n in names:
            rel = os.path.relpath(os.path.join(d, n), OUT).replace(os.sep, "/")
            if rel.startswith(prefix):
                files.append(rel)
    return {"files": sorted(files)}


@app.get("/download/{name:path}", dependencies=[Depends(auth)])
def download(name: str):
    return FileResponse(_safe_out_path(name), media_type="image/png")


@app.get("/log/{name}", dependencies=[Depends(auth)])
def log(name: str, lines: int = 40):
    if name not in ("setup.log", "download.log", "server.log"):
        raise HTTPException(404, "no such log")
    p = os.path.join(LOGS, name)
    if not os.path.exists(p):
        return PlainTextResponse("")
    with open(p, encoding="utf-8", errors="replace") as f:
        return PlainTextResponse("".join(f.readlines()[-max(1, min(lines, 2000)):]))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
