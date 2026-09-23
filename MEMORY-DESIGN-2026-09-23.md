# GROWTH Memory — Design Intent (2026-09-23)

**Status:** Mike's rulings from the memory walkthrough of 2026-09-20 → 09-23,
plus Claude's proposed build order (marked PROPOSAL). Authority for memory
across all layers. Companion to `REALITY-SIM-DESIGN-2026-09-02.md` (§11–12).

---

## 0. North star (Mike, verbatim intent)

> What we are trying to create is **perfect recollection at the Terminal
> layer**. The Terminal should be able to answer any question about anything
> anywhere in GROWTH with perfect detail and no hallucination. That is one of
> our goals for GROWTH.

And: use and adapt anything already being done well in AI memory toward it.

Two consequences shape everything below:
1. **The Terminal is a BEING (Mike 09-23), and the canon ledger is its
   memory.** Fidelity is a function of attributes at every layer — one
   mechanism, three scales. A character with Wisdom 20 misremembers; a
   Godhead with a godlike sheet can only be fooled on purpose; the Terminal
   has perfect attributes, so its recollection is perfect. Perfect
   recollection is therefore achieved the same way everything else is: the
   ledger holds every act once with its chain, and the Terminal's recall over
   it has a threshold of zero and a budget of everything. A model only
   phrases what the record returns.
2. **Fallibility is attribute-priced, by design.** Characters misremember;
   Godheads almost never do; the Terminal never does.

## 1. The layers (one machine at three scales)

