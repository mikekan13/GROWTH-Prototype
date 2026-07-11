# 00 — CANON CORE

**Status:** #validated · condensed canonical core · **RUNTIME COMPONENT**
**Last synced:** 2026-06-26 (incorporates all rulings through r-2026-06-11-08)
**Security:** PUBLIC (rules) — the Founder-Only 10-year arc is NOT in this file by design.

> **What this is.** The single condensed source of truth every AI internalizes —
> the rules-mastery layer that JEWL and every character-agent loads *at runtime*
> (r-2026-06-11-08), and the first file any human or AI reads before touching
> game mechanics. It exists so nobody re-reads 70 Repository files or contradicts
> canon. When this file and an older Repository file disagree, **this file wins**
> (it is downstream of the rulings log). When this file and Mike disagree, **Mike
> wins** — his verbal corrections override everything.
>
> **Authority order:** Mike (ADMIN) → `rulebook/rulings.md` (append-only rulings)
> → this file → `GROWTH-DESIGN-TRUTH.md` → `GRO.WTH Repository/` files.
> Deep specs are linked inline; this file is the index + the load-bearing facts.

---

## 1. WHAT GROWTH IS

A digital-first TTRPG platform. The app **is** the game, not an accessory. Name
stylized **GRO<n>WTH**: `G/R/O` = Body (red), `<n>` = bridge (gold, near-invisible),
`W/T/H` = Spirit (blue), the whole governed by Soul (purple). The dot in GRO.WTH is
the threshold between what changes *within* a story (GRO) and what persists *across*
stories (WTH).

**Roles (consciousness hierarchy):** Terminal → Godheads → Watchers (GMs) →
Trailblazers (players). Out-of-game above all: **ADMIN (Mike)**. In-fiction the
Terminal = the canvas; "the game is run by the game which is running the game."
GODHEAD is an in-system AI agent role — **not** Mike.

---

## 2. THE THREE PILLARS (Soul/Spirit swap — Jan 2026)

Nine attributes in a 3×3 matrix. **The Soul and Spirit labels were SWAPPED in Jan
2026** after 9 years of mislabeling, to align with Orthodox anthropology
(soma/psyche/pneuma). This swap is canonical and SETTLED — do not re-litigate.

| Pillar | Alchemy | Attributes (canonical order) | Color | Hex |
|---|---|---|---|---|
| **Body** | Salt | Clout · Celerity · Constitution | Red | `#f7525f` |
| **Spirit** | Sulfur | Flow · **Frequency** · Focus | Purple | `#582a72` |
| **Soul** | Mercury | Willpower · Wisdom · Wit | Blue | `#002f6c` |

Terminal = Teal `#22ab94`. KRMA = Gold `#ffcc78`. Each pillar has 3 Sephirot tones —
see `memory/growth-color-palette.md`. **Always reference `PILLARS.*.color`, never a
literal hex.** (Note: `GROWTH-DESIGN-TRUTH §2` still shows the pre-palette
Spirit=Blue/Soul=Purple under a DECISION-NEEDED flag — that flag is RESOLVED here:
**Spirit=Purple, Soul=Blue**.)

Canonical 9-attribute display order (r-2026-04-22-09):
`Clout, Celerity, Constitution, Flow, Frequency, Focus, Willpower, Wisdom, Wit`.

### Attribute mechanics
- Each attribute: `level`, `current` pool, `augPos`, `augNeg`.
- **Pool Max = `level + augPos − augNeg`.**
- **Frequency is special:** only `level + current` (no augments). It is the
  experience currency, advancement resource, overflow-damage target, and life/death
  pool. When any attribute hits 0, excess damage overflows to Frequency.
- Display Frequency as its own prominent meter, separate from the Spirit bars.

### Depletion conditions (attribute at 0 → condition)
| At 0 | Condition | Effect |
|---|---|---|
| Clout | Weak | Carry Level → 1 |
| Celerity | Clumsy | DR5 Fate-Die check before ANY action; fail = hesitates + GM negative |
| Constitution | Exhausted | All ability-point costs doubled |
| Flow | Deafened | Cannot roll dice for any check |
| Frequency | Death's Door | Facing Death roll (see §6) |
| Focus | Muted | Cannot add Effort to rolls |
| Willpower | Overwhelmed | No Short Rest; recovery restores half (round down, min 1) |
| Wisdom | Confused | No color hints / no Oracle; must wager Effort upfront |
| Wit | Incoherent | Unskilled checks only |

---

