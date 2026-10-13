"""Local driver for the temporary QwenStyle / TeleStyle V2 RunPod pod.  See README.md.

  python run.py up [--gpu h100|pro6000] [--max-minutes 90] [--dry-run]
  python run.py push [--content-dir DIR] [--force]
  python run.py transfer [--model telestyle-v2|qwenstyle-v1] --style gold|headless [--ids a b ...]
                         [--min-edge 1024] [--seed 123]
  python run.py status | logs [setup.log|download.log|server.log] | list
  python run.py down
  python run.py watch          # blocks; terminates the pod at the --max-minutes deadline

Every command first enforces the deadline: past --max-minutes, it terminates the pod instead.
The pod also self-terminates at the same deadline (pod_setup.sh), as a backstop.
"""
import argparse
import base64
import io
import json
import os
import re
import secrets
import sys
import tarfile
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
STYLE_REFS = os.path.join(REPO, "style-refs")
CONTENT_DIR = os.path.join(STYLE_REFS, "corpus", "content")
STYLED_DIR = os.path.join(STYLE_REFS, "corpus", "styled")
STYLES = {
    "gold": os.path.join(STYLE_REFS, "STYLE-ANCHOR-2026-10-13-sheet6-seed8.png"),
    "headless": os.path.join(STYLE_REFS, "anchor-variants", "anchor-headless-desaturated.png"),
}
STATE = os.path.join(HERE, ".state.json")
ENV_FILE = os.path.join(REPO, "app", ".env.local")
POD_FILES = ["pod_setup.sh", "server.py", "transfer_core.py"]
GPUS = {
    "h100": ("NVIDIA H100 80GB HBM3", 2.69),
    "pro6000": ("NVIDIA RTX PRO 6000 Blackwell Server Edition", 2.49),
}
IMAGE = "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404"
MODEL_CHOICES = ["telestyle-v2", "qwenstyle-v1"]


# ---------------------------------------------------------------- plumbing
def api_key():
    txt = open(ENV_FILE, encoding="utf-8", errors="ignore").read()
    m = re.search(r"^\s*RUNPOD_API_KEY\s*=\s*(\S+)", txt, re.M)
    if not m:
        sys.exit("RUNPOD_API_KEY not found in app/.env.local")
    return m.group(1).strip("\"'")


def gql(query, variables=None):
    r = requests.post("https://api.runpod.io/graphql", params={"api_key": api_key()},
                      json={"query": query, "variables": variables or {}}, timeout=60)
    out = r.json()
    if out.get("errors"):
        print("GraphQL errors:", json.dumps(out["errors"])[:1500])
    return out


def load_state():
    if not os.path.exists(STATE):
        sys.exit("no pod recorded (.state.json missing) -- run `up` first")
    return json.load(open(STATE))


def save_state(st):
    json.dump(st, open(STATE, "w"), indent=2)


def elapsed_min(st):
    return (time.time() - st["start"]) / 60


def cost_line(st):
    m = elapsed_min(st)
    return f"pod {st['podId']} up {m:.1f} min, est ${m / 60 * st['costPerHr']:.2f} (cap {st['maxMinutes']} min)"


def url(st, port, path=""):
    return f"https://{st['podId']}-{port}.proxy.runpod.net{path}"


def H(st):
    return {"X-Token": st["token"]}


def enforce_deadline(st):
    if elapsed_min(st) >= st["maxMinutes"]:
        print(f"!! past the {st['maxMinutes']}-minute cap -- terminating now")
        do_down(st)
        sys.exit(2)


def pod_tarball_b64():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in POD_FILES:
            data = open(os.path.join(HERE, name), "rb").read().replace(b"\r\n", b"\n")
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            ti.mode = 0o755
            tar.addfile(ti, io.BytesIO(data))
    return base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- up