| Layer | Record | Reader | Fidelity | Scope |
|---|---|---|---|---|
| **Terminal** (a being — The Godhead) | Canon ledger = its memory: every event once, append-only, with its chain | Itself; the Watcher via JEWL; Godheads; the sim | Perfect attributes → perfect recollection | ADMIN/Prime: everything. A **Watcher sees everything within their campaign and nothing beyond** (09-23). |
| **Godheads** | The **vines** they custody (a vine is the custodian's memory of a goal) | Themselves; JEWL on request | Godlike sheets → faithful unless deliberately fooled; coloring = interpretation, not error | Within the asking campaign |
| **JEWL** | Reads canon + the campaign's vines; front man for the audience with the gods | The Watcher | Faithful within scope | Within the campaign |
| **Character** | Fallible memory ledger, each entry pointing at the canon it perceived (`truthRef`) | The being itself; the player through it | Fallible by design (Wisdom/Wit gates, Thorns, dreams) | What its body could sense and it can learn in-fiction |

Cross-campaign knowledge exists only through in-fiction means (powerful
spells — the Divination parallel). Campaigns are pocket universes; the wall
is perceptual scope, never a rule bolted on.

## 2. The Terminal's memory is the Godheads' to manage

- The meta memory belongs to **the Terminal, not JEWL**.
- **Godheads are memory managers** (on top of their other roles). They sit at
  the **ten domains** — the ten sephiroth, paralleling the ten magic schools
  (not their real names) — grouped by the three pillars **Mercy / Balance /
  Severity**, exactly as a character has three pillars. Main seats have
  Godheads under them taking narrower requests (a custodian **tree**).
- Everything is classified by domain ("keywords to an extent"); the domain's
  Godhead is its source of truth. **Death → Tara.**
- **Attention routes through goals**: every goal has a custodian Godhead;
  an event reaches a Godhead when it touches a goal they custody. Domain
  classification is the second route.
- **Overlap, not partition**: one event is logged by every witness, and
  every Godhead with a stake attends. The meta memory is an **index over the
  single record**, never shards with single owners.
- **The vine is the custodian's memory of the goal.** Several recorders per
  goal: the custodian, the resistance's opposing custodian on its own vine,
  the witnesses. "This allows the God perspective upon that world."
- **Recall at the meta = an audience with the gods, with JEWL as front man.**
  JEWL answers most of it himself; Godheads sit behind him.

## 3. A character's memory (the same machine, human scale)

Priority ladder, weighting both what is stored and what is reachable:
1. **Survival** — derived, never authored: the sheet and the current
   situation drive survival, body state, and much of emotion (Frequency at
   risk, vital parts, senses reporting danger, conditions).
2. **Goals** — the being's own vines; heavy weight.
3. **Everything else** — classified into the **same ten domains** at write
   time, backed by a **chain**.

**The chain** (Mike): items, locations, other entities — each tracking from
its own perspective — all linked to the one canon event. Concretely a memory
carries: `truthRef` (the canon event), the entities present, the items
involved, the place, the goals it touched, and its antecedent.

**Recall order:** classify the cue → survival → goals → domain → walk the
chain → words last.

## 4. What is already right, as built

- Canon ledger (`CanonEvent`, append-only, GM-read-only) and `truthRef` on
  memories (09-20).
- Fallible character memory with affect, Wisdom/Wit gating, Thorns, dreams,
  rehearsal, honest misses; engine-authored perception (no confabulation).
- Goals with custodian Godheads (`Goal.custodianId`, pillar); resistance as
  entities with their own vines.
- Godhead rows carry `domain` + `pillar`.
- Provenance manifests with `memoryRefs`; consent gates the corpus.

## 5. What has to change (as-built → target)

| Gap | Now | Target |
|---|---|---|
| Memory shape | prose + affect + one parent pointer | prose + affect + **pillar/domain tags + chain** (entities, items, place, goals, antecedent, truthRef) |
| Recall | flat scan, keyword Jaccard first | **ladder**: survival → goals → domain → chain → words; embeddings for the words step |
| Godhead memory | none | the **vine** as ledger: custodian writes canon touches onto it, from its side; opposing custodian on the resistance's vine |
| Godhead as reader | prompt-only | a **DayaEntity with a godlike sheet** (same loop, godlike Wisdom/Wit) |
| Terminal recall | none | **lookup + traversal over canon/vines**, JEWL phrasing; answers cite canon ids (no hallucination = every claim has a truthRef) |
| Canon writers | sim rounds only | + table-speak dialogue, GM declarations/improvisations, location on events |
| Scope wall | none | campaign-scoped reads for Watcher/JEWL/Godheads; in-fiction means to cross |
| Custodian tree | flat GodHead rows | parent seat on GodHead; seating at the ten domains [NEEDS MIKE] |

## 6. What to adopt from current AI memory (and what not)

Adopt (each maps onto a ruling above):
- **Temporal knowledge graph with bi-temporal facts** (Zep/Graphiti pattern):
  facts carry "true from/until" and "recorded at"; supersession, not
  overwrite. This IS the chain + WorldFact supersede, done properly, and it
  is what makes "what did Danny believe about Ruth as of round 12" a query.
- **Transparency-log append-only ledger** (hash-chained; Sigstore pattern)
  for canon: tamper-evidence at zero cost, no chain dependency.
- **Reflections that cite evidence** (Smallville `filling`/depth): dreams
  carry `evidence[]`, `depth`, expiry — inference never promoted to fact.
- **Hybrid retrieval**: structured traversal first (goals, domain, chain),
  embeddings for the "words" step, exhaustive summarize-synthesize only for
  reflection-class questions (soul.py's router split).
- **Salience-counter reflection trigger** (built 09-20) and Smallville's
  starting weights (relevance 3 / importance 2 / recency 0.5) as tunables.
- **Engine-authored observations + identity constraints** (AI Scientist
  Fleet: delusion probes 91.7% → 0% with "never write what did not happen"
  + provenance) — already our law; keep it absolute at the Terminal.

Do not adopt: per-entity file layouts (tables exist), AI-GM framings, any
"memory" that lets a model summarize into the record without a citation.

## 7. Build order (PROPOSAL — schema-first, since it cannot be retrofitted)

1. ✅ BUILT 09-23 — **Memory chain + domain tags at write-time** — `DayaMemoryEntry` gains
   `pillar`, `domain`, `chain` (JSON: entities, items, locationId, goalIds,
   antecedentId); the sim and the tagger fill them; canon events gain
   `locationId` + `itemIds` + `goalIds`. Nothing retrieved yet; nothing lost.
2. **Ladder recall** — restructure `recall.ts` scoring into survival → goals
   → domain → chain → words; add embeddings for words (local lane).
3. **Canon writers** — table-speak dialogue and GM declarations become canon
   events; the sim stamps location once positions land.
4. **Vines as custodian memory** — on canon write, match touched goals
   (existing vine-progress matcher) and write a custodian entry on each vine,
   from that Godhead's side; resistance vines get the opposing entry.
5. **Godheads as beings** — a DayaEntity per seated Godhead with a godlike
   sheet; the custodian tree (`parentId` on GodHead); seating [NEEDS MIKE].
6. **Terminal recall** — JEWL's "ask the Terminal": classify → scope to the
   campaign → traverse canon + vines → cite → phrase. Hallucination check:
   every claim in the answer resolves to a canon id or is marked as a
   Godhead's interpretation.
7. **Perfect-recollection harness** — a probe set of factual questions with
   known canon answers, run per campaign; the score is the north star.

## 8. Open [NEEDS MIKE]
- Exact Godhead ↔ domain seating (is Tara's seat the Dissolution parallel?
  which ten are seated today?).
- Whether domain-classification attention also fires without a goal.
- Who authors the classifier keywords per domain (Mike, the custodian, or
  discovered from play).
- Item perspective records: does an item "remember" (a chain node only) or
  hold its own ledger?
