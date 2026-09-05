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

**Meta validation** (ruling 10) — RESOLVED 2026-09-02, Mike: there is no
separate validator layer. **JEWL and the GM are the validator layer for the
table.** JEWL validates using DAYA (the simulation); the GM validates using
his imagination and brain. Over thousands of choices this shows where GMs
differ from the guidance and rules.

**The GM alignment scale** (−100 … 0 … +100):

| Value | Meaning |
|---|---|
| **0** | Perfectly aligned = balance. Very improbable to ever sit at. |
| **+100** | Completely in sync with the simulation — just following everything, no input. Improbable extreme. |
| **−100** | Following nothing — probably lots of creativity, but no consistency. Improbable extreme. |

The system can **monitor, learn, and steer every GM toward 0**. It also
distinguishes **content consumers (+)** from **content creators (−)**:
taking AI suggestions pushes toward + (consumer); creating your own ideas or
modifying JEWL's pushes toward − (creator). One axis, confirmed 2026-09-02. "The meta" =
this network-level statistic over all tables, not a component.

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

### 6.1 Combat round walkthrough (Mike, step by step, 2026-09-03 — IN PROGRESS)

Mike is walking Claude through the round; Claude asks one question at a
time. Claude's earlier Time Stack reading was WRONG per Mike — do not rely
on the canon-keeper summary of ordering until Mike restates it here.

- **All entities are in the dilation.** Campaign time flows via the GM's
  narrative; when the table is at 6-second rounds, the whole campaign is.
- **Entering:** encounters are often preplanned cards (combat, tension,
  race-the-clock) but NOT always ("murder-hobo party members"). A mode is
  switched on — GM hits a button OR JEWL understands it from the talk.
- **Surface:** an encounter card on the canvas (think Roll20 — advanced card
  features). Most encounters have a map (AI-generated maps: still to be
  investigated). Some can be theater-of-mind; with the DAYA sim running,
  theoretically ALL encounters could be, if the system answers players'
  perception questions fast enough.
