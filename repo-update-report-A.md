# Repo Update Report A — Nectars/Thorns/Exploits/Godhead Mechanics

**Date:** 2026-05-10
**Agent:** Parallel agent A (Nectars/Thorns/Godhead scope)

## 1. Files Modified

### `GRO.WTH Repository/02_CHARACTER_CREATION/Nectars_and_Thorns_System.md` (+72 lines)
- Frontmatter: status downgraded `#validated` → `#needs-validation` (new canon merged in), source list expanded, last-updated bumped to 2026-05-10.
- New section **"Paper-Version Name: Exploits"** with MTG-commander analogy.
- New subsection **"Play-Defining Principle"** with failure/success modes, 5-point authoring checklist, Elven gold-standard reference.
- New subsection **"Easy-to-Track Principle"** with binary/player-triggered/zero-threshold rules.
- New subsection **"Thorns Are Liens, Not Refunds"** with economic rationale and authoring rules.
- New subsection **"Seed-Bound vs Character-Bound"** with trait-flag schema.
- New subsection **"Synergy-Aware Grading"** with Elven worked example.
- New section **"Live Balance Adjustments"** cross-linking the GM Flag mechanic.
- Updated `Links` block with new cross-references.

### `GRO.WTH Repository/06_META_SYSTEMS/Godheads_System.md` (+34 lines)
- Frontmatter: sources/last-updated refreshed.
- MVP Godheads table extended with pronouns column; "Eth'erling" corrected to **Et'herling** throughout (also in the Balance pillar row).
- New subsection **"Et'herling — Elven Heritage"** documenting her pre-ascension Elven lineage and her natural sponsorship of Elven Nectars.
- New subsection **"Block Ownership Examples"** mapping typical block-ownership per godhead.
- New section **"Block Grading & Live Balance"** linking to the two new docs.
- Updated `Links` block.

## 2. Files Created

### `GRO.WTH Repository/06_META_SYSTEMS/GM_Flag_Mechanic.md` (~50 lines, #needs-validation)
The full 7-step GM-flag → Et'herling-review → Kai-rework-and-pays-reward governance flow. Includes rationale (distributed playtesting, self-correcting canon, Kai's economic skin-in-the-game), Godhead division of labor, and open implementation TBDs (reward magnitude, anti-abuse, migration UX). Marked as a post-beta feature.

### `GRO.WTH Repository/06_META_SYSTEMS/Block_Grading_Principles.md` (~70 lines, #needs-validation)
Synergy-aware grading framework. Covers: the Selva→Creator→Kai→Et'herling chain, why blocks can re-grade in different contexts, the Elven Diminishing×First-Born worked example, negatives-only-in-Thorn-liens rule, locked seed-cost formulas table, and authoring workflow reminders.

## 3. Out-of-Scope Issues Flagged (do NOT edit per instructions)

- **`07_REFERENCE_TABLES/KRMA_Costs_Table.md`** — needs cross-check against the locked formulas in `WIP-elven-seed-design.md` (Fate Die d4=5/d6=10/d8=20/d12=40/d20=80; Fated Age = ceil(age×0.5); 1 aug = 1 KRMA; Base Resist = 2 KRMA/pt). If values differ, the WIP docs win.
- **`02_CHARACTER_CREATION/Seeds_Roots_Branches_System.md`** — likely needs the seed-bound trait flag schema (`source`, `bound`, `permanence`, `origin_godhead`, `lien_amount`, `lien_recipient`) and the "seed-bound traits change with seed" rule. Other agent's scope.
- **`02_CHARACTER_CREATION/Three_Pillar_Attributes.md`** — Frequency operations (Spend/Deplete/Burn) intersect with Diminishing's "cannot Spend or Burn Frequency that would take Max ≤ age" rule. Should reference Diminishing as the canonical example. Other agent's scope.
- **`Frequency_Three_Operations.md`** (if it exists) — same intersection. Other agent.
- **`06_META_SYSTEMS/Lady_Death_Protocols.md`** — Thorn-lien collection at death is already partially in Godheads_System but should also live here. Borderline scope; I left it alone since it's tagged Lady-Death-specific. Recommend a brief lien-settlement subsection.
- **Blossoms** — referenced repeatedly via `[[Blossoms]]` but I did not verify that file exists or is up to date with the Exploits framing. Worth a check.

## 4. Open Questions for Mike

1. **KRMA-reward magnitude for confirmed OP flags**: memory suggests 10-50 KRMA scaled by impact; you've not locked a number. Should the reward scale with `lien_amount` of the reworked block? With campaign-count affected? Flat tier?
2. **Migration compensation**: when a flagged block is reworked metaverse-wide, do affected characters get KRMA back (the delta between old and new KV)? Who pays — Kai, or the campaign GM?
3. **Et'herling spelling**: I standardized on `Et'herling` (per the locked Elven seed doc and the memory file). The old Godheads_System used `Eth'erling`. Confirm Et'herling is canonical so I'm not propagating a typo.
4. **"Blossoms" canon**: do Blossoms count under the same Exploits framing as Nectars/Thorns? The paper-name "Exploits" memory implies yes, but Blossoms are temporary, not permanent. Should the play-defining/easy-to-track principles apply to them identically, or do temporary boons get a lighter standard?
5. **Skills granted by Seeds**: documented in the parallel agent's scope (`Seeds_Roots_Branches_System.md`). I noted the rule (rare-but-allowed, +10 to +14 KRMA range) only via cross-link. Confirm the parallel agent picks it up.