## 3. GROWTH ACRONYM & GRO.vines

**GROWTH = Goals, Resistance, Opportunity, Wealth, Tech, Health.**

- **GRO** defines a **GRO.vine** (a character narrative thread): **G**oal pursued,
  **R**esistance (concrete *entities* pointed at the goal, not abstract obstacles),
  **O**pportunity (leverage moments).
- **WTH per-character levels were REMOVED 2026-04-05** (r-2026-04-22-03). W/T/H are
  now campaign-level narrative context only. Lifespan = `fatedAge` from Seed; the
  death save = **Fate Die vs Tara's chosen die** (r-2026-07-11-01 — `bodyResist` is
  combat damage absorption only, no role in death saves).

**GRO.vine capacity** (r-2026-04-22-01): hard cap **5** active per entity; Seeds cap
at 3; players reach 4–5 via Nectars/items.

**Rewards:** complete a GRO.vine → **Nectar** (permanent positive, Godhead-bestowed).
Fail → **Thorn** (permanent negative). **Blossom** = temporary buff from a Godhead in
play — **Blossoms can be NEGATIVE** (r-2026-06-11-05). Nectar/Thorn cap = Fate Die
value. **Decline a Nectar** → convert to raw KRMA into max Frequency minus **~10% tax
to the GM** (r-2026-06-09-04).

- **No "inherent abilities"** as a separate concept — every Seed/Root/Branch trait is
  a Nectar, Thorn, or Blossom, each with individually-graded KV (r-2026-04-22-05).
- Every trait carries a required **`pillar: body|spirit|soul`** tag set at authoring;
  drives death routing. Untagged legacy → `spirit` (r-2026-05-19-03). Rule text is
  **bearer-agnostic** ("the bearer", not seed names).
- Goal abandonment has **no flat cost** — it's a Godhead reaction; custodian may apply
  a Thorn (r-2026-05-19-07).

---

## 4. CHARACTER CREATION

- **Seeds** (species): starting Frequency budget, base Fate Die (d4/d6/d8/d12/d20),
  `fatedAge`, attribute baselines, bake-in traits. More abilities = lower Frequency.
- **Roots** (upbringing): GM-authored from backstory. Cost Frequency. **Max start age
  25** (r-2026-04-22-11); past that → Branches.
- **Branches** (life events): GM-authored. Cost Frequency.
- **Crystallization** (Q5.14): tutorial → structured backstory prompts (NEVER a single
  open field) → GM assigns Seed/Roots/Branches → system generates sheet → player+GM
  discussion → **GM "crystallizes"** = locks active in campaign + debits KRMA.
- **Below the crystallization line = GM drafting (no KV/KRMA); above = active
  (KRMA debited).** Deleting an active entity ≠ deleting a draft — active requires a
  dissolution flow with KRMA settlement (r-2026-06-09-09).

**Root KV** (r-2026-04-22-10): attribute levels + skill levels + net Nectar/Thorn. **No
formulaic age contribution.** Frequency cost = `max(0, RootKV − 100)`. An average year
≈ **5 KRMA** of KV (sanity weight, NOT a formula — intense years weigh far more).
Plain 18yo Human Root ≈ 100 KV; Human Seed 225 → reference TKV 325. Age is a Frequency
lever: `break-even = 100 + (age−18)×5` (r-2026-04-22-11).

**Skill caps** (r-2026-04-22-02): lifetime hard cap **20**; creation soft cap ~10
(up to 12 with extreme tuning).

**Content** (r-2026-05-19-09): Seeds/Roots/Branches are agnostic, ever-expanding,
NOT count-gated. Beta gate = the **drop-in test** (can a new player build a complete
character from existing pools without authoring?). Hand-author solid bases, AI-expand.

---

## 5. RESOLUTION & SKILL SYSTEM

**Skilled check:** roll Skill Die (SD) openly → Terminal color hint → wager Effort →
roll Fate Die (FD) → `SD + FD + flat mods + Effort` vs DR. Meet/exceed = success.
**Unskilled:** wager Effort blind → roll FD → `FD + flat + Effort` vs DR.

- **Effort is ALWAYS spent**, success or fail. Comes from the skill's governor
  attributes matching the action's pillar; player distributes across 1–3 governors.
- **Skill Die ladder:** 0 = none (FD+Effort only); 1/2/3 = flat +1/+2/+3; 4–5 = d4;
  6–7 = d6; 8–11 = d8; 12–19 = d12; 20 = d20.
