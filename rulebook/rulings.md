# Rulings Log

**Status:** #validated (append-only canonical log)
**Source:** Direct rulings from Mike (Godhead authority). Each entry is a primary source for any downstream rule edit in [[GRO.WTH Repository]]. Never delete; if a ruling is superseded, add a new entry that references the old.
**Security:** PUBLIC
**Last updated:** 2026-05-23

Append-only record of Mike's design decisions. Each entry becomes a rule
in `rulebook.md`. Never delete; if a ruling is superseded, add a new
entry that references the old.

---

> **WTH RETIREMENT (2026-04-05):** This document predates the removal of
> Wealth Level, Tech Level, and Health Level. Any references to those
> systems below are historical context only — they are not active mechanics.
> See [[GROvine_System]] and [[KRMA_System]] for what replaces them.

---

## 2026-04-22

### r-2026-04-22-01: GRO.vine capacity
- **Ruling**: 5 is the hard cap on active GRO.vines per entity. Seeds cap at 3. Players reach 4–5 through Nectars or items.
- **Context**: Repo file `01_CORE_RULES/GROvine_System.md` said "cap 5, avg 3, humans 4." Ambiguous. Mike clarified.
- **Lands in rulebook**: §4.2

### r-2026-04-22-02: Skill cap (creation vs play)
- **Ruling**: Hard cap on any skill is 20. At character creation, soft cap ≈ 10 per skill; up to 12 only with extreme tuning (old character, stacked Root + Branches on one skill). Post-creation through play, characters can reach 20 on multiple skills, but it requires significant play time.
- **Context**: `forge-authoring.ts` hardcoded "NEVER above 12" which conflicted with the 1–20 rulebook range. Resolved: 12 is the creation soft ceiling, 20 is the lifetime hard cap.
- **Lands in rulebook**: §2.1, §2.3

### r-2026-04-22-03: WTH per-character levels retired
- **Ruling**: Per-character Wealth/Tech/Health Levels are removed. Lifespan is now `fatedAge` from Seed. Death resistance is now `bodyResist` (2:1 KRMA) + Fate Die. WTH remains as campaign-level narrative only.
- **Context**: Previously decided 2026-04-05; reconfirmed 2026-04-22 during rulebook audit. Three repo files (`Health_Level_System.md`, `Technology_Level_System.md`, `Wealth_Level_System.md`) are now stale.
- **Lands in rulebook**: §5.1

### r-2026-04-22-04: Age-to-KV rate (current working value)
- **Ruling**: 1 year of age ≈ 2 KRMA. This is the current working rate for age-offsetting Root/Branch Frequency costs, for Harvest reward budgets, and for any Kai evaluation that depends on time-to-value conversion.
- **Status**: placeholder. Pending empirical validation via reference character (Human Seed + basic Root aged to 18, compute total KV, solve for per-year rate). If the derived rate differs from 2 KRMA/year, the rulebook §6.4 updates and all dependent math follows.
- **Context**: Section 02 audit revealed the repo said "determined by karmic evaluation system" with no number; `forge-authoring.ts` hardcoded 2 KRMA/year. Mike confirmed 2 KRMA/year as the starting rate and proposed the reference-character validation method.
- **Lands in rulebook**: §6.4 (and referenced from §8.2 for Harvests)

### r-2026-04-22-05: No "inherent abilities" — only Nectars/Thorns/Blossoms
- **Ruling**: The phrase "inherent abilities" (as a separate concept from Nectars/Thorns) is retired. All traits attached to a Seed, Root, or Branch are either Nectars (permanent positive), Thorns (permanent negative), or Blossoms (temporary positive from Godheads). Each carries its own KV, assigned individually — there is no per-trait formula. Kai evaluates case-by-case on mechanical and narrative impact.
- **Context**: Section 02 audit. The Seeds_Roots_Branches file used the older generic phrasing; Mike confirmed that language is outdated.
- **Lands in rulebook**: §6.3, §7.1, §7.4

