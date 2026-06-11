# Damage_Targeting_KV_Spec.md

**Status:** #validated
**Source:** Provided verbatim by Mike 2026-06-10, compiled from `GROWTH_Karmic_Valuation_System.md`, `GROWTH Combat Damage System.md`, `Damage_Type_Interactions.md`. Recorded as ruling r-2026-06-10-02. THIS FILE IS AUTHORITATIVE for targeting-cost logic; open decisions flagged in §7.
**Security:** PUBLIC
**Last Updated:** 2026-06-10

---

# GROWTH — Damage-to-Attribute Targeting & KV Cost Specification

## 1. Overview

Every damage-dealing element in GROWTH (weapons, spells, abilities, traps, item abilities) declares **which attribute its damage targets**. Each of the 7 damage types has a **natural affinity** with exactly one attribute. Targeting the natural attribute costs baseline KV. Targeting any other attribute is permitted but **multiplies the KV cost** of the damage component. This is a soft economic incentive ("guidepost"), never a hard restriction.

**Canonical example:** A spear dealing 15 Piercing targeting **Clout** (natural) has baseline damage KV. An otherwise identical spear dealing 15 Piercing targeting **Constitution** costs **5× the damage KV component**, because Constitution is two steps removed from Clout on the affinity cycle.

## 2. The Affinity Cycle (CANON)

The 7 damage types and 7 cycle attributes form a closed ring, in this exact order:

```
Damage:     P  →  S  →  H  →  D  →  C  →  B  →  E  →  (back to P)
Attribute:  Clout → Celerity → Constitution → Focus → Willpower → Wisdom → Wit → (back to Clout)
```

| Index | Damage Type | Natural Attribute | Pillar of Attribute |
|-------|-------------|-------------------|---------------------|
| 0 | Piercing (P) | Clout | Body |
| 1 | Slashing (S) | Celerity | Body |
| 2 | Heat (H) | Constitution | Body |
| 3 | Decay (D) | Focus | Spirit |
| 4 | Cold (C) | Willpower | Soul |
| 5 | Bashing (B) | Wisdom | Soul |
| 6 | Energy (E) | Wit | Soul |

**Note:** Flow and Frequency (Spirit pillar) are NOT on the cycle. They are special cases (see §4).

**Canon mnemonic:**
```
P S H / D \ C B E
C C C / F \ W W W
```
(Clout, Celerity, Constitution / Focus \ Willpower, Wisdom, Wit)

## 3. Targeting Cost Multipliers (CANON)

Source: `GROWTH_Karmic_Valuation_System.md` → "Attribute Targeting Cost Multipliers"

| Ring Distance | Multiplier | Description |
|---------------|------------|-------------|
| 0 (natural) | **1×** | Damage type targets its own affinity attribute |
| 1 (adjacent) | **2×** | One step away on the cycle (either direction) |
| 2 | **5×** | Two steps removed |
| 3 | **10×** | Three steps removed (maximum ring distance on a 7-ring) |
| Frequency (off-ring) | **20×** | Targeting Frequency is always the most expensive |

**Ring distance function:**
```
distance(i, j) = min(|i − j|, 7 − |i − j|)
```
where `i` = natural attribute index of the damage type, `j` = index of the targeted attribute. Distance is symmetric and direction-agnostic.

## 4. Full Lookup Table (derived from canon, verified)

Rows = damage type. Columns = targeted attribute. Cell = KV multiplier on the damage component.

| Dmg ↓ / Target → | Clout | Celerity | Constitution | Focus | Willpower | Wisdom | Wit | Frequency | Flow |
|---|---|---|---|---|---|---|---|---|---|
| **Piercing (P)** | **1×** | 2× | 5× | 10× | 10× | 5× | 2× | 20× | 10× |
| **Slashing (S)** | 2× | **1×** | 2× | 5× | 10× | 10× | 5× | 20× | 5× |
| **Heat (H)** | 5× | 2× | **1×** | 2× | 5× | 10× | 10× | 20× | 2× |
| **Decay (D)** | 10× | 5× | 2× | **1×** | 2× | 5× | 10× | 20× | **1×** |
| **Cold (C)** | 10× | 10× | 5× | 2× | **1×** | 2× | 5× | 20× | 2× |
| **Bashing (B)** | 5× | 10× | 10× | 5× | 2× | **1×** | 2× | 20× | 5× |
| **Energy (E)** | 2× | 5× | 10× | 10× | 5× | 2× | **1×** | 20× | 10× |

**Flow (RESOLVED r-2026-06-10-04):** Flow prices identically to Focus for every damage type — it mirrors Focus's ring position. This realizes the old canon note that Decay "naturally targets Focus (and sometimes Flow)": Decay→Flow is natural-priced (1×). Frequency remains the lone 20× special case.

## 5. Where the Multiplier Applies in Item KV

Canonical item formula:
```
Item KRMA = Material Value + Damage Value + Resistance Value + Mods Value + Abilities Value
```

The targeting multiplier applies to the **Damage Value component only**. Material, Resistance, Mods, and Abilities components are unaffected by targeting choice.

