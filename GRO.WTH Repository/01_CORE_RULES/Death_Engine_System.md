# Death_Engine_System.md

**Status:** #validated
**Source:** Mike resolution session 2026-05-19 ([[NEEDS-MIKE_RESOLUTIONS_2026-05-19]]); implemented in `app/src/services/krma/death-split.ts` (`executeDeathSplit`, `transformCharacterToGhost`) and `app/src/services/krma/evaluator.ts` (`calculateDeathSplit`).
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` §10 (Death) — needs sync to this file
**Last Updated:** 2026-07-11

---

# Death Engine — Transformation, Not Destruction

## The single most important rule

**Death is not the end of a character.** It is a transformation. The character keeps existing — as a **ghost** — and remains on the GM's canvas. Their `status` flips from `ACTIVE` to `GHOST`. The body is gone; the spirit remains; the soul is diminished; the connection to the metaverse (Frequency) belongs to Lady Death.

Death is also a **transfer**, not a removal. Every KRMA value involved still exists in the ledger after the event. The only mechanic that ever removes KRMA from the system entirely is [[Frequency_Three_Operations|Burn]].

## When does death trigger?

There are exactly two paths:

1. **Facing Death (locked Mike 2026-06-11, rulings r-2026-06-11-02 + r-2026-06-11-05)** — triggered by **Frequency `current` ≤ 0** (with no Effort/spend rescue) OR **a vital body part destroyed**. **ONE roll against Lady Death** fires (character's **Fate Die vs Tara's chosen die** — `bodyResist` plays no role, r-2026-07-11-01) — only once even if both triggers land simultaneously. Success → survive: destroyed vital part restores one condition, and 1 Frequency is restored if it was at 0; **Tara may still attach a trigger-related Thorn or Negative Blossom**. Failure → the engine fires. One roll, binary; fated age plays no role here.
2. **Fated Age death (locked Mike 2026-06-09, ruling r-2026-06-09-01)** — at and past the seed's `fatedAge`, the character rolls **Fate Die vs Tara's chosen die** each year (Nectars/Thorns can augment) (r-2026-07-11-01). On each fail, Tara bestows a **Thorn representing their escalating age**. The **third fail after fated age** fires the engine. bodyResist plays no role in this path.

Both paths converge into the same engine. They differ only in narrative framing and which Godhead leads the post-death conversation (Lady Death herself for Fated Age; Kai often weighs in for combat).

---

## The split

When the engine fires, the character is resolved component-by-component. Each component is either **stripped to GM**, **halved with the lost portion routed to Lady Death**, **kept on the character (ghost form)**, or **fully transferred to Lady Death**.

### Body components → **GM**

| Component | What happens to the character | Where the KRMA goes |
|---|---|---|
| Clout / Celerity / Constitution attributes | Each set to level=0, current=0, augments=0 | Full KRMA value → campaign GM wallet |
| Body-governed skills (any skill with a body governor: Clout, Celerity, Constitution) | Removed entirely from the skill list | Full KRMA value → campaign GM wallet |
| Body-pillared Nectars/Thorns (`pillar: 'body'`) | Removed from the traits list | Full KRMA value → campaign GM wallet |
| `vitals.baseResist` | Set to 0 | KRMA value (baseResist × 2) → campaign GM wallet |
| Body parts (the entire [[Body_Composition_System|item-anatomy]] tree) | Body is "gone" narratively; the tree may be retained for memorial/UI purposes but contributes no mechanics | No additional ledger event (the body's KRMA was already captured via baseResist and Body attributes) |

### Soul components → **Halved, lost half to Lady Death**

| Component | What happens to the character | Where the KRMA goes |
|---|---|---|
| Willpower / Wisdom / Wit attributes | Each level halved (`Math.floor(level / 2)`); current clamped to new max; augments preserved | Lost half's KRMA → Lady Death system wallet |
| Soul-governed skills (any skill with **only** soul governors and no body governor) | Each skill's level halved (`Math.floor(level / 2)`) | Lost half's KRMA → Lady Death system wallet |
| Soul-pillared Nectars/Thorns (`pillar: 'soul'`) | The trait stays on the ghost as identity, but its KRMA value is halved | Lost half's KRMA → Lady Death |

### Frequency capacity → **Lady Death**

| Component | What happens | KRMA destination |
|---|---|---|
| Frequency `level` (max capacity) | Set to 0. A ghost has no Frequency unless a future spirit-economy path restores it (none built). | Full KRMA value of the capacity → Lady Death wallet |
| Frequency `current` (the pool) | Already 0 by the time of death (death triggered because pool hit 0 in combat, or because Fated Age fired during play) | No additional event |

### Kept on the ghost — no transfer

| Component | Why it stays |
|---|---|
| Spirit attributes Flow and Focus | The character's connection to the world and their direction of attention persist. These are explicitly NOT transferred. |
| Spirit-pillared Nectars/Thorns (`pillar: 'spirit'`) | Identity-defining; the ghost remains the same person. |
| Non-body skills that are **purely Spirit-governed** | Skills like Lore, Insight, Investigation that key off Flow/Focus stay intact. |
| Magic school skills (all 10) | All ten schools are Spirit-pillared by design; the ghost keeps every level. |
| Traits with no pillar tag (legacy un-tagged) | Default to spirit at routing time — the safe-kept bucket. New authoring requires explicit pillar selection. |

### Mixed-governor skills

A skill governed by both body and soul (rare but possible — e.g., "Intimidation" governed by Clout + Willpower) is treated as **body** for stripping purposes. Body presence dominates in mixed-governance because body is the more aggressive rule and applies first.

---

## What the character looks like as a ghost

Immediately after the engine fires:

- **All body attributes:** 0
- **Frequency:** 0 / 0 (max and current both at 0)
- **Soul attributes:** each halved
- **Spirit attributes:** unchanged
- **Body skills:** gone
- **Soul-only skills:** each halved
- **Pure-Spirit skills + magic schools:** unchanged
- **Body traits:** gone
- **Soul/Spirit traits:** still listed
- **Base resist:** 0
- **Body anatomy:** retained for memorial but inert
- **TKV:** automatically recomputed; will be lower than it was alive
- **status:** `GHOST`

A ghost cannot take Body actions (the formula `floor((Clout+Celerity+Constitution)/25) min 1` yields 1, but conditions like Weak/Clumsy/Exhausted are all simultaneously active because all three pools are at 0). They can take Spirit actions (Flow + Focus) and Soul actions (halved Willpower/Wisdom/Wit). They cannot Burn. They cannot Spend Frequency. They cannot Deplete (already empty).

In play, a ghost is roughly a "narrative weight" entity — present, communicating, influencing — but not a combat participant in any meaningful sense. The GM can use them as advisor, witness, hauntologist, or Plot Device. Some campaigns may resurrect them (via narrative magic, see [[Body_Composition_System]] §"Magic exception" — high-level enchantment can rebuild body-part items).

---

## Why this design

GROWTH is built on the Orthodox anthropological framework. The Body / Spirit / Soul split is not arbitrary: each pillar has its own destination at death, and those destinations reflect what each pillar *is*.

- **Body** is the costume of this life. It returns to the GM (the world) because it was always borrowed from the world.
- **Soul** is the persistent personhood — Willpower, Wisdom, Wit. It survives but is **diminished**. Half is lost to Lady Death because death is *real* loss, not a free transition. The half retained is the seed that grows into the next life.
- **Spirit** (Flow / Frequency / Focus) is the connection to the divine. Flow and Focus — the orientation of grace — stay intact: the character is still themselves and still attended-to. Frequency — the literal capacity to receive — is the price of crossing. It belongs to Lady Death.

This isn't a numbers exercise. The math is in service of the parable.

---

## Implementation cross-reference

| Game term | Code surface |
|---|---|
| Death-split manifest | `services/krma/evaluator.ts` → `calculateDeathSplit(character, tkv)` |
| Skill split sub-rule | same file → `calculateSkillSplit(name, kv, governors)` |
| Ledger writes + character mutation | `services/krma/death-split.ts` → `executeDeathSplit(characterId, campaignId, deathContext, actorId)` |
| Pure ghost transformer | same file → `transformCharacterToGhost(character)` |
| Preview without firing | `previewDeathSplit(characterId, campaignId)` → returns the manifest read-only |
| API entry | `POST /api/characters/[id]/death` (execute) and `GET /api/characters/[id]/death` (preview) |
| UI confirmation modal | `components/krma/DeathSplitModal.tsx` |
| Trait pillar source-of-truth | `GrowthTrait.pillar` (`types/growth.ts`); see [[#Trait pillar tagging]] |

### Trait pillar tagging

Every Nectar/Thorn/Blossom carries an explicit `pillar: 'body' | 'spirit' | 'soul'` field, set at authoring time (the [[Forge_Authoring_Pipeline]] and the canvas TraitsCard both enforce it). Legacy traits without a tag default to **spirit** at death-routing time — the safe-kept bucket. The death engine never silently strips an un-tagged trait.

---

## Links

- Related: [[Spirit_Package_System]], [[KRMA_System]], [[Lady_Death_Protocols]], [[Body_Composition_System]], [[Frequency_Three_Operations]], [[Three_Pillar_Attributes]]
- References: [[Nectars_and_Thorns_System]] (pillar field), [[Godheads_System]] (Lady Death's role)
- Examples: combat-death and Fated-Age-death scenarios pending in [[09_EXAMPLES_LIBRARY]]
- Memory: `burn-mechanic-locked-2026-05-19`, `death-engine-transformation-2026-05-19`, `trait-pillar-field-2026-05-19`
