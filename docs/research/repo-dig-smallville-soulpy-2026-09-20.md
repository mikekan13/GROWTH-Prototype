# Repo dig — generative_agents (Smallville) + soul.py (2026-09-20)

Companion to the two briefings in this folder. What the CODE says that the
papers don't, and what GROWTH takes from it. Repos cloned read-only into
the session scratchpad; nothing forked.

## generative_agents — `reverie/backend_server/persona/`

**Retrieval (`cognitive_modules/retrieve.py`)** — the shipped weights are
NOT [1,1,1]: `gw = [0.5, 3, 2]` = recency 0.5 · relevance 3 · importance 2.
Recency decay in code is 0.99 (paper says 0.995) and is applied by **rank
position in last-accessed order**, not by elapsed time. Each component is
min-max normalized before weighting. → GROWTH: recall weights become
tunables with relevance dominant once embeddings exist; our rehearsal
refresh already matches "last accessed".

**Reflection trigger (`reflect.py`, `perceive.py:178`)** — a per-persona
counter `importance_trigger_curr` starts at 150 and is **decremented by each
perceived event's poignancy**; reflection fires when it reaches ≤ 0, then
resets. Pure event-driven accumulator, no clock. → GROWTH: dream trigger =
per-entity salience accumulator since last dream (queue item 4) — the
tagger already emits salience; this is ~20 lines.

**Reflection output** — thoughts carry `filling` (the evidence node ids),
`depth` (0 for events; a thought's depth = max evidence depth + 1 → the
reflection tree), and an **expiration** (created + 30 days). Observations
never expire; thoughts do. → GROWTH: dream memories should carry an
`evidence[]` list (not just one `parentMemoryId`), a `depth`, and an expiry —
all fit in the existing `classification` JSON, no migration. Expiring
reflections rhyme with "blossoms are temporary".

**Perception (`perceive.py`, `scratch.py`)** — three knobs: `vision_r` = 4
tiles (raw field radius), `att_bandwidth` = 3 (only the closest N events
are attended), `retention` = 5 (an event already in the last N memories is
not re-ledgered). → GROWTH senses contract: raw field = radius; free
salience = bandwidth-limited; **retention dedupe** matters for the ambient
sim so a standing fact isn't re-written every tick.

**Identity revision (`plan.py:408 revise_identity`)** — once per game day
the persona's `currently` status is rewritten from yesterday's plans +
thoughts. → matches our believed-sheet revision at dream/wrap time.

**Spatial memory (`memory_structures/spatial_memory.py`)** — a nested dict
world → sector → arena → [objects] holding only what the persona has seen.
→ the per-entity believed world (queue item 5); maps directly onto the
recursive Location tree.

**Node shape (`associative_memory.py`)** — subject/predicate/object triple +
keywords + embedding + poignancy + type (event|thought|chat). The s/p/o
triple is how they get cheap graph queries without a graph DB.

## soul.py

The paper's proposed anchors (PROCEDURES / SALIENCE / RELATIONS /
IDENTITY_HASH) and the drift detector are **not implemented** in the repo —
only SOUL.md + MEMORY.md, RAG/RLM/graph retrieval, a query router, and a
markdown "modulizer". Nothing to port. Two ideas confirmed: (1) the
focused-vs-exhaustive query split (RAG for in-scene recall, recursive
summarize-synthesize for reflection) — already how recall vs dream divide;
(2) `graph_memory.py`'s regex/LLM s-p-o extraction is trivial and optional.

## Net effect on the queue (ROADMAP 2026-09-20)
- Item 4 (dream trigger) gains its exact mechanism: salience accumulator.
- Item 5 (believed world) gains its data shape: seen-only subtree.
- Item 6 (embedding recall) gains starting weights: relevance 3 / importance
  2 / recency 0.5, normalized.
- New small item: dream memories carry `evidence[]`, `depth`, `expiresAt` in
  classification JSON; ambient sim gets retention dedupe.
No change to items 1–3 (consent bit, provenance manifest, probe baselines).
