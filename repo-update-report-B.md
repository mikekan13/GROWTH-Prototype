# Repository Update Report — Agent B (Seeds / KV / Formulas)

**Date:** 2026-05-10
**Scope:** Seeds, KV formulas, attribute mechanics — make repository self-sufficient for Nectar/Thorn authoring.

---

## 1. Files Modified

| File | Change Summary | Approx. Lines Added |
|---|---|---|
| `GRO.WTH Repository/02_CHARACTER_CREATION/Seeds_Roots_Branches_System.md` | Full rewrite. Added: 8-component seed list (augs not levels, base-resist semantics, skills-rare rule, body structure note); locked seedKV formula + per-component table; Approach 2 fated-age formula + worked Elven example; TKV Tier Framework (Low/Med/High/Premium); negatives-only-in-Thorns rule; augs vs. levels canon note; trainable mechanic crosslink; Age-Cost Ratio decoupled from fatedAgeKV. Status flipped to `#needs-validation`. | ~80 net additions (file went from 100 → ~135 lines) |
| `GRO.WTH Repository/02_CHARACTER_CREATION/Three_Pillar_Attributes.md` | Added new "Augs vs. Levels (canon)" subsection under Attribute Pool Mechanics, defining levels (Roots/Branches + trainable mechanic) vs. augs (Seed contribution, 1 KRMA each, no refund negatives). | ~10 |
| `GRO.WTH Repository/07_REFERENCE_TABLES/KRMA_Costs_Table.md` | Added "Seed Component Costs (canon — locked 2026-05-08 / 2026-05-09)" section with full per-component table, application formula, Age-Cost Ratio decoupling note, TKV Tier Anchors table. Annotated legacy Body/Mind Attribute rows as "see Seed Component Costs below." Crosslinks added. | ~50 |
| `GRO.WTH Repository/01_CORE_RULES/Frequency_Three_Operations.md` | Added hoarding-doesn't-mechanically-kill clarification block under "Spend" operation; added trainable-mechanic reference. Replaced misleading "Hoarding kills you" tagline with "philosophical, not mechanical" framing per `memory/frequency-hoarding-clarified`. | ~5 |
| `rulebook/rulebook.md` (line 374) | Marked the Fated Age KV open item as **RESOLVED 2026-05-08** with locked formula `ceil(fatedAge × 0.5)` and worked examples (Human +40, Elven +500, Celestial +750, Goblinoid +23). Crosslinked to new `Seed_KV_Formulas.md`. | ~1 line replaced |

## 2. Files Created

| File | Purpose |
|---|---|
| `GRO.WTH Repository/02_CHARACTER_CREATION/Seed_KV_Formulas.md` | Single canonical reference for the seedKV formula and per-component KRMA costs. Includes: locked formula, per-component table, Approach 2 fated-age research summary, Fate Die trait limit, TKV Tier Framework, worked Elven example (476 seedKV), 7-step authoring checklist for new seeds. Designed so a fresh Claude session can compute a seedKV from this file + `Seeds_Roots_Branches_System.md` + `Nectars_and_Thorns_System.md` alone. Status: `#needs-validation`. ~125 lines. |

## 3. Out-of-Scope Issues Flagged (parallel agent's domain — NOT touched)

These were noticed while working in scope but belong to the Nectars/Thorns/Exploits/Godhead-mechanics agent:

1. **`Nectars_and_Thorns_System.md`** is referenced everywhere I wrote, but I did not open/audit it. It needs to (a) explicitly state Thorns are LIENS not refunds, (b) cite the +1-mod ≈ 5 KV baseline anchor, (c) cover the "play-defining exploit" principle from `WIP-15-seeds-batch-2026-05-09.md` §5, (d) mention the Fate-Die-caps-trait-count rule.
2. **GM "flag overpowered" meta-mechanic** is mentioned in the 15-seeds briefing (§7, "GM flag → Et'herling review → Kai pays out of her own wallet if confirmed"). I found no canon file for it. Parallel agent should create one.
3. **Owner-Godhead schema** (Kai / Et'herling / Lady Death / etc. as block owners) is referenced in many places but not centrally documented. Probably belongs in `Godheads_System.md`. Parallel agent's call.
4. **Forge authoring chain** (Selva → Creator → Kai → Et'herling, mandatory, GMs submit/approve only) is cross-referenced from `memory/forge-authoring-flow` but I did not find a canon file for it. Probably a Godhead-mechanics doc.

## 4. Open Questions for Mike

1. **Body Attributes (4 KRMA/pt) and Mind Attributes (8 KRMA/pt)** in the legacy Character Creation Costs table of `KRMA_Costs_Table.md` — are these now fully superseded by the 1 KRMA/aug Seed-component rate, or do they remain in force for **post-creation** attribute purchases (i.e., advancement-time attribute increases as a separate-from-Seed economy)? I annotated them as "legacy" pointing to Seed Component Costs but did not delete them, since they may still apply to `Attribute Enhancement` mid-play. Confirm intent.
2. **Status tag for the new `Seed_KV_Formulas.md`** — I used `#needs-validation` per the briefing's instruction to mark new canon. If you want this promoted to `#validated` after review, flag it. (Repository CLAUDE.md mandates this be your call, not Claude's.)
3. **Skill grants beyond Apprentice/Novice/Student tier** — the briefing references only d2/d3/d4 starting skills for seeds. Are higher tiers ever seed-grantable, or capped at d4 by canon? I documented d2/d3/d4 only.
4. **Negative augs on Seeds** — locked memory says "could be possible, atypical." Should I document a worked example or canonical use case, or leave it as just a permitted-but-discouraged option? I currently note them as atypical and direct refund-style negatives to Thorn liens instead.
