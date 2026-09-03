# Reality Simulation — Design Intent (2026-09-02)

**Status:** Structural rulings by Mike (ADMIN), 2026-09-02 fix-pass session.
This document is the authority for the simulation layer under DAYA. Where it
conflicts with older DAYA notes, this wins. Rulings are Mike's words; anything
marked PROPOSAL is Claude's elaboration awaiting or carrying his yes as noted.

Companion memories: `reality-simulation-design-2026-09-02`,
`daya-being-loop-2026-08-07`, `world-as-recursive-locations-and-crystallization-2026-06-03`,
`time-system-design-2026-06-08`.

---

## 0. Why this document exists

The 2026-09-02 audit of DAYA as built found a reactive stimulus pipeline with
no environment: no physics, no location, no time, no body-derived senses.
Beings honestly refuse to confabulate *memory* (ledger-only recall) but
confabulate *perception* every turn because nothing real exists to perceive.
Mike's verdict: "extremely incomplete — just an LLM with more steps." The fix
is structural, not incremental: **DAYA is not the entity. DAYA is the entire
simulation pooling for that entity.** Personalities come after there is a
stable reality to be a person in.

## 1. The frame

**The simulation is a prediction engine for the GM**, so the GM can make
decisions on the fly. It handles detail and fills in what a GM leaves out.
It is not a physics oracle the GM submits to; it is a forecast the GM
decides against. It exists so the GM never has to remember everything he or
his group ever said or did.

Three roles, one pattern — **Body · Spirit · Soul = JEWL · GM · DAYA**:

| Pillar | Role | What it does |
|---|---|---|
| Body (soma) | **JEWL** | The body making it happen: drafts, mechanics, execution, advice |
| Spirit (pneuma; Flow/Frequency/Focus) | **GM** | Drives the story; the flow of time; human authorship |
| Soul (psyche; Willpower/Wisdom/Wit) | **DAYA / the simulation** | The knowing, remembering, predicting faculty |

The simulation is *how JEWL advises so well*, *how characters remain
automated with presence off-screen*, and *what lets Godheads and other
non-human players actually play* (same world, same consumer interface as any
DAYA entity).

## 2. Rulings (Mike, 2026-09-02)

1. **DAYA = the sim pool, not the person.** Entities are consumers of the sim.
2. **Build the stable reality simulation first**, before personalities. It
   must provide realtime data to any DAYA entity that needs to pull it.
3. **Time is fluid and runs on the GM's flow of time.** No wall-clock ticker.
   State computes forward when the GM moves time (narration inference,
   explicit statement, combat rounds, harvest — the locked time-advance modes).
4. **Model-driven, high-level models.** Not deterministic code. Broken into
   sub-agents (see §4).
5. **GROWTH rules are the physics.** The sim applies them and *further
   extracts* rules as narrative requires — discovered, not created.
6. **Render-distance granularity.** Fidelity centered on the current scene,
   expanding outward at decreasing resolution.
7. **A floor of full simulation is always required.** Nothing is frozen out
   of range. DAYA entities cannot fabricate data, so every entity holds a
   full history of events even if the party hasn't been around for months.
   Render distance thins the *environment*; an entity's lived history is
   never thinned. **The sim's product for an entity is its memory ledger.**
8. **Asynchronous full update that starts locally in the scene** and
   propagates outward. Eager in intent, scene-first in order, non-blocking:
   play resumes on the scene while the wave continues server-side,
   completion-bounded (like JEWL work sessions — no ticks, no caps).
9. **Authorship precedence: ledgered fact > GM declaration > sim inference.**
   When time resumes the GM (with JEWL forecasting) immediately says what
   happened for the players. Those declarations are *boundary conditions*;
   the wave back-fills the causes that make them true. The GM cannot change
   already-established data. The inbound-causality problem of scene-first
   ordering is therefore not the sim's problem — it is the GM's authorship.
10. **Everything is validated by the meta to ensure pattern stability.**
    (Definition of "the meta" as a concrete layer: OPEN — see §8.)

## 3. The cycle (Mike's shape, verbatim)

```
SIM RUNS
  → GM narrates
  → SIM CORRECTS based on GM + any GROWTH mechanics taking effect
  → PLAYERS / AI react / act
  → SIM reconciles memories + anything that happened at the same time
  → set as CANON via the recording on the canvas,
    updating all memories across all characters and locations
```

Read against the pattern: SIM RUNS (Soul/Wisdom) → GM narrates (Spirit) →
SIM CORRECTS (Soul/Wit) → act (Body) → reconcile + record (Soul/Willpower).

**Levels:** each character is a branch with its own stats and moods,
processing the data from the simulation and the GM.

