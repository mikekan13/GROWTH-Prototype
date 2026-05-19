# Rulings Log

Append-only record of Mike's design decisions. Each entry becomes a rule
in `rulebook.md`. Never delete; if a ruling is superseded, add a new
entry that references the old.

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