def cmd_up(a):
    if os.path.exists(STATE) and not a.dry_run:
        sys.exit(f".state.json exists (pod {json.load(open(STATE))['podId']}) -- run `down` first")
    gpu_id, price = GPUS[a.gpu]
    token = secrets.token_urlsafe(24)
    b64 = pod_tarball_b64()
    docker_args = (f"bash -c 'mkdir -p /workspace/qs && echo {b64} | base64 -d | tar -xz -C /workspace/qs"
                   f" && bash /workspace/qs/pod_setup.sh'")
    env = {"QS_TOKEN": token, "QS_MAX_MINUTES": str(a.max_minutes),
           "QS_MODELS": ",".join(a.models), "QS_DEFAULT_MODEL": a.models[0]}
    env_gql = ",".join(f"{{key:{json.dumps(k)},value:{json.dumps(v)}}}" for k, v in env.items())
    dc = f"dataCenterId:{json.dumps(a.datacenter)}," if a.datacenter else ""
    mutation = (
        "mutation{podFindAndDeployOnDemand(input:{"
        f"cloudType:{a.cloud},gpuCount:1,gpuTypeId:{json.dumps(gpu_id)},{dc}"
        f"name:\"qwenstyle-transfer\",imageName:{json.dumps(a.image)},"
        f"containerDiskInGb:40,volumeInGb:{a.volume_gb},volumeMountPath:\"/workspace\","
        "minVcpuCount:8,minMemoryInGb:64,"
        "ports:\"8001/http\","
        f"env:[{env_gql}],dockerArgs:{json.dumps(docker_args)}"
        "}){id costPerHr machineId desiredStatus imageName}}"
    )
    if a.dry_run:
        shown = mutation.replace(token, "<TOKEN>").replace(b64, f"<{len(b64)} b64 chars>")
        print(shown)
        print(f"\ndockerArgs length: {len(docker_args)} chars (tarball of {', '.join(POD_FILES)})")
        print(f"GPU {gpu_id} @ ~${price}/h, cap {a.max_minutes} min -> worst case ${price * a.max_minutes / 60:.2f}")
        return
    r = gql(mutation)
    pod = ((r.get("data") or {}).get("podFindAndDeployOnDemand")) or None
    if not pod:
        sys.exit(f"deploy failed: {json.dumps(r)[:800]}")
    st = {"podId": pod["id"], "start": time.time(), "costPerHr": float(pod.get("costPerHr") or price),
          "maxMinutes": a.max_minutes, "token": token, "gpu": gpu_id, "models": a.models}
    save_state(st)
    print(f"deployed {st['podId']} on {gpu_id} @ ${st['costPerHr']}/h; api: {url(st, 8001, '/status')}")
    print("waiting for READY (pip + ~75 GB weights; typically 10-25 min) ...")
    last_log = 0
    while True:
        enforce_deadline(st)
        try:
            if requests.get(url(st, 8001, "/status"), headers=H(st), timeout=20).json().get("ready"):
                break
        except (requests.RequestException, ValueError):
            pass
        if time.time() - last_log > 120:
            last_log = time.time()
            try:
                tail = requests.get(url(st, 8001, "/log/setup.log?lines=4"), headers=H(st), timeout=20)
                print("  | " + "\n  | ".join(tail.text.strip().splitlines()) if tail.ok else "  (server not up yet)")
            except requests.RequestException:
                print("  (proxy not up yet)")
            print("  " + cost_line(st))
        time.sleep(20)
    print("READY -- waiting for the pipeline to load ...")
    while True:
        enforce_deadline(st)
        try:
            s = requests.get(url(st, 8001, "/status"), headers=H(st), timeout=20).json()
            if s.get("pipeline") == "ready":
                print(f"pipeline ready: {s.get('model')} on {s.get('gpu')} (load {s.get('load_seconds')} s)")
                break
            if s.get("pipeline") == "error":
                print("PIPELINE LOAD ERROR:\n" + (s.get("error") or "")[-2500:])
                print("pod is still billing -- fix or run `python run.py down`")
                return
        except (requests.RequestException, ValueError):
            pass
        time.sleep(15)
    print(cost_line(st))
    print("next: python run.py push   |   logs: python run.py logs [setup.log|download.log|server.log]")


# ---------------------------------------------------------------- push
def _upload(st, kind, paths, names=None):
    names = names or [os.path.basename(p) for p in paths]
    files = [("files", (n, open(p, "rb"), "image/png")) for p, n in zip(paths, names)]
    try:
        r = requests.post(url(st, 8001, "/upload"), headers=H(st), data={"kind": kind},
                          files=files, timeout=90)
    finally:
        for _, (_, fh, _) in files:
            fh.close()
    r.raise_for_status()
    return r.json()["saved"]


def cmd_push(a):
    st = load_state()
    enforce_deadline(st)
    s = requests.get(url(st, 8001, "/status"), headers=H(st), timeout=30).json()
    have = set(s["inputs"]["content"])
    for tag, p in STYLES.items():
        if not os.path.exists(p):
            print(f"!! missing style ref {p}")
            continue
        print("style", tag, _upload(st, "style", [p], [f"{tag}.png"]))
    content = sorted(f for f in os.listdir(a.content_dir) if f.lower().endswith(".png"))
    todo = [f for f in content if a.force or f not in have]
    print(f"content: {len(content)} local, {len(content) - len(todo)} already on pod, uploading {len(todo)}")
    for i in range(0, len(todo), 8):
        batch = todo[i:i + 8]
        _upload(st, "content", [os.path.join(a.content_dir, f) for f in batch])
        print(f"  {min(i + 8, len(todo))}/{len(todo)}")
    print(cost_line(st))