- **Total Max Potential = FD max + Skill Level** (caps the total added to a roll).
- **Contested:** ties → defender wins; both offensive → initiative decides.

**Terminal difficulty colors** (DR as % of Total Max Potential): Blue easy → Green
moderate → Yellow hard → Orange very hard → **Red = beyond Total Max Potential
(requires Frequency Burning)**. Exact thresholds `[NEEDS MIKE]`. Skill-relevance mod:
highly relevant −3 … irrelevant = impossible without Burning.

---

## 6. COMBAT, ACTION ECONOMY & DEATH

**Grid:** 5ft squares (canvas encounter cards). **ActionMod base = 0**, modified only
by items/traits. Any action can be used as movement; cross-pillar actions generally
non-transferable.

**Actions per round** (r-2026-05-20-01) — uses LEVELS, not pools, min 1 each:
- Body = `floor((Clout + Celerity + Constitution) / 25)`
- Spirit = `floor((Flow + Focus) / 25)` — **Frequency EXCLUDED** (it's the life pool)
- Soul = `floor((Willpower + Wisdom + Wit) / 25)`

**Multiple attacks per action** come from **Nectars/items only** — no universal
skill-level multiplier (r-2026-06-09-02).

### Death — three distinct mechanics

**The death save (BOTH doors, r-2026-07-11-01/-02):** character's **Fate Die vs
Tara's chosen die**. Tara picks from the full ladder like skills — **1, 2, 3, d4,
d6, d8, d12, d20** (1/2/3 = static values) — by **her own reasoning**; she may
**choose not to reap at all** (no roll, the character survives the trigger).
Nectars/Thorns/Blossoms augment the character's roll (same modifier engine as
skill checks). `bodyResist` plays NO role in any death save (combat damage
absorption only; supersedes the old "bodyResist + FD" combat formula from
r-2026-04-22-03). **Ties go to Lady Death** (survive only on STRICTLY greater,
unless something overrides the tie). **Her post-roll authority is one-way
mercy** (r-2026-07-11-02): after a failed roll she may still decline to reap
("fudge it"); after a survived roll she CANNOT reap — survival is final.

1. **Facing Death** (r-2026-06-11-05, the combat/sharp-edge path). Two triggers:
   (a) Frequency current ≤ 0, or (b) a **vital body part destroyed**. **One roll vs
   Lady Death (Tara), fires once** even if both triggers hit together.
   - **Success:** survive; destroyed vital part restores one condition; if Freq was 0,
     restore 1 Frequency. Tara MAY still attach a trigger-related **Thorn or negative
     Blossom**.
   - **Failure:** the Death Engine fires.
   - (r-2026-06-11-02 phrasing: combat death = ONE roll, binary — no 3-strike.)
2. **Fated-Age Death** (r-2026-06-09-01, the slow clock). At/past `fatedAge`, roll
   the death save each year. Fail → Tara bestows an **escalating-age Thorn**.
   **Third fail after fated age = death.**
3. **Death = transformation, not destruction** (r-2026-05-19-02). Character becomes a
   **GHOST**, persists on canvas. Split:
   - Body attrs/skills/Nectars/Thorns/baseResist → 0; KRMA → GM.
   - Soul attrs + soul-only skills → halved; lost half → Lady Death.
   - Frequency `level` → 0; its KRMA value → Lady Death.
   - Spirit attrs (Flow, Focus), pure-Spirit skills, all 10 magic schools, Spirit-
     pillared traits → **kept unchanged**.
   - Lady Death **is** Tara Almswood (one Godhead, two names).

### Damage targeting — the Affinity Cycle (r-2026-06-10-02, AUTHORITATIVE spec:
`05_COMBAT_STRUCTURE/Damage_Targeting_KV_Spec.md`)
- Damage string `P:S:H/D\C:B:E` maps positionally to Body trio / **Spirit** / Soul trio.
- 7 damage types + 7 cycle attributes form a **closed ring**: P→Clout, S→Celerity,
  H→Constitution, D→Focus, C→Willpower, B→Wisdom, E→Wit (wraps).
- **Weapons declare which attribute they target** — any of the nine is legal. Cost
  multiplier on the item's **Damage-Value KV component** by ring distance
  `min(|i−j|, 7−|i−j|)`: **0=1×, 1=2×, 2=5×, 3=10×**. Frequency (off-ring) = **20×**.
  **Flow prices identically to Focus** (r-2026-06-10-04).
