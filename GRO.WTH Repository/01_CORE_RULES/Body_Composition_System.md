# Body_Composition_System.md

**Status:** #validated
**Source:** Mike resolution session 2026-05-19 ([[NEEDS-MIKE_RESOLUTIONS_2026-05-19]] §3). Implemented in `app/src/lib/body-damage.ts` (`routeDamage`, `HUMAN_BASELINE_ANATOMY`), `app/src/types/item.ts` (`isBodyPart`/`partName`/`contains`).
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` (§Combat & Damage — needs sync)
**Last Updated:** 2026-05-23

---

# Body Composition — Parts Are Items

## The core principle

**Everything is an item.** Items are the universal primitive in GROWTH. Body parts are items too. There is no separate "body subsystem" parallel to inventory — armor, organs, body parts, and held gear all live in the same nested container chain.

A body part is just a `GrowthWorldItem` with two flags set:

- `isBodyPart: true` — marks it as anatomy. The UI hides "Unequip"; the GM cannot drop the part into the world by accident.
- `partName: string` — the functional label ("Head", "Left Eye", "Heart"). Each instance is distinct: Left Eye and Right Eye are separate items, not one "Eyes" item.

Parts can hold other items via `contains: GrowthWorldItem[]`. This is the same field used for normal containers (a backpack holds items via `contains`). The Head contains the Brain, Eyes, Ears, Tongue. The Torso contains the Heart, Lungs. Armor worn over the Head is *also* in that chain — it's the outermost layer between the attacker and the parts beneath.

## Damage cascade

When an attack lands, damage routes through the container chain from outside in.

1. The outer layer (the part that was hit) absorbs damage up to its `baseResist`.
2. Excess damage **passes through** to the contents.
3. The passthrough split depends on damage type:
   - **Piercing** — the attacker designates exactly ONE internal to receive the full passthrough amount. The piercing path may be multiple segments deep (e.g., Head → Brain).
   - **All other types** (Slashing, Bashing, Heat, Cold, Decay, Energy) — the passthrough splits *evenly* across all internals: each child receives `Math.floor(passthrough / N)`. Remainders are absorbed by the bearer's mass (intentional design: half-points don't propagate).
4. Each internal then runs the same step against its own resist and contents, recursively.
5. When damage to a part meets or exceeds the part's resist, the part drops one condition tier (3=Undamaged → 2=Worn → 1=Broken → 0=Destroyed). The 5-tier scale matches all other items, see [[Equipment_Conditions]].

### Why two routing modes?

The split is *intentional asymmetry*:

- **Piercing** is the "precision strike" damage type. It rewards aim — you choose where the spike goes. Mechanically, this is what enables called shots.
- **Everything else** is "diffuse impact." A sword cut splits energy across the slab; a fireball doesn't pick favorites. You don't get to aim with diffuse damage.

This design retires the old "Body" damage type. Damage now resolves against material (Hard/Soft, see [[Material_System]]) + the typed class. There is no longer a single "Body" damage column to track.

## Baseline anatomy

Each seed declares its own anatomy from scratch. No inheritance. Human eyes and Elven eyes are *distinct items* — different `partName`s, potentially different resists, different abilities. This keeps the catalog clean and KV totals self-contained.

The **Human baseline** is the default applied when a character is created and the seed has not declared its own anatomy. It includes only parts needed for core function (life, thought, speech, perception). Finer anatomy **lazy-spawns** when a scene requires it — if the GM narrates an attack at a specific organ that doesn't exist in the chain yet, the GM (or the Terminal) spawns it on demand.

Canonical Human baseline (from `HUMAN_BASELINE_ANATOMY` in code):

```
Body (Soft, resist 4, condition 3)
├── Head (Hard, resist 6, condition 3)
│   ├── Brain (Soft, resist 2)
│   ├── Left Eye (Soft, resist 1)
│   ├── Right Eye (Soft, resist 1)
│   ├── Left Ear (Soft, resist 1)
│   ├── Right Ear (Soft, resist 1)
│   └── Tongue (Soft, resist 1)
└── Torso (Soft, resist 5, condition 3)
    ├── Heart (Soft, resist 2)
    ├── Left Lung (Soft, resist 2)
    └── Right Lung (Soft, resist 2)
