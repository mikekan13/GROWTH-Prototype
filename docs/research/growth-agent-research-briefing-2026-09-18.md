# GROWTH Agent Individuation — Research Briefing
**Purpose:** Ground-truth reference for building persistent, individuated AI entities in GROWTH (tabletop RPG metaverse). Point Claude Code at this file. It contains: prior art with repos, exact architecture mechanics worth reusing, known failure modes with mitigations, and the design of the untested experiment GROWTH is positioned to run.

**Compiled:** 2026-09-18

---

## 0. The Thesis Being Tested

If identity lives in the archive-plus-loop rather than the model weights, then one frozen engine can host many distinct entities, each individuated by a bounded, salience-tagged experiential record. GROWTH's contribution: test this over **months of real human play** — nobody has. Success criterion: entities become blind-distinguishable to players over time. Failure signal: all entities drift back toward the base model's voice ("diary-with-a-reader" outcome).

---

## 1. Primary Sources (fetch these)

| Work | What it is | Link |
|---|---|---|
| Generative Agents (Smallville), Park et al. 2023, UIST Best Paper | THE ancestor architecture: memory stream + retrieval + reflection + planning, 25 agents, 2 game days | Paper: arxiv.org/abs/2304.03442 · Code (MIT-adjacent, research): github.com/joonspk-research/generative_agents |
| Generative Agent Simulations of 1,000 People, Park et al. 2024 | Agents built from 2-hr interviews replicated real individuals' survey answers ~85% as well as the people replicated themselves | Search: arxiv "generative agent simulations of 1000 people" |
| soul.py / Multi-Anchor Identity, Menon 2026 | Identity distributed across separable anchor files (SOUL.md, MEMORY.md, + proposed PROCEDURES/SALIENCE/RELATIONS/IDENTITY_HASH); hybrid RAG+RLM retrieval with query routing; identity-drift detection | Paper: arxiv.org/abs/2604.09588 · Code (MIT): github.com/menonpg/soul.py |
| Voyager, NVIDIA 2023 | Lifelong learning WITHOUT weight updates: ever-growing skill library of executable code, retrieved by docstring embedding; env feedback + execution errors + self-verification loop | Paper + Code (MIT): github.com/MineDojo/Voyager |
| Letta (formerly MemGPT) | Production-grade stateful-agent platform; OS-style memory hierarchy (in-context core memory blocks + external archival storage, agent self-manages transfers) | github.com/letta-ai/letta |
| Model collapse, Shumailov et al., Nature 2024 | Recursive training on self-generated data loses distribution tails → blander, wronger. THE dragon for naive self-training | Search: "AI models collapse when trained on recursively generated data" Nature 2024 |
| Zep / Graphiti | Temporal knowledge-graph memory; 63.8% vs 49.0% (flat vector RAG) on LongMemEval | github.com/getzep/graphiti |
| Emergence World, 2026 | Long-horizon multi-agent autonomy evaluation platform; maps the post-Smallville literature | arxiv.org/abs/2606.08367 |
| AI Scientist Fleet, 2026 | Measured delusion-reinforcement in self-referential memory: 91.7% probe failure → 0% after identity-level fabrication constraints + provenance verification | biorxiv 2026.08.16.745122 |

---

## 2. Smallville Mechanics — Exact Parameters (reuse these)

### 2.1 Memory stream
- Each memory object = natural-language description + creation timestamp + last-access timestamp.
- Base unit = **observation** (event directly perceived by the agent). Reflections and plans are ALSO memory objects, retrieved alongside observations.