- A **weapon carries multiple named ATTACKS**, each its own damage string (sword: Slash
  `0:45:0/0\0:0:0` + Stab `30:0:0/0\0:0:0`). **Nectars can bestow attacks** onto
  weapons or unarmed.
- Multipliers are **META LEVERS** — config, not constants (r-2026-06-10-03). Ring
  structure is canon; price *values* are provisional/tunable (r-2026-06-11-01).
- Implemented: `app/src/lib/damage-targeting.ts`.

### Body composition (r-2026-05-19-04)
Body parts are `GrowthWorldItem`s (`isBodyPart`, `partName`) nesting via `contains`;
armor+body+organs = one container chain. Cascade: outer absorbs to resist, excess
passes through; **piercing** designates ONE internal, all other types even-split. **No
"Body" damage type** — each part has a material (Hard/Soft). Each Seed declares its own
anatomy. Parts have **condition tracks** the death system reads. **Creature size** is
numeric `width×length` grid footprint + descriptive height, no categories
(r-2026-05-19-05).

### Rest
**Short Rest:** deplete 1 Frequency current → heal every other attribute by 1. (Swappable
to per-pillar later.)

---

## 7. KRMA ECONOMY & FREQUENCY OPERATIONS

- **Total supply 100B KRMA, hard cap, only shrinks via Burn.** Reserves: Terminal 75B
  (one-way drain), Balance 12.5B, Mercy 6.25B, Severity 6.25B. Append-only SHA-256
  ledger; deterministic KV evaluator (GM has knobs, cannot override KV).
- **KV is graded case-by-case, not formulaic** for items/traits (r-2026-04-22-15);
  raw material KV < 1, crafted item ≥ 1, material KV is the floor.
- **GM wallet = capacity ceiling, not a consumed balance.** KRMA constrains GM power to
  prevent network-wide inflation.
- **GM subscription drip** (r-2026-05-19-06): 15,000 lump on subscribe; monthly
  m1 2,500 → m12 peak 10,000 → m36+ steady 3,000. PAST_DUE pauses; CANCELED preserves.

**Frequency operations (three, distinct):**
- **Spend** — from Max pool; permanent Max reduction (advancement currency).
- **Deplete** — from Current only; recovered by rest.
- **Burn** (r-2026-05-19-01) — the **ONLY** mechanic that removes KRMA from the whole
  system (all else is transfer). `1 max Frequency = 1 KRMA`. Cost judged by a high
  Godhead (Kai by default). Formula `scaledCost = baseCost × (1 + burnSinkBalance /
  50_000)` — anti-deflationary. Global burn cap 5B, then disabled forever.
  `services/burn.ts`, [[Frequency_Three_Operations]].

**Harvests** (r-2026-04-22-07, r-2026-06-09-05): reward packages between sagas. Character
ages by the Harvest duration; `years × age-KV rate` = the **MINIMUM** reward budget (a
floor, GM may exceed), spent on attributes/skills/Nectars/gear.

---

## 8. GODHEADS, JEWL & THE SESSION ENGINE

**One character-agent architecture at every tier** (r-2026-06-11-08): NPC-with-AI-on,
lesser Godhead, JEWL, Prime Godheads — same kind, differing only in scale of
duty/share/memory. Every Godhead must (1) know how to PLAY GROWTH (rules mastery — this
file is that layer, loaded at runtime), (2) manage the meta + their KRMA share, (3) play
the game as a character. Every active character keeps a session/lore log regardless of
AI mode; **memory ≠ persona** ([[ai-two-layers-and-universal-character-log]]).