- **★ PCs run DAYA too.** A player's character is a running DAYA branch; the
  player's actions and speech overwrite the branch's own as canon. Therefore
  the system can tell what EVERY character is seeing/perceiving (rolls etc.).
  **Reaffirmed 09-05: it is not an "NPC side" — ALL entities go through the
  same loop.** Every branch perceives from the sim, fires affect/recall, and
  logs inputs as memory; when a player controls the entity, the player's
  actions take over the ACT step. **Override boundary (Mike 09-05):** the
  player decides intentions, deliberate blocks/negates, AND **where a reflex
  Redirect sends the hit** (the choice of interposition is the player's).
  The sim still computes WHETHER the reflex is fast enough (speed gate,
  defender-favored) and the involuntary layer (affect, recall, memory).
- **★ SENSES vs NOTICING (Mike 09-05) — the senses contract:**
  - **Senses = raw input, determined by BODY PARTS.** The parts determine
    the capabilities: eyesight range, low-light, hearing, taste, smell, and
    senses outside the human set. Raw input is passive, continuous, and
    full-field — "if I sit in my room and look at my desk, I see it all."
  - **Noticing = conscious effort.** "If I try to find a penny, I am taking
    a conscious effort in perceiving the penny" — a deliberate act, i.e. a
    skill check → spends an action.
  - Therefore the sim delivers each branch its full raw sensory field
    (filtered ONLY by what its body can sense and the scene's fidelity),
    and deliberate perception is an action the entity/player chooses.
  - **Involuntary salience is FREE** (Mike 09-05): a bang, sudden movement,
    a familiar face pops out of the raw field via the involuntary stage
    (affect/salience). Determining WHERE it came from = deliberate check.
  - Working rule from here (Mike): ordinary perception cases follow
    reality/tabletop convention without asking; questions go to GROWTH-
    specific forks.
- **★ STRATEGY (Mike 09-05):** "Of course" a DAYA entity has strategy.
  **Think about how a human plays GROWTH — an entity does the same thing,
  it just doesn't see it as a game.** It plans its own round and acts
  accordingly. The ONLY time it doesn't is when a GM overrides it with his
  own choices, exactly as a player overrides their character's DAYA
  decisions. Don't view the loop through a combat lens — combat is just a
  round-granular instance of the same planning. (Existing design carries:
  a non-omniscient entity plans from its BELIEVED sheet, introspection-
  gated — DayaBelievedSheet; JEWL-tier sees True Sheets.)
- **Stage 1 — setup + intention:** GM narrates the setup; JEWL + DAYA fill
  in any details players ask for their decision. Stage is set, everyone is
  looking at the same reality, then all players choose their intentions for
  the following 6 seconds. Intentions are managed by **Actions: Body, Spirit,
  Soul actions** — players allocate actions explicitly per pillar (canon,
  Turn_Structure_and_Action_Economy.md; secrecy if undetected; undefined
  intentions = reserve, faster than changed intentions; free/joint/reactive
  actions as written).
- **REPOSITORY FIX NEEDED (Mike 09-03):** "Effort per action is limited in
  combat" (Turn_Structure_and_Action_Economy.md) is NOT unpacked and is
  misleading. Update the repository.
- **Stage 2 — Resolution order is determined by THE SIMULATION we are
  building**; GROWTH mechanics are inputs to it. Both existing Time Stack
  write-ups (Combat_Grid_System.md stat-tiers vs Turn_Structure declared-
  alignment) are superseded by this layered model:
  - **Layer 1 — action count.** Total actions in the round. Character A with
    1B/2S/1S = 4 actions; character B with 2B/2S/1S = 5 → B's FIRST action
    sits higher on the stack than A's. **Interleave:** the higher-count
    character's surplus actions go first, solo; then lockstep SIMULTANEOUS
    slots: `B1 · (B2,A1) · (B3,A2) · (B4,A3) · (B5,A4)`.
    **Layer 1 is SOLID/absolute (Mike 09-04):** a creature with 3 actions vs
    one with 6 is just straight-up faster. **The entity with the most
    actions sets the GRANULARITY within the 6 seconds** — the round is
    sliced into max-action-count slots. This is how it scales from normal
    human speed to godly battles (hundreds of punches in 6 s = hundreds of
    slots). **Objects can have actions too** (vehicles); and things WITHOUT
    actions but in motion (a fan propeller) exist in the sim as continuous
    environment state tracked through the same slots.
    **Uneven counts, CONFIRMED intended (Mike 09-04):** 3 vs 6 =
    `B1 · B2 · B3 · (B4,A1) · (B5,A2) · (B6,A3)` — the faster entity's
    surplus runs solo FIRST; the slower entity's actions pack toward the
    END of the round.
  - **STILL TO DISCUSS (Mike's list 09-04):** grappling, "all the little
    nuances", and the simulation that handles physical things — a trigger
    pull on a gun, falling, missile velocity, etc. The Effort "misleading"
    issue is something OTHER than the cap rule — DEFERRED by Mike.
  - **DEFENSE (Mike 09-05) — NOMENCLATURE CHANGE:** Dodge → **NEGATE**
    (prevent the attack completely); Block → **REDIRECT** (defender picks
    WHAT the attacker is damaging — which part/item/layer). A **Dodge
    SKILL** will exist in the global repository (governed ~Clout, Celerity,
    Constitution, Focus, Flow): physically moving out of the way of
    anything physical.
    - **A skill check ALWAYS uses an action.**
    - **Negate** = a skill check with at least one governor matching a
      governor of the skill being negated → spends an action (Mike thinks
      it should). **Resolution: CONTESTED (Mike 09-05)** — the defender's
      total is the DR the attacker's total must beat (canon tie rule:
      ties go to the defender). **Timing (Mike 09-05, CORRECTED —
      SUPERSEDES repository "undefined beats changed"):**
      - A creature may **freely change ONE of its actions once per round**,
        no penalty — e.g. into a Negate in response to being attacked.
      - If it responds using an **UNASSIGNED (reserve) action** instead, it
        **loses a bit of priority on all its actions after** that one.
        (Amount of "a bit": tuning value, OPEN.)
      - Repository fix: Turn_Structure_and_Action_Economy.md §Undefined
        Intentions / §Intention Changes must be rewritten to this.
      - **Second attack same round (Mike 09-05):** free change already
        used → options are only an unassigned action (priority loss) or a
        reflex Redirect. No second free change — BUT traits from Blossoms,
        items, Nectars etc. will augment/extend all of these in different
        ways (base rule, not a ceiling).
  - **GRAPPLE (Mike 09-05):** the grappler's initial roll total becomes the
    **DR of the grapple**. The grappler must **HOLD that action** (it stays
    committed, not re-rolled) to keep the grapple; releasing frees the
    action. The grappled creature just needs to **break it** — a check vs
    that DR. Supersedes the draft "opposed check every round"; compatible
    with the validated Clout-contest note. **Across rounds:** the held
    action occupies one of the grappler's slots every round (a 3-action
    grappler effectively acts with 2 while holding). The grappler may
    **re-roll the held action at will** — no extra action needed, it IS the
    held action — but the new total **becomes the new DR, higher or lower**.
  - **RANGED (Mike 09-05):** the range-increment DR doubling (+2/+4/+8…)
    and Close/Short/Medium/Long bands were **paper-version rules**. With the
    sim we do better: **range difficulty is DERIVED by the simulation** from
    the physical situation — distance, target size, missile velocity,
    cover, movement, etc. The paper increments are at most a fallback
    default, not the mechanic. (Pattern: paper rules = the sim's floor when
    it lacks data; sim supersedes when it has the situation.)
  - **PHYSICAL GAPS (Mike 09-05):** falling damage, drowning, projectile
    behavior — **no paper rule**; GROWTH stats + mechanics + the sim derive
    them. **Reload costs are a property of the weapon/item** that requires
    reloading (declared on the item, not a global rule).
  - **IMPACT / CONSEQUENCE TIMING (Mike 09-05):** the canon "all damage
    applies simultaneously at Impact" refers to **the damage of a hit
    applying together when it hits a creature** (all components of that
    hit land at once) — NOT deferral to end of round ("would make no sense
    otherwise"). **Consequences apply as each slot resolves**: a creature
    dropped in slot 2 does NOT act in slot 4. Repository fix:
    Turn_Structure Phase 3 + Combat_Grid_System "Impact" wording.
  - **WITHIN A SHARED SLOT (Mike 09-05):** both outcomes are possible,
    **based on the simulation** — a true trade (both land) OR the faster
    action (layer 2/3 speed) pre-empting the other. The sim decides from
    the situation; no fixed rule.
  - **MANA (Mike 09-05): still a SEPARATE resource from Frequency**, live
    canon — Mana_System.md / Prima_Materia_System.md / Casting_Methods.md
    stand ("should be well documented in the rules"). The 09-04 status
    sheet's "likely stale" flag was WRONG. Fix: CANON_CORE §7 should name
    Mana alongside Frequency so sweeps stop mis-flagging it.
  - **COUP DE GRACE (Mike 09-05): paper-version rule, most likely CUT.** A
    helpless target is just an uncontested attack; damage cascades and the
    one-roll Facing Death stands as written. Repository: retire the
    Special_Combat_Actions.md coup de grace entry.
  - **OPPORTUNITY ATTACKS (Mike 09-05): NONE by default.** Leaving a
    threatened square triggers nothing. "Sounds like a good Nectar" —
    opportunity attacks become a Nectar (trait), not a base rule.
    Repository: remove the OA trigger from Combat_Grid_System.md §Reach and
    threatened squares + ActionMod_System.md reactive-check mention.
  - **OBJECTS WITH ACTIONS (Mike 09-05):** vehicles are POSSESSIONS (items)
    with their own traits, materials, etc. — so the item itself declares
    its action count, speed, etc. (fields on the item, same as reload
    cost). A **horse is a creature with a character sheet**, not a vehicle
    — its actions come from its attributes like any being. (Consistent
    with rulings-content-scope 2026-08-04: vehicles/buildings = POSSESSIONS.)
  - **IN-COMBAT HEALING (Mike 09-05):** non-magical stabilize/first-aid =
    a **skill check** (spends an action, like any skill check) against the
    situation (body-part condition etc., sim-derived). Plus Nectars and
    Blossoms that extend it. No special healing subsystem.
    - **Redirect** = does NOT spend an action, but **REQUIRES at least one
      action remaining** (Mike 09-05). **Speed comparison (RULED YES):** the
      sim compares the defender's reflex speed vs the incoming action's
      speed; the margin sets how much say the defender has over where the
      hit lands (faster = free pick; even = constrained pick; slower =
      attacker's target stands). **Defender gets an advantage** in the
      comparison. Redirect = the involuntary/reflexive layer of the DAYA
      loop; wears the interposed item's condition.
    - **Deliberate block (nuance, Mike 09-05):** a player may SPEND an
      action to attempt to block → this is a skill check → must carry "a
      distinct advantage somehow" over the free reflexive redirect.
      **RULED YES (Mike 09-05, "pretty nice"):** a deliberate block (1)
      SKIPS the speed gate — full choice of what takes the hit regardless of
      margin — and (2) its **skill-check total counts as EXTRA RESIST on the
      interposed item** (shield resist 6 + block total 9 soaks 15; if not
      exceeded, the item's condition doesn't tick). Ladder: reflex redirect
      (free, needs an action in hand, speed-gated) → deliberate block
      (spends an action, guaranteed choice, absorbs by skill) → negate
      (spends an action, matching governor, nothing lands).
    - Repository files to update: Attack_Resolution_Mechanics.md,
      Damage_Calculation_System.md (block/dodge → redirect/negate).
  - **Layer 2 — attribute MAX POOL values shift order within a slot.** This
    is where the simulation and raw GROWTH mechanics start to mingle. The
    "speed gauges" for an action, by the action's pillar: **Celerity (Body)
    · Frequency (Spirit) · Wisdom (Soul).** (Frequency: excluded from action
    COUNT, but IS the Spirit speed gauge.) Gauges are NOT compared raw
    across pillars: **pillar speed order is Spirit > Soul > Body** (Spirit
    fastest). This is **further compounded by skills and their actual
    governors**. It does NOT mean a Body action is always last — **that is
    where the simulation comes in** (contextual adjudication over the
    mechanical prior). **Layer-2 clarification (Mike 09-04):** the pillar
    order is a BIAS on the gauge VALUES, not a strict sort — a Body action
    with Celerity 200 would "most likely" go BEFORE a Soul action with
    Wisdom 20. Big gaps override pillar order; "most likely" = the
    simulation weighs it, not a hard formula.
    **Governor example (Mike 09-04):** Archery governed by Celerity, Focus,
    Flow, Wisdom. It can be fired with a Soul action, but a Spirit action
    pegs higher speed (Spirit > Soul base). And because it is ALSO governed
    by Celerity and Wisdom, it is not as fast as a skill governed just by
    Wisdom — the governor set BLENDS/drags the speed, it does not replace
    the action pillar's base.
  - **Layer 3 — skill-governor speed tiers (Mike 09-04, categorical, not
    values).** "Everything is a layer; skill governors and their speed is a
    layer." A skill can NOT be governed by Frequency, so the only speed
    gauges that can appear as governors are Wisdom and Celerity. Tiers:
    1. governed by **Wisdom only** → first-tier speed
    2. **Wisdom + Celerity** only
    3. **Celerity only**
    4. any other mix — **more governors = slower**.
  - **Layer 4 — modifiers (Mike 09-05 "yeah"):** items, ActionMod,
    conditions, Blossoms, Nectars/Thorns shift speed.
  - **Layer 5 — the simulation's contextual call** on top of all of it.
  - **Multiple hits on one target:** the sim, under the body-part cascade
    rules; no separate stacking rule.

**Simultaneity consolidation (Mike 09-02):** the simulation must consolidate
what happens at one time when actions from entities conflict. This is the
Willpower reconcile step; combat rounds are its first real test. Combat/
encounter time dilation and gameplay to be discussed with Mike before the
loop is built unit by unit.

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

1. ~~Alignment-scale sign convention~~ RESOLVED: one axis, + = consumer
   (follows the sim), − = creator (follows nothing). "The meta" RESOLVED —
   JEWL + GM validate; the meta is the network statistic.
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