```

Non-humanoid seeds (Goblinoid, Synthetic, Cambion, Celestial, Soul-Forged, Halfling, etc.) declare their own trees. Some examples:

- **Synthetic** — no biological organs; a "Core" replaces Heart, "Optical Arrays" replace Eyes, all parts are Hard. Magic does not heal but Restoration can rebuild via item-swap.
- **Goblinoid** — same human layout but Tongue has Item Ability "Trade Cant" (proficiency in haggling).
- **Six-eyed seed** — six separate Eye entries in the Head container.

Each seed authors its tree once in its [[Seeds_Roots_Branches_System|seed data]] and the character creation pipeline deep-clones it onto the new character.

## Conditions, paired parts, asymmetric damage

- Each part tracks its own condition. If Left Eye drops to 0 but Right Eye is fine, the character is blind in one eye, not blind entirely.
- A part at condition 0 (Destroyed) is mechanically inert. The narrative effect is up to the GM (severed limb, missing eye, etc.).
- Abilities on a part **function fully unless the ability text declares otherwise**. There is no universal "abilities degrade with condition" rule. If a Nectar attached to a body part says "loses effect at condition 1 or lower," that's authored on the trait. Otherwise the ability persists until the part hits 0.

## Body modifications

Body modifications are **narrative GM events**, not a mechanical subsystem. To replace a leg with a metal prosthetic, the GM updates the part in the container (swap the leg item for a prosthetic item). The new item carries its own material, resist, condition, and abilities. No special "augmentation" or "cyberware" rules — it's just an item swap.

The single mechanical exception: **magic**. High-level enchantment spells (Conjuration, Restoration, Alteration at sufficient DR) can rewrite body-part items directly. The spell itself contains the modification rules; the engine just applies them as item swaps. The reservation is here so authors of resurrection/regeneration spells know they're allowed to touch the anatomy tree.

## Why "Body" damage type was retired

Pre-2026-05-19 GROWTH had a damage type called "Body" alongside Piercing/Slashing/etc. It was an attempt to model "structural damage to the chassis." It was redundant: every part already has a material (Hard or Soft), and Hard parts already absorb damage differently than Soft. Adding "Body" as a separate column doubled the bookkeeping.

The fix: remove "Body" as a damage type. Every part has a material. Material + typed damage (P/S/H/D/C/B/E) carries everything the old "Body" type did, with no redundancy.

## Senses and Actions as Item Abilities

Senses (sight, hearing, smell) and Actions (speak, grasp, walk) are not a separate catalog. They are `itemAbilities` on the relevant body part:

- Eyes have a "Sight" ability.
- Ears have a "Hearing" ability.
- Tongue has a "Speech" ability.
- Hands have "Grasp" abilities.

When a part is destroyed, its abilities go with it. If both Eyes hit condition 0, the character has no Sight ability anywhere on their anatomy — they are blind. The Terminal checks the ability catalog (sum of all `itemAbilities` across all kept body parts) to decide what the character can do.

## Cross-reference

| Game term | Code surface |
|---|---|
| Body-part flag | `GrowthWorldItem.isBodyPart` |
| Part label | `GrowthWorldItem.partName` |
| Nested children | `GrowthWorldItem.contains` |
| Cascade engine | `routeDamage(bodyRoot, damageType, amount, options)` in `lib/body-damage.ts` |
| Piercing path | `options.piercingTargetPath: string[]` |
| Human default | `HUMAN_BASELINE_ANATOMY` (same file) |
| Apply damage in game | `services/damage.ts` → `applyDamageToCharacter()` |
| API entry | `POST /api/characters/[id]/damage` |
| Persisted on character | `character.bodyAnatomy` (top-level field on `GrowthCharacter`) |

---

## Links

- Related: [[Material_System]], [[Equipment_Conditions]], [[Damage_Type_Interactions]], [[Inventory_Paperdoll]], [[Death_Engine_System]]
- References: [[Seeds_Roots_Branches_System]] (per-seed anatomy declaration), [[Combat_Hit_Locations]]
- Memory: `body-composition-as-items-2026-05-19`