```
Damage Value (final) = Σ over each damage type entry in the damage string:
    baseDamageKV(type, amount) × targetingMultiplier(type, declaredTarget)
```

**Consequences:**
- Two physically identical spears (same material, same condition, same 15 Piercing) differ in KV **only** through the Damage Value component when their declared targets differ.
- The spear example: if 15 Piercing has a base damage KV of X, then targeting Clout = X, targeting Constitution = 5X for that component.
- This compounds naturally with the existing damage scaling framework (exponential cost at higher damage tiers). The multiplier applies **after** base damage KV is computed from the damage amount.

## 6. Schema Requirements

Every damage-dealing entity must declare targeting explicitly at authoring time. The KV Authority (marketplace pricing AI) and the Terminal AI (rule validation) both consume this field.

```typescript
interface DamageEntry {
  type: 'P' | 'S' | 'H' | 'D' | 'C' | 'B' | 'E';
  amount: number;                  // fixed value — GROWTH weapons use fixed damage, no dice
  targetAttribute: Attribute;      // REQUIRED. No implicit default in stored data.
                                   // Authoring UIs should pre-fill with the natural target
                                   // but persist the explicit value.
}
```

**Validation rules (Terminal AI / KV Authority):**
1. `targetAttribute` must be present on every nonzero damage entry. Reject/flag entries without it.
2. Compute multiplier via §3. Never hard-block off-alignment targeting — price it.
3. Frequency targeting is legal, always 20×.
4. Flow targeting is legal and prices as Focus (§7.1, r-2026-06-10-04).
5. Surface the multiplier to the author in the UI ("This targeting costs 5× — natural target for Piercing is Clout") so the economic guidepost is visible, consistent with guided freedom.

**Damage string format reminder:** `P:S:H/D\C:B:E` — the string carries amounts; targeting metadata lives alongside it per entry, not inside the string.

## 7. OPEN DECISIONS (NEEDS-MIKE)

### 7.1 Flow targeting multiplier — RESOLVED (r-2026-06-10-04)
**Flow prices identically to Focus** for every damage type (Flow mirrors Focus's ring position). Decay→Flow = 1×, Heat/Cold→Flow = 2×, Slashing/Bashing→Flow = 5×, Piercing/Energy→Flow = 10×. Implemented; lookup table in §4 updated.

### 7.2 Per-entry vs. per-weapon targeting — RESOLVED (r-2026-06-10-04): ATTACKS are the unit
**Weapons carry multiple named ATTACKS, each with its own damage string** — a sword might have a Slash attack `0:45:0/0\0:0:0` and a Stab attack `30:0:0/0\0:0:0`. This matches the original item artifact schema (`attacks: { Stab: {...}, Slash: {...} }` in `X_ARCHIVE_ORIGINS/GROWTH Material and Item Creation Artifact…`). Targeting is declared per damage entry within each attack. **Nectars can bestow additional attacks onto weapons or onto unarmed combat** — attacks are grantable blocks. Item KV's Damage Value sums across all attacks' entries, each × its targeting multiplier.

### 7.3 Known repo discrepancy — Weapon_System.md examples contradict affinity canon
`Weapon_System.md` examples violate the table: Club/Mace/Warhammer (Bashing) "targets Constitution" — Bashing's natural target is **Wisdom** and Constitution is 3 steps (10×), implausible for a basic club. Revolvers/bows (Piercing) "target Celerity" — adjacent (2×), also suspect as a default. Either the examples predate the cycle or intentionally carry off-alignment pricing. **Resolve before the weapon catalog is seeded.**

## 7.4 Multipliers are META LEVERS (Mike, 2026-06-10 — design intent, recorded r-2026-06-10-03)

The §3 values (1×/2×/5×/10×, Frequency 20×) are **launch defaults, not constants**. The cost multipliers can be steered by the meta: the system (Terminal / KV Authority / balancing runs) may cheapen or raise misalignment costs — globally, per ring distance, or **per damage type** — to steer the live game. "We can always make the amounts cheaper for damage types that misalign. These could actually act as meta levers."

Implementation requirement: the multiplier table must be **configuration, not hardcoded** — defaults per §3, overridable by a future meta-tuning source. (`app/src/lib/damage-targeting.ts` takes an optional config for this reason.)

## 8. Design Philosophy

- The multiplier system is a **guidepost, not a gate** — KRMA pricing steers the meta toward coherent patterns without forbidding creativity.
- Off-alignment builds are legitimate advanced strategy — premium KV for surprise value (an opponent stacking Clout defenses doesn't expect a spear draining Constitution).
- Generalizes across GROWTH: **deviation from base mechanics always costs more KRMA.** Material modifiers overriding base damage interactions follow the identical philosophy.
- Feeds: KV Authority marketplace pricing, GM authoring validation, mass agent-simulation balancing runs, Terminal AI difficulty hints.

---

## Links
- Related: [[Damage_Type_Interactions]], [[Weapon_System]], [[KRMA_System]], [[Block_Grading_Principles]]
- References: [[Three_Pillar_Attributes]], [[KRMA_Costs_Table]]
- Code: `app/src/lib/damage-targeting.ts`