# ---------------------------------------------------------------- transfer
def contact_sheets(out_dir, pairs, style_path, label):
    from PIL import Image, ImageDraw
    T, PAD, COLS, ROWS = 320, 12, 3, 5          # 3 before/after pairs per row, 15 pairs per page
    per = COLS * ROWS
    style = Image.open(style_path).convert("RGB")
    style.thumbnail((T, T))
    written = []
    for page in range(0, len(pairs), per):
        chunk = pairs[page:page + per]
        rows = (len(chunk) + COLS - 1) // COLS
        W = COLS * (2 * T + 3 * PAD) + PAD
        Hh = (T + 40) + rows * (T + 28) + PAD
        sheet = Image.new("RGB", (W, Hh), (203, 217, 232))
        d = ImageDraw.Draw(sheet)
        sheet.paste(style, (PAD, PAD))
        d.text((T + 2 * PAD, PAD), f"{label}\nstyle ref (left)  |  each pair: content -> styled", fill=(0, 0, 0))
        for i, (stem, src, dst) in enumerate(chunk):
            r, c = divmod(i, COLS)
            x = PAD + c * (2 * T + 3 * PAD)
            y = T + 40 + r * (T + 28)
            for j, p in enumerate((src, dst)):
                im = Image.open(p).convert("RGB")
                im.thumbnail((T, T))
                sheet.paste(im, (x + j * (T + PAD), y))
            d.text((x, y + T + 4), stem, fill=(0, 0, 0))
        name = os.path.join(out_dir, f"_contact_{page // per + 1:02d}.png")
        sheet.save(name)
        written.append(name)
    return written


def cmd_transfer(a):
    st = load_state()
    enforce_deadline(st)
    ids = a.ids or sorted(os.path.splitext(f)[0] for f in os.listdir(a.content_dir) if f.lower().endswith(".png"))
    body = {"model": a.model, "style": f"{a.style}.png", "ids": ids, "min_edge": a.min_edge,
            "seed": a.seed, "steps": 4, "overwrite": a.overwrite}
    r = requests.post(url(st, 8001, "/transfer"), headers=H(st), json=body, timeout=60)
    if r.status_code != 200:
        sys.exit(f"transfer rejected {r.status_code}: {r.text[:800]}")
    job_id = r.json()["job_id"]
    out_dir = os.path.join(STYLED_DIR, a.model, a.style)
    os.makedirs(out_dir, exist_ok=True)
    print(f"job {job_id}: {len(ids)} images, {a.model}, style={a.style}, min_edge={a.min_edge} -> {out_dir}")
    got = set()
    while True:
        enforce_deadline(st)
        try:
            j = requests.get(url(st, 8001, f"/job/{job_id}"), headers=H(st), timeout=30).json()
        except (requests.RequestException, ValueError) as e:
            print("  poll error", e)
            time.sleep(10)
            continue
        for rel in j["outputs"]:
            if rel in got:
                continue
            x = requests.get(url(st, 8001, "/download/" + rel), headers=H(st), timeout=120)
            if x.status_code == 200:
                open(os.path.join(out_dir, os.path.basename(rel)), "wb").write(x.content)
                got.add(rel)
        secs = j.get("seconds") or [0]
        print(f"  {j['status']}: {j['done']}/{j['total']} done, {len(got)} downloaded, "
              f"{len(j['errors'])} errors, ~{sum(secs) / len(secs):.1f} s/img | {cost_line(st)}")
        if j["status"] in ("done", "error") and len(got) >= len(j["outputs"]):
            break
        time.sleep(10)
    for e in j["errors"]:
        print("  ERROR", e["id"], e["error"][:300])
    pairs = []
    for stem in ids:
        dst = os.path.join(out_dir, stem + ".png")
        src = os.path.join(a.content_dir, stem + ".png")
        if os.path.exists(dst) and os.path.exists(src):
            pairs.append((stem, src, dst))
    if pairs:
        for p in contact_sheets(out_dir, pairs, STYLES[a.style], f"{a.model} / {a.style} / min_edge {a.min_edge}"):
            print("contact sheet:", p)
    json.dump({"job": job_id, "request": body, "errors": j["errors"], "seconds": j.get("seconds")},
              open(os.path.join(out_dir, "_run.json"), "w"), indent=2)
    print(cost_line(st))


