# Spirit_Package_System.md

**Status:** #validated
**Source:** Mike resolution session 2026-05-19 (NEEDS-MIKE_RESOLUTIONS_2026-05-19, §1); supersedes the prior #needs-review draft. Implemented in `app/src/services/krma/death-split.ts`.
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` (death & inheritance)
**Last Updated:** 2026-05-23

---

# Spirit Package — What Survives a Character

## What it is

The **Spirit Package** is the set of components that remain on a character after death. It is the engine's answer to the question *"what is left of this person?"* — and the answer is, in short: **Spirit and most of Soul, but no Body and no Frequency capacity**.

This document is the canonical companion to [[Death_Engine_System]]. The Death Engine describes the procedure; this document describes the *result*. Read both.

## Composition

When the [[Death_Engine_System|Death Engine]] resolves, the Spirit Package consists of:

### Always kept

- **Spirit attributes Flow and Focus** — full level, full augments, full current.
- **Pure-Spirit skills** — every skill whose governors are all in {Flow, Focus} keeps its level.
- **All 10 magic schools** — every level retained (every school is Spirit-pillared by design).
- **Spirit-pillared Nectars/Thorns** — these are the character's identity-defining play exploits; they persist.
- **The character's identity blob** — name, pronouns, age (frozen at moment of death), backstory, portrait, history.
- **The character's `bodyAnatomy` tree** — retained as a memorial artifact, mechanically inert.

### Kept but diminished

- **Soul attributes** Willpower, Wisdom, Wit — each `level` halved (`Math.floor(level / 2)`). Current is clamped to the new max. Augments are preserved.
- **Soul-governed skills** — each level halved.
- **Soul-pillared Nectars/Thorns** — the trait stays on the ghost (it's still part of who they are), but its KRMA value is halved.

### Lost

- **All Body attributes** — Clout, Celerity, Constitution — zeroed (level, current, augments).
- **Body-governed skills** — removed entirely.
- **Body-pillared Nectars/Thorns** — removed entirely.
- **Frequency capacity** — `level` set to 0. No way to receive divine current.
- **`vitals.baseResist`** — zeroed.

## Where the KRMA goes

The Spirit Package is *not a transferred bag of KRMA*. The "kept" portions stay on the character wallet — the ghost still owns them. The losses route per the [[Death_Engine_System#The split|split table]]:

- Body components → campaign GM wallet
- Lost half of Soul → Lady Death system wallet
- Frequency capacity → Lady Death system wallet

The character's wallet on the ledger after death holds:
**(starting balance) − (body KRMA value) − (Soul lost-half KRMA) − (Frequency capacity KRMA)**

All transfers are *transfers*, not removals. The KRMA continues to exist in the metaverse, just under new ownership. The only mechanic that ever destroys KRMA is [[Frequency_Three_Operations|Burn]].

## What the package "feels like" in play

Mike's framing: **"The body is gone. The spirit remains intact besides the frequency tax to Lady Death and the soul is lost a little."**

In session, a ghost-form character:

- Can still talk, perceive, remember, advise (Flow and Focus are intact).
- Can still cast magic at full skill levels (every school is Spirit-pillared).
- Has *some* mental persistence (halved Soul) — they remember who they were and what they wanted, but the edge is dulled.
- Cannot fight (Body = 0, Frequency = 0).
- Cannot Burn or Spend Frequency (no capacity).
- Cannot Deplete (already empty).
- Cannot rest to recover Frequency (no max to recover toward).
- Persists on the canvas as a `GHOST`-status entity until the GM removes them.

## Why this design

GROWTH is built on the Orthodox anthropological framework: Body / Spirit / Soul are not arbitrary buckets. Each pillar has its own destination at death because each pillar *is* something specific.

- **Body** is the costume of this life. It returns to the GM (the world) because it was always borrowed.
- **Soul** is the persistent personhood. It survives but is **diminished**. Half is lost because death is *real* loss, not a free transition. The half retained is the seed that grows into the next life.
- **Spirit** (Flow / Frequency / Focus) is the connection to the divine. Flow and Focus — orientation of grace — stay intact: the character is still themselves and still attended-to. Frequency — the literal capacity to *receive* grace — is the price of crossing. It belongs to Lady Death.

The math is in service of the parable. Don't read the table without reading the reason.

## Future paths — design notes only

These are recorded for future design conversations. None are currently implemented and none should be treated as authoritative:

- **Spirit economy** — a path for ghosts to slowly rebuild Frequency capacity by accumulating something (witnessed events? prayers? karmic gifts?). Would re-open the Burn/Spend loop. Open question.
- **Reincarnation** — converting a Spirit Package into the seed of a new character. The Package becomes a Seed augment or a starting bonus. Open question (depends on Frequency capacity rebuild).
- **Resurrection via high enchantment** — a high-level Restoration / Conjuration spell sequence that rebuilds body-part items. [[Body_Composition_System]] reserves the mechanical path; the spell content is not authored yet.
- **Spirit Item** — items left behind by the character at death may carry their "voice" forward (the trope of the ancestor's blade). Open question whether this is purely narrative or has mechanical hooks.

## Implementation cross-reference

The Spirit Package is not a separate data structure. It is the **state of a character after `transformCharacterToGhost()` runs** (see `services/krma/death-split.ts`). The "package" exists implicitly as the surviving fields of the `GrowthCharacter` blob:

- `character.attributes.flow`, `.focus` → kept
- `character.attributes.willpower/.wisdom/.wit` → halved
- `character.attributes.frequency` → `{level: 0, current: 0}`
- `character.attributes.clout/.celerity/.constitution` → `{level: 0, current: 0, augmentPositive: 0, augmentNegative: 0}`
- `character.skills` → filtered + halved
- `character.traits` → filtered by pillar
- `character.vitals.baseResist` → 0
- `character.status` → `'GHOST'`

There is no separate `spiritPackage` field on the character. The package *is* the post-transformation character.

The `DeathSplitManifest.toPlayer` field is deprecated under this model and is always 0. Pre-2026-05-19 manifests with non-zero `toPlayer` are honored by the ledger for backwards compatibility (see `executeDeathSplit`).

---

## Links

- Related: [[Death_Engine_System]], [[Lady_Death_Protocols]], [[KRMA_System]], [[Frequency_Three_Operations]], [[Body_Composition_System]]
- References: [[Three_Pillar_Attributes]] (pillar definitions), [[Nectars_and_Thorns_System]] (pillar tag)