**JEWL** is the universal GM/player copilot — in canon JEWL **IS** the copilot (players
don't know; ship a generic "Copilot" label, identity + wallet are PRIVATE). During play
JEWL is the **live session engine** (r-2026-06-09-08): knows every voice at the table,
logs everything as it happens, controls the canvas (all the numbers). Day-1 release
scope includes JEWL's live-audio session engine + the full Godhead agent system
(r-2026-06-11-06). Voice = native in-app WebRTC rooms first, Discord bridge later
(r-2026-06-11-07). Architecture detail: classifier wakes him (no wake word); always-on
audio when the GM is in a campaign; mute is the privacy lever.

**JEWL = the witness, not the synchronous gate.** Direct UI mutations commit immediately
+ fire async observation events; chat/audio paths stay synchronous. JEWL handles
per-campaign control (locations/NPCs/lore/item-instances); the **Forge** is the
metaverse-wide content factory (Selva→Creator→Kai→Et'herling). JEWL can DRAFT metaverse
content but routes through the Forge chain — never bypasses.

**Three pillars of magic:** Mercy (Flow: Fortune/Restoration/Enchantment), Severity
(Focus: Force/Alteration/Conjuration), Balance (Flow+Focus: Divination/Dissolution/
Abjuration/Illusion). 10 schools total. Magic comes down from the Godheads via the
Terminal; per-table GM defines its in-fiction nature.

---

## 9. COSMOLOGY POINTERS (Prime)

The `__PRIME__` campaign = GROWTH played at the cosmic level (Mike/admins = Watcher, AI
agents = Trailblazers, Godheads = PCs, child campaigns = entities). Same engine,
recursive, ADMIN-only. **In `__PRIME__` only**, JEWL's prompt gets a build-state
preamble (he knows he's mid-development) — update it each time JEWL gains capability.

- **10 Sephirot live in THE TERMINAL**, not the Tree of Life — ToL is the only portal to
  Terminal tower (r-2026-06-11-03). One Prime campaign only (r-2026-06-11-04).
- **Tara Almswood / Lady Death** = Mike's in-system equity stake; pronounced TAR-a.
  Central voice anchor: *"I, Lady Death, am afraid of death."* Every Prime god-tier
  being fears the thing they embody.
- **Three pantheons** (post-split): Luminary Conclave (Mercy/Val), Eternity
  (Balance/Tara), Umbral Dominion (Severity, drifting antagonist; likely JEWL). Schema
  enum MERCY/BALANCE/SEVERITY/TRINITY.
- **Hardcoded succession:** "whoever kills X becomes X" is Terminal-level. Killer of Lady
  Death inherits the platform; Mike exits.
- Tiberoak = Tiber (River Styx) + Oak (Tree of Life): the meeting place of death and
  life Tara later bridges. Lore is **upstream** of mechanics, not vice versa.

---

## 10. HARD "DO NOT" LIST

- ❌ **Google Sheets** — DEAD entirely. No googleapis, no fallback.
- ❌ **OAuth/Google Auth** — bcrypt + session tokens only.
- ❌ **Values / Addictions** — CUT 2026-04-19, not deferred. Do not build.
- ❌ **Fears** — post-release expansion only; no current mechanics.
- ❌ **WTH per-character levels** — removed; `fatedAge` + `bodyResist` replace them.
- ❌ **Thread facet sub-letter model** — discarded.
- ❌ **Brevity-Thorn** — never canon (r-2026-05-19-08).
- ❌ **Orthodox/Serenity-Prayer/Christian framing in user-facing text** — the 10-year
  arc is a Founder-only DESIGN PHILOSOPHY, never coded as a launch feature.
- ❌ Don't invent rules. If canon looks incomplete, the truth EXISTS somewhere — search
  all layers, then ASK Mike. Never write "by design" about an absence.

---

## 11. OPEN `[NEEDS MIKE]` DECISIONS (gating milestones)

These freeze whole milestones when hit. Resolve in a batch:
- **Burn base-cost authority migration** (Kai → Terminal-tier) — process, not blocking.
- **Spirit/Soul Package composition** detail on death (UI rendering of the split).
- **Terminal difficulty color thresholds** (exact % bands).
- **Decay's default Spirit attribute** when damage targets the Spirit pillar generically.
- **Damage multiplier price VALUES** (ring structure canon; values provisional).
- **Hosting platform** (Vercel/Fly/Railway) — M6.
- **Content target counts** — answered NO (drop-in test, not numeric) per r-2026-05-19-09.

---

## 12. DEEPER SPECS (read when the work touches them)

- `GROWTH-DESIGN-TRUTH.md` — full canonical design doc.
- `rulebook/rulings.md` — append-only ruling log (the source above this file).
- `VISUAL-DESIGN-SPEC.md` + `memory/growth-color-palette.md` — colors/typography.
- `05_COMBAT_STRUCTURE/Damage_Targeting_KV_Spec.md` — authoritative damage math.
- `ROADMAP.md` — milestones M1–M9, current phase.
- `docs/system_map.md`, `docs/module_registry.md`, `docs/database_schema.md`,
  `docs/ai_systems.md` — architecture, where code lives, schemas, AI designs.
- `docs/KRMA-ECONOMY-THEORY.md` — economy theory.

> **Maintenance:** when a new ruling lands in `rulebook/rulings.md`, fold its load-
> bearing fact into the relevant section here and bump "Last synced." This file is the
> runtime canon — stale here = wrong everywhere.
