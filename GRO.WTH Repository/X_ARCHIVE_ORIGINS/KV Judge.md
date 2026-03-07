# Goal

Stand up a local **evolution loop** where the agent proposes safe edits to item specs (your “GM knobs”), your **KV core** computes the **canonical KV** deterministically, and OpenEvolve handles orchestration, checkpoints, and visualization. OpenEvolve speaks **OpenAI-compatible** APIs, so you can point it to OpenAI/Anthropic _or_ a local Ollama/vLLM server when you want. [GitHub](https://github.com/codelion/openevolve)

---

# Pre-reqs (Claude sets these up)

- **Python 3.10+**, **git**, virtualenv.
    
- One LLM endpoint:
    
    - **Cloud**: any OpenAI-compatible endpoint (OpenAI, “proxy”/gateway). OpenEvolve uses the OpenAI SDK and lets you override `api_base` in config. [GitHub](https://github.com/codelion/openevolve)
        
    - **Local (optional)**:
        
        - **Ollama** exposes OpenAI-compatible Chat endpoints → just change `api_base`. [Ollama](https://ollama.com/blog/openai-compatibility?utm_source=chatgpt.com)
            
        - **vLLM** runs an **OpenAI-compatible** HTTP server (`/chat/completions`, `/completions`, `/models`). [VLLM Docs+1](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html?utm_source=chatgpt.com)[vLLM](https://nm-vllm.readthedocs.io/en/0.4.0/serving/openai_compatible_server.html?utm_source=chatgpt.com)
            

---

# Repo layout Claude should create

bash

CopyEdit

`growth-krma-evolve/   pyproject.toml   README.md   .env.example   src/growth_kv/     __init__.py     schema.py            # Pydantic models for entities and knobs     core.py              # Deterministic KV core (versioned, hashable)     hashing.py           # Stable KV hash (inputs + core version)     examples/       initial_item.py    # EVOLVE-BLOCK file the agent edits   src/evaluators/     kv_evaluator.py      # OpenEvolve evaluator (returns metrics dict)   configs/openevolve/     growth_item.yaml     # OpenEvolve config   scripts/     run_local.sh         # one-liner runner     visualize.sh   vendor/     openevolve/          # (option A) git submodule`

---

# Step-by-step Work Plan for Claude Code

## 1) Pull OpenEvolve (pinned)

Two choices:

- **Submodule** inside `vendor/openevolve` (stable, repeatable runs), or
    
- Install from GitHub and pin a **release tag** (e.g., `v0.1.0`).  
    Usage/CLI and config patterns are in the README, including `openevolve-run.py`, checkpoints, and visualizer. [GitHub](https://github.com/codelion/openevolve)
    

**Commands (Claude runs):**

bash

CopyEdit

`git clone https://github.com/codelion/openevolve vendor/openevolve pip install -e vendor/openevolve`

## 2) Project scaffolding & env

Claude creates `pyproject.toml`, minimal deps (pydantic, python-dotenv), and a `.env.example` with `OPENAI_API_KEY` and optional `API_BASE`.

toml

CopyEdit

`# pyproject.toml [project] name = "growth-krma-evolve" version = "0.1.0" requires-python = ">=3.10" dependencies = ["pydantic>=2", "python-dotenv>=1.0"]  [tool.setuptools.packages.find] where = ["src"]`

## 3) Define schemas (strict, so KV is reproducible)

`src/growth_kv/schema.py`

- `ResistType = Literal["Heat","Cold","Shock","Toxin","Psychic","Pierce","Crush","Slash"]`
    
- `Resist` = map of `ResistType -> int (0..5)`
    
- `Knobs`: gates (tech_level, faction), cooldowns, upkeep, durability, attunement slots, doctrine/proficiency, geo/time locks.
    
- `ItemSpec` with **EVOLVE-safe** fields the agent may touch (knobs + allowed stats). Everything validated by Pydantic.
    

## 4) Deterministic KV core

`src/growth_kv/core.py`

- Pure function: `(spec: ItemSpec) -> KVResult(kv_canonical:int, version:str, drivers:list[str])`
    
- **Order of operations fixed** (documented), **weights constant** in this version (e.g., `kv_core@1.0.0`).
    
- Computes **drivers**: e.g., survivability (+resists vs common types), action-economy impacts (cooldowns, charges), persistence/scope, hard counters, abuse risk.
    
- **No randomness**; every input combination maps to one KV.
    
- Include `calc_hash(inputs, version)` in `hashing.py` → stable audit id.
    

> (We’re mirroring AlphaEvolve’s “LLM proposes; evaluator verifies” pattern, but your evaluator is _deterministic_. AlphaEvolve uses evolutionary loop + evaluators; OpenEvolve implements that loop and lets us plug in our deterministic scorer. [Google Cloud Storage](https://storage.googleapis.com/deepmind-media/DeepMind.com/Blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/AlphaEvolve.pdf?utm_source=chatgpt.com)[arXiv](https://arxiv.org/abs/2506.13131?utm_source=chatgpt.com)[GitHub](https://github.com/codelion/openevolve))

**Example (compact):**

python

CopyEdit

`# core.py (excerpt) CORE_VERSION = "1.0.0" WEIGHTS = {     "resist_common": 2,     # Heat/Cold/Shock     "resist_rare": 1,       # Toxin/Psychic     "offense_minor": 1,     "scope_arc": 2,     "cooldown_day": -1,     "upkeep_medium": -1,     "attunement_slot": -1,     "durability_low": -1,     "hard_counter_present": -1, }  def kv_core(spec: ItemSpec) -> KVResult:     score = 0     # survivability     for t,v in spec.resist.items():         w = WEIGHTS["resist_common"] if t in {"Heat","Cold","Shock"} else WEIGHTS["resist_rare"]         score += w * v     # scope     if spec.scope == "arc": score += WEIGHTS["scope_arc"]     # knobs as tradeoffs     if spec.cooldown == "1/day": score += WEIGHTS["cooldown_day"]     if spec.upkeep == "medium": score += WEIGHTS["upkeep_medium"]     if spec.attunement_slots >= 1: score += WEIGHTS["attunement_slot"]     if spec.durability == "low": score += WEIGHTS["durability_low"]     if spec.has_hard_counter: score += WEIGHTS["hard_counter_present"]      kv = max(1, min(20, score))   # clamp, example tiering     drivers = [...]               # human readable reasons     return KVResult(kv, CORE_VERSION, drivers)`

## 5) Initial program (the file the agent edits)

`src/growth_kv/examples/initial_item.py`

- Include **EVOLVE-BLOCK comments** so OpenEvolve knows which region to mutate (its README calls this out in “Preparing Your Own Problems”—evolve whole files or blocks; we’ll give it a block). [GitHub](https://github.com/codelion/openevolve)
    

python

CopyEdit

`""" Returns an ItemSpec dict. The agent may ONLY edit inside EVOLVE-BLOCK. """  def build_item_spec():     spec = {         "name": "Null-Frond",         "scope": "scene",     # scene|arc|campaign         "resist": { "Heat":1, "Cold":0, "Shock":0, "Toxin":0, "Psychic":0, "Pierce":0, "Crush":0, "Slash":0 },         "cooldown": "none",   # none|1/scene|1/day         "upkeep": "none",     # none|low|medium|high         "attunement_slots": 0,         "durability": "normal", # low|normal|high         "has_hard_counter": True,         "gates": { "tech_level": 2, "faction": [] }     }      # EVOLVE-BLOCK-START     # Agent can change ONLY these fields to hit a target KV via tradeoffs.     spec["resist"]["Shock"] = 2     spec["cooldown"] = "1/scene"     spec["attunement_slots"] = 1     # EVOLVE-BLOCK-END      return spec  if __name__ == "__main__":     import json; print(json.dumps(build_item_spec()))`

## 6) The evaluator for OpenEvolve

`src/evaluators/kv_evaluator.py`

- Loads the candidate program (imports `build_item_spec()`), validates with Pydantic, calls `kv_core()`.
    
- Returns a **metrics dict** with a single **fitness** (lower better) or `combined_score` (OpenEvolve will use this automatically if present). It also returns any extra metrics you want to chart (kv, knob counts, validity).
    

OpenEvolve lets you run via CLI:  
`python openevolve-run.py <initial_program.py> <evaluator.py> --config <cfg> --iterations 200` [GitHub](https://github.com/codelion/openevolve)

python

CopyEdit

`def evaluate(program_path: str, target_kv: int = 12) -> dict:     from growth_kv.schema import ItemSpec     from growth_kv.core import kv_core, CORE_VERSION     from importlib import util      spec = _load(program_path)  # import and call build_item_spec()     item = ItemSpec(**spec)     kv = kv_core(item)     kv_error = abs(kv.kv_canonical - target_kv)      metrics = {         "kv": kv.kv_canonical,         "kv_error": kv_error,         "combined_score": float(kv_error),  # OpenEvolve selects on this by default         "valid": 1.0,         "kv_core_version": CORE_VERSION,     }     return metrics`

## 7) OpenEvolve config tuned for your box

`configs/openevolve/growth_item.yaml`

- Set **small batch**, **low concurrency**, **checkpoints every 10** iterations, and **process limits** so modest hardware is fine (OpenEvolve supports process-based parallelism + resource limits; we’ll keep it conservative). [GitHub](https://github.com/codelion/openevolve)
    
- Point `llm.api_base` to:
    
    - cloud (default), or
        
    - `http://localhost:11434/v1` (Ollama), or your vLLM server URL. [Ollama](https://ollama.com/blog/openai-compatibility?utm_source=chatgpt.com)[VLLM Docs](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html?utm_source=chatgpt.com)
        

yaml

CopyEdit

`max_iterations: 200 random_seed: 42  llm:   model: "gpt-4.1-mini"       # or any OpenAI-compatible model name   temperature: 0.4   api_base: "${API_BASE:-https://api.openai.com/v1}"  database:   population_size: 60   num_islands: 1   migration_interval: 0   feature_dimensions: ["complexity", "diversity"]  evaluator:   enable_artifacts: true   cascade_evaluation: false   use_llm_feedback: false   resource_limits:     time_limit_sec: 5     memory_mb: 512  prompt:   num_top_programs: 2   num_diverse_programs: 1   include_artifacts: true  checkpoint_interval: 10 output_dir: "openevolve_output/growth_item"`

## 8) Runner scripts

`scripts/run_local.sh`

bash

CopyEdit

`#!/usr/bin/env bash set -euo pipefail export OPENAI_API_KEY="${OPENAI_API_KEY:-$(grep OPENAI_API_KEY .env | cut -d= -f2)}" export API_BASE="${API_BASE:-$(grep API_BASE .env | cut -d= -f2 || true)}" python vendor/openevolve/openevolve-run.py \   src/growth_kv/examples/initial_item.py \   src/evaluators/kv_evaluator.py \   --config configs/openevolve/growth_item.yaml \   --iterations 200`

`scripts/visualize.sh`

bash

CopyEdit

`#!/usr/bin/env bash pip install -r vendor/openevolve/scripts/requirements.txt python vendor/openevolve/scripts/visualizer.py --path openevolve_output/growth_item/checkpoints/checkpoint_200`

## 9) README with acceptance checks

- **Runs with cloud LLM** out of the box: set `OPENAI_API_KEY`, `./scripts/run_local.sh` → checkpoints appear; best_program evolves; visualizer shows the tree. (OpenEvolve CLI & visualizer usage documented in README). [GitHub](https://github.com/codelion/openevolve)
    
- **Switch to local**:
    
    - **Ollama**: `ollama pull mistral` → set `API_BASE=http://localhost:11434/v1` → rerun. (Ollama OpenAI-compat blog). [Ollama](https://ollama.com/blog/openai-compatibility?utm_source=chatgpt.com)
        
    - **vLLM**: `vllm serve <model> --api-key token-abc123` then set API_BASE to the served URL (docs show OpenAI-compatible server). [VLLM Docs](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html?utm_source=chatgpt.com)
        
- **Determinism test**: same `initial_item.py` + same config → identical `kv` and `hash` in evaluator output.
    
- **Safety test**: try to modify a **forbidden** field; schema rejects; evaluator returns `valid=0` & large `combined_score`.
    

---

# Hardware notes (why this works on your PC)

- OpenEvolve offloads model inference to whichever OpenAI-compatible endpoint you pick; your machine just runs Python and the evaluator. The project explicitly supports **any OpenAI-compatible API** and includes **checkpointing**, **resource limits**, and **process-based parallelism** so you can keep it light. [GitHub](https://github.com/codelion/openevolve)
    
- If you later want offline, both **Ollama** and **vLLM** serve **OpenAI-compatible** endpoints, so you only change `API_BASE`. [Ollama](https://ollama.com/blog/openai-compatibility?utm_source=chatgpt.com)[VLLM Docs](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html?utm_source=chatgpt.com)
    

---

# Optional: “official” AlphaEvolve access

DeepMind’s announcement confirms a **planned Early Access Program** (primarily academics), plus a Colab with verified results; good to register interest, but you don’t need it for our local loop. [Google DeepMind](https://deepmind.google/discover/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/?utm_source=chatgpt.com)[Google Colab](https://colab.research.google.com/github/google-deepmind/alphaevolve_results/blob/master/mathematical_results.ipynb?utm_source=chatgpt.com)

---

# Claude Code: exact TODO list

1. **Bootstrap**
    
    - Create the repo structure above; add `pyproject.toml`, `.env.example`, `README.md`.
        
    - Pull **OpenEvolve** into `vendor/openevolve` and `pip install -e vendor/openevolve`. [GitHub](https://github.com/codelion/openevolve)
        
2. **Implement KV Core**
    
    - Write `schema.py`, `core.py`, `hashing.py`. Enforce strict types/choices and fixed operation order.
        
3. **Seed Evolvable Program**
    
    - Write `examples/initial_item.py` with an **EVOLVE-BLOCK** range and safe knobs only. (OpenEvolve supports evolving blocks or whole files.) [GitHub](https://github.com/codelion/openevolve)
        
4. **Evaluator**
    
    - Write `evaluators/kv_evaluator.py` to: import the candidate spec, validate schema, compute KV, return `combined_score = kv_error`.
        
5. **Config**
    
    - Add `configs/openevolve/growth_item.yaml` with conservative limits, `checkpoint_interval: 10`, `output_dir: openevolve_output/growth_item`. (Config and CLI patterns in README.) [GitHub](https://github.com/codelion/openevolve)
        
6. **Runners & Docs**
    
    - Add `scripts/run_local.sh` and `scripts/visualize.sh`.
        
    - In README, document:
        
        - Cloud run (OpenAI key),
            
        - Local run with **Ollama** (API compatibility doc),
            
        - Local run with **vLLM** (OpenAI-compatible server docs). [Ollama](https://ollama.com/blog/openai-compatibility?utm_source=chatgpt.com)[VLLM Docs](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html?utm_source=chatgpt.com)
            
7. **Acceptance**
    
    - **Run 50 iterations** → verify checkpoints created and `best_program_info.json` shows shrinking `kv_error`.
        
    - **Visualize** the evolution tree (OpenEvolve visualizer). [GitHub](https://github.com/codelion/openevolve)
        
    - **Determinism:** re-run same seed → same KV/hash.
        
    - **Schema guardrails:** attempt forbidden edit → validation failure path works.
        

---

# Stretch (once green)

- **Template prompts**: create custom prompt templates so the agent reasons about “tradeoffs to hit target KV” more explicitly (OpenEvolve supports custom templates). [GitHub](https://github.com/codelion/openevolve)
    
- **MAP-Elites features**: include evaluator metrics like `tradeoff_count` or `risk_score` as **feature_dimensions** (README supports mixing built-ins with evaluator metrics). [GitHub](https://github.com/codelion/openevolve)
    
- **What-if harness**: small CLI that says “I want KV≈X” → proposes concrete, schema-legal edits; then run a short evolution.