## 4. Sub-agents — faculties × domains (RULED YES 2026-09-02)

Two axes. **Domains** are what the simulation is about (Mike's original
list: visual details, weather, object interactions, …). **Faculties** are
what kind of cognition is being done; every domain worker is one of three:

| Faculty | Canon meaning | Engine role | Cycle step |
|---|---|---|---|
| **Wit** | Logic, analytical thinking | Rules faculty: apply GROWTH mechanics, resolve object interactions, combat math, extract a rule when none exists | SIM CORRECTS |
| **Wisdom** | Intuition, creativity ("wisdom to know the difference") | Forecast faculty: predict what plausibly happens, fill gaps, generate gap-history; weather/visuals live here; what JEWL advises from | SIM RUNS |
| **Willpower** | Mental/emotional resilience | Holding faculty: hold canon against pressure, refuse contradiction, reconcile simultaneity, correct memories, set canon (canvas record) | reconcile + record |

**Fractal downward:** each character branch runs the same three faculties
at *its own attribute levels*. A low-Wisdom being forecasts the world poorly
from the same sim data; low-Wit misapplies the rules of what it saw;
low-Willpower gets overwhelmed and reconciles memory badly. The world-level
engine has the faculties at full strength; each being has them at its stats.
(Recall already gates on Wisdom/Wit in `daya/recall.ts` — the code was
half-way there.)

**Meta validation** (ruling 10) sits above the faculties and checks that
every output conforms to the pattern at its level.

## 5. GM improvisation in play (NEW — never discussed or built before)

GMs can improvise: not only characters, but **manifest details that weren't
known**, on the spot. Never canon-breaking — canon-checked against ledgered
data. JEWL generates the stats/mechanics for approval (GM consent law: JEWL
never approves). "Like session prep, but active in play." **Limited** — the
GM cannot just free-flow. Improvised facts enter the sim as boundary
conditions exactly like post-timeskip declarations.

Limit mechanism: **OPEN** (§8). Note the tension: pure KRMA would make a
rich Watcher a free-flowing one.

## 6. Walking version: COMBAT / ENCOUNTERS

Mike: "probably the easiest way to knock out both GROWTH combat and digging
into the fine details of the DAYA sim." **1 round = 6 seconds** (locked
canon). A round is the smallest unit where every cycle step happens once
under a hard clock:

sim runs the round → GM narrates → Wit applies real GROWTH combat mechanics
(effort, damage ring, resistance) → each combatant's branch acts at its own
stats → Willpower reconciles simultaneous actions and records the round as
canon → every participant's ledger receives the round as lived memory.

Six seconds, fully consistent, no gap-filling. Time fluidity (narration
inference, timeskips, the outward wave) stretches outward from this.

## 7. What it sits on (locked earlier, never built)

- **Space** — one recursive tree of Locations; above the crystallization
  line position is mechanically real (travel time, populations, rumor at
  travel speed). "Spatial enforcement engine" = step 6 of that plan, unbuilt.
  Location rows exist; DAYA never reads them.
- **Time** — pocket-universe clock per campaign, meta cycles as ruler,
  per-Location timescale, combat 6s rounds, Location description = derived
  view of a history log. As built: a `narrativeCycle` integer moved only by
  timeskip; no history log.
- **Bodies** — body parts are items with materials; senses derive from
  seed + body composition. Never consulted for perception.
- **Seam** — `daya/adjudicator.ts` `WorldResolver` contract and the
  `WorldFact` ledger were written expecting a real engine to replace the
  prompt.

## 8. Open questions (ask Mike; do not improvise)

1. **"The meta"** — what concrete layer validates for pattern stability?
   The Terminal/Godhead layer (Prime)? A validator agent? Where does it run?
2. **Improvisation limit** — KRMA from the GM wallet, a per-session ration,
   or something else?
3. **State representation** — prose `WorldFact` rows maintained by the sim,
   or structured per-Location state with prose derived from it?
4. **Domain list** — which domains exist for the combat walking version
   (object interactions, bodies/wounds, positioning on the battlemap, …)?
5. **Model lanes** — which faculties/domains run local (game runtime) vs
   Claude (heavy cognition), per the 08-23 division-of-cognition ruling.

## 9. What this replaces

The as-built DAYA reflex arc (`daya/ensemble.ts` stimulus pipeline) is not
thrown away — its memory ledger, affect, recall gating, thorns, adjudicator
seam and no-confabulation discipline are all *consumers* or *components* of
the sim described here. What changes: perception comes from the sim, not
from the prompt; off-screen beings keep living; the world has state, time,
and place; and JEWL advises from a forecast instead of improvising one.