### 2.2 Retrieval score (the salience function Michael described from first principles)
```
score = α_recency·recency + α_importance·importance + α_relevance·relevance
```
- All α = 1 in their implementation (tune these — they didn't).
- **Recency:** exponential decay over game-hours since *last retrieval* (not creation). Decay factor **0.995**. Note: retrieval refreshes recency — memories that get used stay warm. This is rehearsal.
- **Importance:** scored 1–10 by the LLM *at memory-creation time* with this prompt: "On the scale of 1 to 10, where 1 is purely mundane (e.g., brushing teeth, making bed) and 10 is extremely poignant (e.g., a break up, college acceptance), rate the likely poignancy of the following piece of memory."
- **Relevance:** cosine similarity between memory embedding and query embedding.
- Normalize all three to [0,1] via min-max, take top-ranked until context budget is full.

### 2.3 Reflection (the consolidation step)
- Triggered when the **sum of importance scores of recent events exceeds 150** (~2–3 reflections/day of game time). Event-driven, not clock-driven — busy/intense periods consolidate more. Keep this property.
- Two-step process: (1) feed the 100 most recent memories, ask "what are the 3 most salient high-level questions we can answer about the subjects in these statements?" (2) use those questions as retrieval queries, then ask for 5 high-level insights **with citations to the evidence memories** ("insight (because of 1, 5, 3)").
- Reflections cite their evidence and can be built on other reflections → **reflection trees** (leaves = observations, higher nodes = increasingly abstract self-knowledge like "Klaus is dedicated to his research").
- The citation pointers are the provenance mechanism. Do not drop them.

### 2.4 Planning
- Top-down recursive decomposition: day agenda (5–8 chunks) → hour chunks → 5–15 min chunks. Plans stored in memory stream, retrievable, revisable mid-stream when observations warrant reaction.
- Reaction loop: each timestep, perceive → store observations → ask "should agent react to this, and how?" → if yes, regenerate plan from now.

### 2.5 Fog-of-war (per-entity world model)
- Each agent maintains its own **subgraph** of the world tree (areas → subareas → objects), containing only what it has personally seen, in the state it last saw it. Trees go stale when the agent leaves and update on return. Structural non-omniscience — exactly what GROWTH needs for NPCs.

### 2.6 Evaluation method (steal this wholesale)
- **Interview the agents in natural language**: 5 categories × 5 questions — self-knowledge, memory retrieval, plans, reactions, reflections. Human evaluators rank believability across conditions; TrueSkill converts ranks to ratings.
- Ablation results (the causal proof): full architecture μ=29.89 > no-reflection 26.88 > no-reflection-no-planning 25.64 > **human crowdworkers 22.95** > nothing 21.21. Full vs. nothing = Cohen's d ≈ 8. Memory removal collapses believability; reflection removal collapses social synthesis.
- End-to-end over 2 game days: party info spread 1→13 agents (52%), candidacy 1→8 (32%), network density 0.167→0.74, 5/12 invitees actually attended. Hallucinated relationship claims: only 1.3%.

### 2.7 Documented failure modes (expect these)
1. **Retrieval misses** — agent has the memory but doesn't surface it (Rajiv "hasn't been following the election" despite hearing about it). Partial retrieval creates weird states (Tom sure of his party plans, unsure the party exists).
2. **Embellishment, not fabrication** — agents rarely invented whole events, but decorated known facts ("he's announcing tomorrow") and leaked world-knowledge from the base model (neighbor "Adam Smith" credited with Wealth of Nations). Leakage = base-model gravity — the individuation experiment's enemy.
3. **Location drift** — as agents learn more places, action-location choice degrades (everyone starts lunching at the bar).
4. **Instruction-tuning bleed** — overly formal, overly agreeable. Isabella absorbed everyone's suggestions until her stated interests changed. **This is the exact homogenization force that would erase Brannis-vs-Vex distinctiveness. RLHF politeness is the enemy of individuation.**
5. Cost: 25 agents × 2 game days = thousands of dollars in tokens (2023 prices; much cheaper now, still budget for it).

---

## 3. soul.py / Multi-Anchor — What to Take

### 3.1 Core move: separate WHO from WHAT-HAPPENED
- `SOUL.md` — identity spec: personality, values, behavioral constraints, speech register. Human-readable, version-controlled.
- `MEMORY.md` — chronological interaction log, auto-appended.
- Loss of memory preserves the soul; loss of soul is partially reconstructible from memories. Anchor resilience degree 2.

### 3.2 Proposed extensions (conceptual in the paper — GROWTH can implement and thereby test them)
- `PROCEDURES.md` — distilled what-works patterns, independent of the episodes that taught them (procedural memory).
- `SALIENCE.md` — importance + valence markers per topic/person (emotional memory).
- `RELATIONS.md` — who knows this entity, trust levels, roles (relational identity — for an NPC this is "the town's opinion of me," which players co-author).
- `IDENTITY_HASH.md` — core values / style markers / red lines, used as a drift-detection baseline.

### 3.3 Drift detection (directly usable for the individuation metric)
- Maintain a canonical probe set of identity questions. Periodically re-ask, hash/embed the responses, measure distance from baseline. Drift > threshold → flag.
- For GROWTH: run per-entity probes monthly. **Distance between entities should GROW or hold; distance from each entity's own baseline should stay bounded.** That two-axis measurement IS the experiment.

### 3.4 Hybrid retrieval routing
- ~90% of queries are focused (top-k vector RAG suffices); ~10% are exhaustive ("what patterns across everything?") and need recursive chunk-summarize-synthesize (RLM). A cheap classifier routes. Reflection jobs are exhaustive-class; in-scene recall is focused-class.

### 3.5 Lamarckian framing
- Agents inherit acquired characteristics: a new instance spun from the same files starts where the last ended. Entity lineages compound. (Also means a corrupted file compounds — see §5.)

---

## 4. Voyager — Growth Without Weight Updates

- Proof that **capability accumulation works purely in the archive**: an ever-growing library of executable skills, each stored with a docstring, retrieved by docstring embedding, composed into more complex skills. 3.3× more items, 15.3× faster tech-tree milestones than prior SOTA; the skill library transfers to a brand-new world.
- The loop: attempt → environment feedback + execution errors → refine → **self-verification before commit** → store. Only verified skills enter the library. This is the "world grades it, then consolidate" filter.
- GROWTH translation: a GM-entity's skill library = rulings, encounter patterns, table-management moves. Verification = did the ruling hold up, did the table stay engaged. Store the ones that survived contact with players.

---

## 5. The Self-Training Dragon — Model Collapse & Delusion Loops

- **Model collapse** (Shumailov et al., Nature 2024): recursive training on self-generated output loses distribution tails generation over generation → blander, more confident, less correct. Naive "fill context with own output, fine-tune, repeat" fails by default.
- **Escape hatch:** external validation before consolidation. Train/consolidate only on experience the world graded. In GROWTH the grading is free: player engagement, ruling acceptance, table pushback, session outcomes. This converts self-training into environment-filtered learning (RLHF harvested from play).
- **Delusion reinforcement** (AI Scientist Fleet, 2026): self-referential memory failed 91.7% of delusion-reinforcement probes until they added (a) identity-level fabrication constraints ("you may not write to memory what did not happen") and (b) a provenance/verification pipeline. After: 0%. Wrong-citation hallucination cut >14×. Their provenance-clean project memory then improved a local open-weight model from 44%→~90% on internal benchmarks — i.e., **consolidation into weights CAN work once the archive is provenance-verified.**
- **GROWTH mitigations, minimum set:**
  1. Every reflection cites its evidence memories (Smallville pointers).
  2. Observations are written by the *game engine*, not the entity — the entity cannot author its own ground truth.
  3. Reflections are marked as inferences, never promoted to observation status.
  4. Periodic audit: sample reflections, check citations actually support them.
  5. Fine-tuning (if ever) only on provenance-verified, outcome-graded material. LoRA adapters per entity per epoch; keep base frozen; A/B the adapter against archive-only before trusting it.

---

## 6. The Untested Experiment (GROWTH's lane)

Nobody has run: **months-long, real-human-players, per-entity archives, individuation measured.** Smallville = 2 simulated days, zero humans. The 1,000-people study = interview-seeded replication, not longitudinal divergence. Design:

1. **Seed** N entities (start ~5–10) on the same base model with distinct SOUL.md files + Smallville-style paragraph seed memories.
2. **Run** them in live play. Per-entity memory streams; engine-authored observations; importance-at-write; reflection at threshold; fog-of-war world subgraphs.
3. **Measure monthly:**
   - *Divergence:* pairwise distance between entities' probe-response embeddings (should grow/hold).
   - *Stability:* each entity's distance from its own baseline hash (should stay bounded).
   - *Blind test:* players read transcript snippets, guess which entity. Accuracy above chance, rising over time = thesis confirmed.
   - *Believability interviews:* Smallville's 5×5 protocol, ranked by players.
4. **Ablate** (later): freeze one entity's reflection module, another's importance scoring — find which component carries individuation.
5. **Watch for:** instruction-tuning bleed (all voices converging polite), retrieval-failure incoherence, reflection confabulation rates.

Either result is publishable. Divergence confirmed → archives carry identity. Convergence → weights dominate, and the field learns where the ceiling is.

---

## 7. Build Order Recommendation

1. **Read the Smallville repo** (github.com/joonspk-research/generative_agents) — `reverie/backend_server/persona/` contains memory stream, retrieval, reflection, planning as separable Python modules. Extract patterns, don't fork (it's research code, GPT-3.5-era prompts).
2. **Adopt soul.py's file layout** per entity: SOUL / MEMORY / PROCEDURES / SALIENCE / RELATIONS / IDENTITY_HASH. Human-readable markdown, git-versioned — one repo (or directory) per entity is a legitimate architecture and gives you diffable identity history for free.
3. **Storage:** start flat (markdown + a vector index); graduate to Graphiti-style temporal graph if relationship queries ("what does Brannis believe about Vex as of session 12") get hot. Letta is the reference if you'd rather build on a platform than raw files.
4. **Implement Smallville retrieval scoring verbatim** (decay 0.995, LLM importance 1–10 at write, cosine relevance, α's tunable), reflection-at-threshold-150 with evidence citations.
5. **Wire the provenance rules from §5 before anything else touches memory.** Cheap now, impossible to retrofit after entities have months of unaudited archive.
6. **Stand up the probe/drift harness early** — baselines must exist from day one or the longitudinal measurement is lost.
7. Defer weight-level consolidation (LoRA) until the archive loop is provenance-clean and graded. Voyager proves you get compounding growth from the archive alone; weights are an optimization, not a prerequisite.

---

## 8. Open Questions the Literature Doesn't Answer
- Does per-entity distinctiveness survive base-model upgrades? (Parfit's gradual-replacement problem, live in production.)
- Optimal α weights for RPG entities — importance probably deserves >1 relative weight in a drama-dense world.
- Reflection threshold scaling: 150 was tuned for Sims-mundanity; a combat session may blow past it hourly.
- Cross-entity memory ethics/mechanics: when Brannis tells Vex something, Vex's memory records *Brannis said X*, not *X is true*. Secondhand-belief representation is unexplored territory.
- Whether SALIENCE valence (not just importance) changes retrieval behavior — i.e., do entities need feelings-shaped recall to stay distinct. Untested by anyone.