# ---------------------------------------------------------------- status / down / watch
def cmd_status(a):
    st = load_state()
    print(cost_line(st))
    print(json.dumps(gql("query($p:String!){pod(input:{podId:$p}){id desiredStatus runtime{uptimeInSeconds}}}",
                         {"p": st["podId"]}).get("data")))
    try:
        s = requests.get(url(st, 8001, "/status"), headers=H(st), timeout=20).json()
        s["inputs"] = {k: len(v) for k, v in s.get("inputs", {}).items()}
        if not s.get("error"):
            s.pop("error", None)
        print(json.dumps(s, indent=1)[:2500])
    except (requests.RequestException, ValueError) as e:
        print("server not reachable:", e)
    enforce_deadline(st)


def cmd_logs(a):
    st = load_state()
    r = requests.get(url(st, 8001, f"/log/{a.name}?lines={a.lines}"), headers=H(st), timeout=30)
    print(r.text if r.ok else f"{r.status_code} {r.text[:300]}")
    enforce_deadline(st)


def cmd_list(a):
    st = load_state()
    r = requests.get(url(st, 8001, "/list"), headers=H(st), params={"prefix": a.prefix}, timeout=30)
    print("\n".join(r.json()["files"]) if r.ok else f"{r.status_code} {r.text[:300]}")
    enforce_deadline(st)


def do_down(st):
    pid = st["podId"]
    print(cost_line(st))
    print("terminate:", json.dumps(gql("mutation($p:String!){podTerminate(input:{podId:$p})}", {"p": pid})))
    for _ in range(6):
        time.sleep(5)
        v = gql("query($p:String!){pod(input:{podId:$p}){id desiredStatus}}", {"p": pid})
        if not (v.get("data") or {}).get("pod"):
            break
        print("  still listed:", v["data"]["pod"])
    pods = (gql("{myself{pods{id desiredStatus} currentSpendPerHr}}").get("data") or {}).get("myself") or {}
    print("account pods now:", pods.get("pods"), "| spend/hr:", pods.get("currentSpendPerHr"))
    if any(p["id"] == pid for p in pods.get("pods") or []):
        print(f"!! {pid} STILL EXISTS -- terminate it in the RunPod console")
        return False
    os.replace(STATE, STATE.replace(".json", f".{pid}.done.json"))
    print(f"{pid} terminated and verified gone.")
    return True


def cmd_down(a):
    do_down(load_state())


def cmd_watch(a):
    st = load_state()
    while True:
        left = st["maxMinutes"] - elapsed_min(st)
        if left <= 0:
            enforce_deadline(st)
        print(f"{left:.1f} min until auto-terminate | {cost_line(st)}", flush=True)
        time.sleep(min(60, max(5, left * 60)))
        if not os.path.exists(STATE):
            print("pod already downed")
            return


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    u = sub.add_parser("up")
    u.add_argument("--gpu", choices=list(GPUS), default="h100")
    u.add_argument("--max-minutes", type=int, default=90)
    u.add_argument("--cloud", choices=["SECURE", "COMMUNITY"], default="SECURE")
    u.add_argument("--datacenter", default=None, help="e.g. US-NE-1 (default: any)")
    u.add_argument("--image", default=IMAGE)
    u.add_argument("--volume-gb", type=int, default=150)
    u.add_argument("--models", nargs="+", choices=MODEL_CHOICES, default=MODEL_CHOICES,
                   help="weight sets to download; first one is loaded at boot")
    u.add_argument("--dry-run", action="store_true")
    u.set_defaults(fn=cmd_up)
    pu = sub.add_parser("push")
    pu.add_argument("--content-dir", default=CONTENT_DIR)
    pu.add_argument("--force", action="store_true")
    pu.set_defaults(fn=cmd_push)
    t = sub.add_parser("transfer")
    t.add_argument("--model", choices=MODEL_CHOICES, default="telestyle-v2")
    t.add_argument("--style", choices=list(STYLES), default="gold")
    t.add_argument("--ids", nargs="*")
    t.add_argument("--min-edge", type=int, default=1024)
    t.add_argument("--seed", type=int, default=123)
    t.add_argument("--overwrite", action="store_true")
    t.add_argument("--content-dir", default=CONTENT_DIR)
    t.set_defaults(fn=cmd_transfer)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    lg = sub.add_parser("logs")
    lg.add_argument("name", nargs="?", default="setup.log", choices=["setup.log", "download.log", "server.log"])
    lg.add_argument("--lines", type=int, default=60)
    lg.set_defaults(fn=cmd_logs)
    ls = sub.add_parser("list")
    ls.add_argument("--prefix", default="")
    ls.set_defaults(fn=cmd_list)
    sub.add_parser("down").set_defaults(fn=cmd_down)
    sub.add_parser("watch").set_defaults(fn=cmd_watch)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