### r-2026-04-22-06: Nectar/Thorn acquisition — not fears
- **Ruling**: Nectars and Thorns are acquired primarily through GRO.vines (complete → Nectar; fail → Thorn). Additional sources: Harvests (typically Nectars), character creation (Seed/Root/Branch bake-ins), GM direct assignment, Terminal injection tied to story beats, and death-event Thorns. The old "facing or succumbing to fears and anxieties" trigger is retired along with the Fears system (cut).
- **Context**: Section 02 audit. Nectars_and_Thorns_System.md still contained Fears-era language. Mike confirmed Fears are cut and listed the canonical acquisition paths.
- **Lands in rulebook**: §7.3

### r-2026-04-22-07: Harvests = rewards paid in time
- **Ruling**: Harvests are packages of rewards between sagas. The character invests time (ages by the Harvest's duration); that time × the age-to-KV rate (§6.4) = the KV budget the GM spends on rewards (attributes, skills, Nectars, tech, equipment). Harvests validated (status flipped from `#needs-validation` to `#validated`).
- **Context**: Section 02 audit. File marked `#needs-validation`; Mike confirmed the system is canonical and locked the time = rewards rule.
- **Lands in rulebook**: §8.2

### r-2026-04-22-08: Wealth/Tech sections in Character_Sheet_Validation deleted
- **Ruling**: The "Tech Level Restrictions" and "Wealth Level" sections of Character_Sheet_Validation.md, and any WTH-related "Research Needed" entries, are removed. Consistent with r-2026-04-22-03.
- **Context**: Section 02 audit. Cleanup consequence of the earlier WTH retirement.
- **Lands in rulebook**: §5.1 (by reference)

### r-2026-04-22-12: Equipment condition is a 5-level scale, 0–4
- **Ruling**: Equipment has 5 condition levels.
  - **4 — Indestructible**: special / super rare. Cannot be destroyed.
  - **3 — Undamaged**: perfect working condition. Normal max.
  - **2 — Worn**: functional, minor penalties.
  - **1 — Broken**: partially usable, major penalties; effective Resist halved.
  - **0 — Destroyed**: item no longer exists.
- **Resolves**: conflict between `Equipment_Conditions.md` (4 states) and `Character_Sheet_Validation.md` (4 states with Indestructible). Both were incomplete.
- **Lands in rulebook**: §9.3

### r-2026-04-22-13: Tech Level is gone everywhere
- **Ruling**: Tech Level is fully retired. Not a character stat (already gone with WTH), not a material property, not a campaign descriptor. Rules that previously depended on Tech Level (e.g., "requires Tech Level X to use") are replaced by skill-gating where applicable (e.g., "requires Firearms skill to use").
- **Context**: Section 03 audit found Tech Level still referenced throughout `Material_System.md` and `Inventory_and_Encumbrance_System.md`. Mike confirmed all usages should be stripped. Skill-gating absorbs the "can you use this?" role WTH Tech used to play.
- **Lands in rulebook**: §9 (items section), edits to repo

### r-2026-04-22-14: Armor resistance = base material × category multiplier
- **Ruling**: Armor resistance is computed as `armor resist = base material resist × category multiplier`, rounded down to integer.
- **Category multipliers** (baseline):
  - Clothing: 0.5×
  - Light Armor: 1×
  - Heavy Armor: 1.5×
- **"Protective" modifier** (a material/item mod) shifts the scale up: 1.5× / 2× / 2.5× for clothing/light/heavy respectively.
- **Example**: Cotton base resist 2 → heavy armor → 2 × 1.5 = 3 (or 2.5 rounded down to 2).
- **Lands in rulebook**: §9.4

### r-2026-04-22-15: Item KV is multifactor, graded case-by-case
- **Ruling**: A finished item's KV has no single formula. Contributors include: (a) KV of materials used, (b) KV of item-granted abilities/powers, (c) mechanical stats (damage, resistance, capacity), (d) special properties and modifiers. Kai grades each item individually, with material KV as the floor.
- **Guidepost**: Raw materials have fractional KV (< 1). A crafted item has KV ≥ 1. The delta is earned from purpose, craftsmanship, abilities, and special mods.
- **Context**: Mike confirmed item valuation is "complex, not cut and dry." This is a case-by-case ruling pattern — add specific rulings per item type as they land.
- **Lands in rulebook**: §9.5

### r-2026-04-22-16: WTH references in Encumbrance deleted
- **Ruling**: The "Assets System" and "Technology Level Effects" subsections of `Inventory_and_Encumbrance_System.md` are deleted (WTH retirement cleanup).
- **Lands in rulebook**: none (repo-only cleanup, derived from r-2026-04-22-03)

### r-2026-04-22-11: Max Root starting age = 25; age-scaled break-even
- **Ruling**: Roots cannot start a character older than 25. Past that age, development belongs to Branches.
- **Companion rule (same session)**: Break-even shifts with age — `break-even = 100 + (age − 18) × 5`. Each year of age beyond 18 refunds 5 Freq (if the Root's KV doesn't claim it as content); each year short of 18 costs 5 Freq. At Root-age 20 with 100 KV → 10 Freq refund. At Root-age 25 with 100 KV → 35 Freq refund.
- **Context**: After locking the 5 KV/year rate, Mike clarified age IS a Frequency lever: unused years (those without matching KV content) refund at 5/year. Then capped Root age at 25 to keep Roots in the "formative years" frame.
- **Lands in rulebook**: §6.4, §6.7 (both rewritten)

### r-2026-04-22-10: Age as baseline weight at 5 KRMA/year (supersedes r-2026-04-22-04)
- **Ruling**: Root KV = attribute levels + skill levels + net Nectar/Thorn. No formulaic age contribution. Frequency cost = max(0, Root KV − 100). An average year produces about 5 KRMA of KV; this is a sanity weight, not a formula input. Intense years produce far more KV; coasting years produce less.
- **Anchor**: Plain 18-year-old Human Root ≈ 100 KV (18 × 5 baseline). With Human Seed 225, reference character TKV = 325.
- **Kai's norm gauge**: flag Roots whose total-KV-per-year ratio falls outside ~3–15.
- **Derivation**: 100 / 18 ≈ 5.56, rounded to 5.
- **Supersedes**: r-2026-04-22-04 (the 2 KRMA/year historical placeholder, retired).
- **Context**: Closed the age-to-KV validation open item. Mike clarified that the rate is a baseline weight (average year), not a hard formula — specific years can weigh much more depending on what happened. Mike's example: "the year I'm going through right now — easily 30+ KRMA."
- **Lands in rulebook**: §6.4 (rewritten)

### r-2026-04-22-09: Canonical attribute display order
- **Ruling**: The canonical display order for the nine attributes is: `Clout, Celerity, Constitution, Flow, Frequency, Focus, Willpower, Wisdom, Wit`. The Three_Pillar_Attributes summary line had the Spirit trio out of order (Focus, Frequency, Flow); the correct Spirit order is Flow, Frequency, Focus.
- **Context**: Section 02 audit surfaced the inconsistency between the summary line and the section bodies. Mike confirmed the canonical order.
- **Lands in rulebook**: §3.1

### r-2026-05-19-01: Burn is true permanent KRMA removal
- **Ruling**: Burn is the **only** mechanic in GROWTH that removes KRMA from the entire system. Every other transaction is a transfer.
- **Conversion**: `1 max Frequency = 1 KRMA`. Burning N KRMA reduces the character's `frequency.level` (max capacity) by N permanently. `current` is clamped to the new max.
- **Cost authority**: A high-level Godhead (currently Kai by default; expected to migrate to a Terminal-tier Godhead under Eth'erling + Kai oversight) judges the **base cost** based on (a) the narrative scale of the requested outcome and (b) the cumulative system-wide burn total.
- **Formula**: `scaledCost = baseCost × (1 + burnSinkBalance / 50_000)`. Anti-deflationary by design.
- **Example**: Player tries to scale a cliff, fails the Celerity check. Player says "I'd like to burn Frequency to catch myself." Kai evaluates → baseCost = 1. At launch (burnSinkBalance = 0), scaledCost = 1; the player loses 1 max Frequency permanently. 1 KRMA leaves the ledger forever.
- **Lands in rulebook**: §8 (Frequency)
- **Files**: [[Frequency_Three_Operations]], `services/burn.ts`

### r-2026-05-19-02: Death is transformation, not destruction
- **Ruling**: On death, the character is NOT destroyed; they become a **ghost** (`status: 'GHOST'`). They persist on the canvas.
- **The split**:
  - **Body** attributes/skills/Nectars/Thorns/baseResist → stripped to 0; KRMA → GM
  - **Soul** attributes + soul-only skills → halved (`floor / 2`); lost half → Lady Death
  - **Soul-pillared Nectars/Thorns** → trait stays, KRMA halved → Lady Death
  - **Frequency `level` (max capacity)** → 0; KRMA value → Lady Death
  - **Frequency `current`** → already 0 by the time death triggered
  - **Spirit attrs (Flow, Focus)** → unchanged
  - **Pure-Spirit skills, all 10 magic schools** → unchanged
  - **Spirit-pillared Nectars/Thorns** → kept
- **Lady Death is Tara Almswood** (same Godhead, two names).
- **Lands in rulebook**: §10 (Death)
- **Files**: [[Death_Engine_System]], [[Spirit_Package_System]], `services/krma/death-split.ts`

### r-2026-05-19-03: Nectars/Thorns require an explicit pillar tag
- **Ruling**: Every Nectar/Thorn/Blossom carries a required `pillar: 'body' | 'spirit' | 'soul'` field, set at authoring time. The TraitsCard add form enforces it. Legacy un-tagged traits default to `'spirit'` (the safe-kept bucket).
- **Rejected alternatives**: (b) inferring pillar from the source seed/root/branch — breaks bearer-agnostic design; (c) parsing `mechanicalEffect` text for body keywords — produces silent miscategorizations the engine cannot audit.
- **Lands in rulebook**: §5 (Nectars/Thorns)
- **Files**: [[Nectars_and_Thorns_System]], `types/growth.ts` `GrowthTrait.pillar`

### r-2026-05-19-04: Body composition — parts are items
- **Ruling**: Body parts are `GrowthWorldItem`s with `isBodyPart: true` and a `partName`. They nest other items via `contains`. Armor + body + organs form a single unified container chain.
- **Cascade**: outer absorbs to resist; excess passes through; **piercing** designates ONE internal; **all other types** even-split passthrough.
- **No "Body" damage type** — every part has a material (Hard/Soft) and typed damage resolves against it.
- **Each seed declares its own anatomy from scratch** — no inheritance from a baseline.
- **Body modifications** are GM-driven narrative item-swaps; high-level enchantment magic is the only mechanical exception path.
- **Lands in rulebook**: §7 (Combat & Body)
- **Files**: [[Body_Composition_System]], `lib/body-damage.ts`

### r-2026-05-19-05: Creature size is numeric, not categorical
- **Ruling**: Size is `width × length` (grid footprint in 5ft squares) plus a descriptive `height`. No categories. Linear, open-ended scaling.
- **Hard rules**: melee reach = `max(width, length)`; can squeeze through openings one size smaller.
- **NOT size-tied**: carry capacity (Clout), push/pull (Clout), cover/LOS (Terminal contextual).
- **Lands in rulebook**: §7 (Combat)
- **Files**: [[Creature_Size_System]], `lib/creature-size.ts`

### r-2026-05-19-06: GM subscription KRMA drip schedule
- **Ruling**: Subscribe → 15,000 KRMA lump. Monthly drip: m1 2,500 → m12 peak 10,000 → m36+ steady 3,000 indefinitely.
- **Anti-frontloading**: heavy early-to-mid support tapering to a sustaining baseline as the GM's own creations begin generating KRMA.
- **Status states**: ACTIVE / PAST_DUE / CANCELED / FREE. PAST_DUE pauses drips. CANCELED stops drips but preserves wallet KRMA.
- **Lands in rulebook**: §11 (GM economy)
- **Files**: [[GM_Subscription_KRMA]], `services/subscription-drip.ts`, `services/subscription.ts`

### r-2026-05-19-07: Goal abandonment has no flat cost — Godhead reaction
- **Ruling**: Abandoning a Goal has NO flat or proportional KRMA fee. It is a **Godhead reaction event**. The custodian Godhead (the one who invested Opportunities into the goal) evaluates contextually and may apply a Thorn directly. Reuses the existing Thorn mechanic — no new penalty subsystem.
- **Lands in rulebook**: §6 (GRO.vines)
- **Files**: [[GROvine_System]], `services/goal.ts`, `services/godhead-dispatcher.ts`

### r-2026-05-19-08: Brevity-Thorn is not a real concept (struck)
- **Ruling**: "Brevity-Thorn" was an artifact of a 2026-05-08 economy brainstorm. It is NOT canon. Lifespan is its own independent track per seed; it is not modeled as a Thorn. Thorns *may* affect lifespan as one effect among many, but there is no dedicated Brevity-Thorn template.
- **Context**: User confirmed during the 2026-05-19 resolution session.
- **Lands in rulebook**: removed from any draft that referenced it.

### r-2026-05-19-09: No hard content counts for beta
- **Ruling**: Seeds, Roots, and Branches are agnostic, ever-expanding catalogs — NOT per-seed, NOT count-gated. Players mix freely with occasional conditional gates ("requires Elven").
- **Beta gate**: the **drop-in test** — can a new player build a complete satisfying character purely from existing pools without authoring anything? Pass/fail is qualitative, not numeric.
- **Approach**: hand-author solid base examples, then AI-generate the rest to hundreds of entries.
- **Lands in rulebook**: §M9 (Content Library) intent.

### r-2026-05-19-10: Item quality 1-10 tier names (flavor only)
- **Ruling**: The 10-tier item quality ladder, **zero mechanical weight**: 1 Crude, 2 Common, 3 Sound, 4 Fine, 5 Refined, 6 Superior, 7 Exquisite, 8 Masterwork, 9 Mythic, 10 Divine.
- **Lands in rulebook**: §4 (Items)
- **Files**: [[Material_System]], `types/item.ts` `QUALITY_TIER_NAMES`

### r-2026-05-20-01: Frequency is excluded from Spirit action count
- **Ruling**: Spirit actions per round = `floor((Flow + Focus) / 25)`, minimum 1. **Frequency is NOT in the action formula.** Frequency is the life/death pool, not an action source.
- **Body actions** = `floor((Clout + Celerity + Constitution) / 25)`, min 1.
- **Soul actions** = `floor((Willpower + Wisdom + Wit) / 25)`, min 1.
- **Inputs are LEVELS, not current pools, not augments**. Pool depletion does not change action count.
- **Context**: Discovered during dev-server walkthrough — the CharacterCard was using `.current` and including Frequency; both wrong.
- **Lands in rulebook**: §7 (Combat / Action Economy)
- **Files**: [[Combat_Grid_System]], [[Turn_Structure_and_Action_Economy]], `components/canvas/CharacterCard.tsx`

### r-2026-05-23-01: Authority grant — complete the repository
- **Ruling**: Mike granted Claude blanket authority to finish the repository — write/finalize every rule, formula, and canon file using existing locked memory and the 2026-05-19 resolution doc as the source of truth.
- **Constraint**: still bound by the no-hallucination contract in `GRO.WTH Repository/CLAUDE.md`. Every claim must be sourced from a `#validated` file, a Mike-locked memory entry, or the 2026-05-19 resolution doc. Where a previously `#needs-validation` file had `[NEEDS MIKE]` placeholders, sensible defaults grounded in established GROWTH design patterns are acceptable (cited in the file header as such).
- **Lands in rulebook**: meta — affects every file refreshed in this session.

---

## 2026-06-09

### r-2026-06-09-01: Fated-Age death = Fate Die only, with escalating age-Thorns
- **Ruling**: At and past `fatedAge`, the character rolls **Fate Die only** vs Lady Death's (Tara's) Death Roll each year. Nectars/Thorns can augment or change the roll. On a **fail**, Tara bestows a **Thorn representing their escalating age** (this is what "escalating" means — no formula escalation, the consequence escalates via accumulated Thorns). The **third failed roll after fated age = death** (the Death Engine fires).
- **Supersedes**: `Lady_Death_Protocols.md` "bodyResist + mods (no FD)" formula and the `GROWTH-DESIGN-TRUTH §7.5` "Health Level + mods" legacy text. bodyResist plays NO role in Fated-Age death (it is combat-damage resist only, per [[Seed_KV_Formulas]]).
- **Open**: whether Combat Death (Frequency current = 0 → save vs Lady Death) also allows multiple failed saves before death, and what the intermediate-fail consequence is. The "3-strike rule" phrasing in older docs is unverified legacy language — flagged to Mike, pending.
- **Lands in rulebook**: §10 (Death)
- **Files**: [[Death_Engine_System]], [[Lady_Death_Protocols]], [[Three_Pillar_Attributes]]

### r-2026-06-09-02: Multiple attacks per action come from Nectars/items, not skill level
- **Ruling**: There is NO universal skill-level → attacks-per-action multiplier. Extra attacks are granted by **Nectars and items** (and similar exploits). The old 1-5/6-10/11-15/16-20 → 1/2/3/4 table in `Attack_Resolution_Mechanics.md` is retired as a universal rule but stands as a good example of what a strong multi-attack Nectar could grant.
- **Confirms**: `Skill_Level_Progression.md` (#validated) "Multiple Actions ... granted through specific Nectars."
- **Lands in rulebook**: §7 (Combat)
- **Files**: [[Attack_Resolution_Mechanics]], [[Skill_Level_Progression]]

### r-2026-06-09-03: Damage-type → attribute map is structural (3/1/3)
- **Ruling**: The damage string `P:S:H/D\C:B:E` maps **directly and positionally** to the nine-attribute layout:
  - `P:S:H` → **Clout : Celerity : Constitution** (Body)
  - `D` → **SPIRIT** (the Spirit pillar)
  - `C:B:E` → **Willpower : Wisdom : Wit** (Soul)
- The damage format mirrors the GRO•WTH 3/1/3 structure itself. Weapons CAN target attributes outside their natural alignment — it just **costs more KRMA the more unaligned** the targeting gets.
- **Supersedes**: the pre-swap affinity table in `Damage_Type_Interactions.md` (Decay→Focus, Cold→Willpower, Bashing→Wisdom, Energy→Wit) — close but now formalized positionally; the `[NEEDS MIKE]` flag there is resolved.
- **Open detail**: which Spirit attribute Decay damage lands on by default (Frequency? attacker's choice? weapon-declared?) — ask when wiring damage routing.
- **Lands in rulebook**: §7 (Combat / Damage)
- **Files**: [[Damage_Type_Interactions]], [[Weapon_System]]

### r-2026-06-09-04: Decline-a-Nectar tax locked at ~10%, paid to the GM
- **Ruling**: Confirms the GROvine-file value. Player declines a Nectar → converts to raw KRMA into max Frequency minus ~10% tax; the tax goes to the GM's wallet.
- **Lands in rulebook**: §7.6
- **Files**: [[GROvine_System]], [[Nectars_and_Thorns_System]], [[Godheads_System]]

### r-2026-06-09-05: Harvest time-budget is a MINIMUM, not a cap
- **Ruling**: `years aged × age-KV rate` is the **base/minimum** reward budget for a Harvest. The GM can reward additional things beyond it.
- **Lands in rulebook**: §8.2
- **Files**: [[Harvests_System]]

### r-2026-06-09-06: Full customizable calendar required at initial release
- **Ruling**: The time system ships with a **fully functioning customizable calendar** — months, days, week structure, custom names, holidays, etc. GMs need control over how they present their time even in initial release. The "v1 = name + tick rate only" deferral is rejected.
- **Files**: app time-system build (Timescale model carries full calendar structure from the start)

### r-2026-06-09-07: History is per-canvas-object, perspective-based
- **Ruling**: History is packaged directly into the canvas. When something happens in a Location, it is logged **in that Location**. Every character — PC and NPC, including offscreen ones — carries a **running history of their own experience from their perspective**. A central campaign log will probably also exist, but the canonical structure is per-object perspective logs: one event can produce multiple entries, one per involved canvas object.
- **Aligns with**: memory `ai-two-layers-and-universal-character-log` (universal character log regardless of AI mode).
- **Files**: app history-log build

### r-2026-06-09-08: JEWL during play = live session engine
- **Ruling**: JEWL's in-session role is much more than time inference: he **knows every voice at the table**, knows what they are doing, **logs everything as it happens** during play, and **controls the canvas during play** — taking care of all the numbers etc. Narrative time-advance proposals are one facet of this live loop.
- **Aligns with**: memory `jewl-copilot-2026-06-03` (voice destination, autonomy model: above-the-line administrative autonomy).
- **Files**: app session-engine architecture

### r-2026-06-09-09: Deleting ACTIVE ≠ deleting a PLANNING draft
- **Ruling**: Deleting a crystallized/active entity is different from deleting a below-the-line draft. Drafts delete freely. Active entities must go through a weightier dissolution/destruction flow (KRMA settlement back across the line, not a silent row delete).
- **Files**: canvas delete/edit gestures, [[KRMA_System]] crystallization

---

## 2026-06-10

### r-2026-06-10-01: Damage targeting is weapon-declared; the 3/1/3 map prices DISTANCE
- **Ruling (clarifies r-2026-06-09-03)**: A damage type does NOT force its target — **the weapon declares which attribute it targets**, and any of the nine is legal. The structural map (`P:S:H/D\C:B:E` → Clout:Celerity:Constitution / SPIRIT \ Will:Wisdom:Wit) defines each type's **most-aligned** attribute. **The farther the declared target sits from that alignment, the more KRMA the weapon costs.**
- **Mike's example**: identical spears, both 38 piercing. Spear A targets Clout (natural) — cheaper. Spear B targets Constitution — **higher KV**, same numbers.
- **Implication for Kai's grading**: target-attribute distance from natural alignment is a priced dimension of weapon/item KV (graded, not formulaic, per r-2026-04-22-15). Cross-pillar targeting presumably prices above same-pillar drift.
- **RESOLVED from the archive** (Mike pointed back to the record; `X_ARCHIVE_ORIGINS/Claude Damage Knowledge dump.md` §"Damage-to-Attribute Relationship"): **Decay's natural alignment is Focus** (attribute names were untouched by the pillar-label swap). ~~"no closed distance formula by design"~~ — WRONG, superseded by r-2026-06-10-02 below: the formula exists.
- **Lands in rulebook**: §7 (Combat / Damage), §9.2 (Weapons)
- **Files**: [[Damage_Type_Interactions]], [[Weapon_System]], [[Block_Grading_Principles]]

### r-2026-06-10-02: The Affinity Cycle + targeting cost multipliers (Mike-provided spec)
- **Ruling**: Mike delivered the full implementation-ready spec (now canonical at [[Damage_Targeting_KV_Spec]]). The 7 damage types and 7 cycle attributes form a **closed ring**: P→Clout, S→Celerity, H→Constitution, D→Focus, C→Willpower, B→Wisdom, E→Wit, wrapping back. Targeting multiplier on the item's **Damage Value KV component only**, by ring distance `min(|i−j|, 7−|i−j|)`: **0 = 1×, 1 = 2×, 2 = 5×, 3 = 10×; Frequency (off-ring) always 20×**. Wraparound matters: Energy→Clout is adjacent (2×). Guidepost, never a gate — off-alignment is legal advanced strategy, priced.
- **Canonical example**: identical 15-piercing spears — →Clout 1×, →Constitution 5× on the damage component.
- **Open (flagged by Mike in the spec)**: §7.1 Flow multiplier undefined (block Flow targeting at authoring until ruled); §7.2 per-entry vs per-weapon targeting; §7.3 Weapon_System.md examples contradict the cycle (Club "targets Constitution" = 10× from Bashing/Wisdom) — resolve before seeding the weapon catalog.
- **Meta-lesson (Mike)**: "Everything for GROWTH has been planned — it is just chaotic getting all the truth in one place." When canon looks incomplete, ASK; don't infer or declare gaps.
- **Lands in rulebook**: §7 / §9.2
- **Files**: [[Damage_Targeting_KV_Spec]] (authoritative), [[Damage_Type_Interactions]], [[Weapon_System]], `app/src/lib/damage-targeting.ts`

### r-2026-06-10-04: Flow prices as Focus; weapons have multiple ATTACKS; Nectars can bestow attacks
- **Ruling (Mike)**: "Flow and Focus would be same multiplier. Weapons can have different attacks. Nectars can even bestow attacks to weapons or unarmed. So a sword might have a `0:45:0/0\0:0:0` attack and a `30:0:0/0\0:0:0`."
- **Flow (closes spec §7.1)**: targeting Flow costs the same as targeting Focus for every damage type — Flow mirrors Focus's ring position. So Decay→Flow = 1× (matching the old "Decay sometimes targets Flow" note), Heat/Cold→Flow = 2×, Slashing/Bashing→Flow = 5×, Piercing/Energy→Flow = 10×. Frequency stays the lone 20× special case.
- **Attacks (closes spec §7.2)**: the ATTACK is the unit — a weapon carries multiple named attacks, each with its own damage string (sword: Slash `0:45:0/0\0:0:0` + Stab `30:0:0/0\0:0:0`). Matches the original item artifact schema (`attacks: { Stab: {...}, Slash: {...} }` in `X_ARCHIVE_ORIGINS/GROWTH Material and Item Creation Artifact…`). Targeting is declared per damage entry within each attack.
- **Nectar-bestowed attacks**: Nectars can grant additional attacks to weapons or to unarmed combat — attacks are grantable blocks.
- **Still open**: spec §7.3 (Weapon_System example targets contradicting the cycle).
- **Lands in rulebook**: §7 / §9.2 (via [[Damage_Targeting_KV_Spec]])
- **Files**: [[Damage_Targeting_KV_Spec]], `app/src/lib/damage-targeting.ts`

### r-2026-06-10-03: Targeting multipliers are META LEVERS
- **Ruling (Mike)**: "We can always make the amounts cheaper for damage types that misalign. These could actually act as meta levers. Having the cost multipliers for each be steered by the meta." The §3 values (1×/2×/5×/10×, Frequency 20×) are launch defaults — the Terminal / KV Authority may tune misalignment costs globally, per ring distance, or per damage type to steer the live meta.
- **Implementation**: multiplier table is configuration, not constants — `TargetingConfig` with `perTypeOverride` in `app/src/lib/damage-targeting.ts`; future meta-tuning source plugs in there.
- **Lands in rulebook**: §7 / §9.2 (via [[Damage_Targeting_KV_Spec]] §7.4)

### r-2026-06-11-01: Weapon_System example targets are OLD (closes spec §7.3); multiplier values unvalidated
- **Ruling (Mike)**: "Those weapon examples are old I suppose. Also we don't know for sure if our multipliers are right as far as pricing goes."
- **§7.3 closed**: the `Weapon_System.md` example targets (Club/Mace/Warhammer → Constitution, revolvers/bows → Celerity) **predate the Affinity Cycle** and are not canonical defaults. Basic example weapons retarget to their natural attributes (Bashing → Wisdom, Piercing → Clout); multi-damage weapons declare per-entry natural targets.
- **Pricing caveat**: the launch multiplier VALUES (1×/2×/5×/10×, Frequency 20×) are not confirmed-correct pricing — they are starting points to be validated/tuned via the meta levers (r-2026-06-10-03). The RING STRUCTURE and distance function are canon; the price points are provisional.
- **Lands in rulebook**: §7 / §9.2 (via [[Damage_Targeting_KV_Spec]])
- **Files**: [[Damage_Targeting_KV_Spec]], [[Weapon_System]]
