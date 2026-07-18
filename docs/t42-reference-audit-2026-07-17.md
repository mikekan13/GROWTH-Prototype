# T42 Reference-Data Transcription Audit — 2026-07-17

**Verdict: T42 is BLOCKED on Mike. Do not seed from either source as-is.**

Produced by canon-keeper (full file reads, citations verified). This is the
report that would have driven the seed script; instead it shows the task's
premises don't hold.

## Why blocked

1. **`Condition_Effects_Reference.md` is `#needs-validation` (line 3), not
   post-audit**, and it does NOT define the 9 depletion conditions
   (weak / clumsy / exhausted / deafened / deathsDoor / muted / overwhelmed /
   confused / incoherent) under any name. It's an older taxonomy (monkey paws,
   strain, injury tiers, hit-location, magical, environmental, disease,
   social/economic — the last self-flagged as WTH-era stale, lines 9–12).
   The depletion table the app actually uses lives only in code
   (`lib/character-actions.ts` DEPLETION_CONDITIONS + CANON_CORE §2).
2. **`Complete_Materials_Reference.md` is `#needs-review`**, and the in-code
   catalog (`lib/materials.ts`, 23 materials) mismatches it on nearly every
   numeric field of all 13 name-matched materials (only exact agreement in the
   entire diff: Leather baseResist 17). 10 code materials are absent from the
   reference; 33 reference rows are absent from code.
3. **Three conflicting weight scales** coexist (reference 1–6 categories,
   materials.ts inline 1–6, material.ts WEIGHT_LEVEL_LABELS 0–10) and all
   contradict the lbs canon (weight-system-stripped-actual-lbs).

## Questions for Mike (mirrored in NEEDS-MIKE.md)

1. Where do the 9 depletion conditions' EFFECTS canonically live? (Not in
   Condition_Effects_Reference.md.)
2. `Material.valueRating` — transcribes the reference's Rarity category or its
   Base Value decimal?
3. Should `Material.baseWeight` be replaced with actual lbs before seeding?
4. Code's generic "Wood" / "Iron" / "Steel" — which reference variant is each
   (Softwood/Hardwood; Wrought/Cast; 3 steel grades), or split them?
5. "Crystal" and "Dragonscale" in code have no reference row — intentional
   additions or mistranscriptions?
6. Is the in-code materials catalog the tuned truth (reference needs updating
   to match code), or is the reference the truth (code gets re-seeded)?

## Full diff

The complete per-material, per-field diff table and the conditions inventory
are in the canon-keeper report; headline numbers:

- 13 materials matched by name — every one has at least one field mismatch;
  mods columns never match cleanly (tiered "Flexible 2/3" values dropped).
- Code-only materials (10): Hardened Leather, Canvas, Wood, Iron, Steel,
  Crystal, Chainmail, Plate, Darkwood, Dragonscale.
- Reference-only materials (33): Cotton, Hemp, Softwood, Hardwood, Antler,
  Flint, Tin, Brass, Wrought Iron, Cast Iron, Steel ×3, Kevlar, Carbon Weave,
  Graphene Fabric, Stainless Steel, Titanium, Carbon Fiber, Tungsten,
  Elven Silk, Dragon Leather, Platinum, Quartz, Sapphire, Diamond, Ruby,
  Adamant, Carbyne, Orichalcum, Crystallized Time, Solidified Dream,
  Thought-Steel.
