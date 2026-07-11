# Three_Pillar_Attributes.md

**Status:** #validated  
**Source:** Core Rulebook v0.4.4.md, GROWTH_System_Archive_Complete_Content_Extraction.md, ruling 2026-04-22, GROWTH-DESIGN-TRUTH §2 (Soul/Spirit swap Jan 2026)  
**Security:** PUBLIC  
**Rulebook:** `rulebook/rulebook.md` §3 (Attributes & Depletion)  
**Last Updated:** 2026-05-03

---

# Three Pillar Attribute System

The GROWTH system uses a **3x3 attribute matrix** organized around the alchemical pillars of **Salt**, **Sulfur**, and **Mercury**. Attributes are displayed in this standard order:

**Clout, Celerity, Constitution, Flow, Frequency, Focus, Willpower, Wisdom, Wit**

> **CANON NOTE (Jan 2026 Soul/Spirit swap):** The pillar holding Flow/Frequency/Focus is **Spirit** (Sulfur). The pillar holding Willpower/Wisdom/Wit is **Soul** (Mercury). This corrects a 9-year mislabeling and aligns with Orthodox anthropology (soma-psyche-pneuma — Body, Soul, Spirit). Older repository files and archives may use the pre-swap names; this file is authoritative.
>
> **DECISION-NEEDED (raised 2026-05-02):** Pillar→color mapping is currently under review in `GROWTH-DESIGN-TRUTH.md` §2. Color labels are intentionally omitted from this file until Mike resolves. See `VISUAL-DESIGN-SPEC.md` and the canonical color palette in memory for the working palette.

## Body Pillar (Salt 🜔)
*Physical aspects of existence — soma*

### Clout
**Strength and power**  
- Raw physical force and muscle mass
- Determines [[Inventory_and_Encumbrance_System|Carry Level]]
- Physical dominance and lifting capability
- **Pool:** Direct effort source for strength-based actions

### Celerity  
**Speed and agility**  
- Hand-eye coordination and reflexes
- Combat initiative and movement
- Fine motor control and precision
- **Pool:** Direct effort source for speed/agility actions

### Constitution
**Health and endurance**  
- Physical resilience and disease resistance
- Environmental damage resistance (thirst, exposure, etc.)
- Recovery and healing rates
- **Pool:** Direct effort source for endurance actions

## Spirit Pillar (Sulfur 🜍)
*Spiritual and energetic aspects — pneuma. Holds Flow / Frequency / Focus. (Pre-Jan-2026 docs called this pillar "Soul" — that label is retired.)*

### Flow
**Governs Mercy Pillar of Magic**  
- Receiving and acceptance, divine inspiration
- Passive magical connection and healing
- **Pool:** Effort source for Mercy magic and receptive actions
- **Balance Magic:** Can provide effort for Balance Pillar spells

### Frequency
**Special attribute — has only level + current pool (no augments). Three distinct operations: Spend, Deplete, Burn (see [[Frequency_Three_Operations]]).**  
- **Cosmic Resonance:** Character's resonance with the universe and potential for growth
- **Spend (advancement currency):** Points spent to upgrade abilities. Permanently reduces maximum pool.
- **Deplete (damage / overflow):** Reduces current pool only — not max. Refills on rest. Other attribute pools that hit zero overflow into Frequency depletion.
- **Burn (destructive):** Permanently destroys Frequency/KRMA — no one receives it. Used to alter outcomes or enable impossible actions. Hard global cap across the metaverse. *(Burn formula and exact effects [NEEDS MIKE].)*
- **Death Threshold:** Reaching zero triggers death saves (see [[Lady_Death_Protocols]]).

### Focus
**Governs Severity Pillar of Magic**  
- Giving and manifestation, divine will
- Active magical projection and force
- **Pool:** Effort source for Severity magic and projective actions
- **Balance Magic:** Can provide effort for Balance Pillar spells

## Soul Pillar (Mercury ☿)
*Mental and emotional aspects — psyche. Holds Willpower / Wisdom / Wit. (Pre-Jan-2026 docs called this pillar "Spirit" — that label is retired.)*

### Willpower
**Mental and emotional resilience**  
- Determination and resolve
- Resistance to mental effects
- **Pool:** Direct effort source for mental fortitude

### Wisdom
**Intuition and creativity**  
- Insight and perception
- Creative problem solving and adaptability
- **Pool:** Direct effort source for intuitive actions

### Wit
**Logic and analytical thinking**  
- Memory and learning capability
- Reasoning and deduction
- **Pool:** Direct effort source for analytical tasks

## Attribute Pool Mechanics

### Pool Usage
**Direct Pools:** Attributes ARE the effort pools - Clout 12 means 12 points available
**Pool Modifiers:** Equipment/effects can modify pool totals (+10 modifier = 22 total pool)
**Effort Wagering:** Players spend points directly from relevant attribute pools

### Augs vs. Levels (canon, confirmed 2026-05-06)

Attributes are described by two distinct quantities:

- **Level** — the trained capability of the attribute. Levels at character creation come from [[Seeds_Roots_Branches_System|Roots and Branches]]. Levels grow in play through the **trainable mechanic**: a failed (non-skill) attribute check marks that attribute `trainable`; on rest, the player Spends 1 Frequency to gain +1 level on each trainable item. Skills follow the same loop (failed skill check → trainable skill → 1 Frequency Spend → +1 skill level).
- **Aug** — a flat positive modifier contributed by a [[Seeds_Roots_Branches_System|Seed]]. Seeds contribute augs only — they do **not** grant levels. 1 aug = 1 KRMA in seedKV. (Seeds *can* technically carry negative augs, but it is atypical; refund-style negatives are forbidden and must be encoded as Thorn liens per `memory/negatives-only-in-thorns-liens`.)

Total attribute pool = base (from Roots/Branches levels) + Seed augs + equipment/effect modifiers.

### Damage and Recovery
**Normal Damage:** Temporary reduction, heals with rest/sleep  
**Overflow Damage:** When any pool hits zero, excess damage goes to Frequency  
**Permanent Damage:** Very rare effects can damage maximum pool values  
**Environmental Damage:** Thirst, exposure, etc. damage relevant pools (Oracle System assists GM in determination)

### Rest Mechanics
**Short Rest (current canon):** Deplete 1 Frequency (current pool only — does NOT reduce Max) → heal every other attribute by 1 point.  
**Sleep (Long Rest):** Fully restores all pools including Frequency current.  
**Strategic Risk:** Depleting Frequency to zero triggers death saves.  
*(Per-pillar rest model may replace this later — see [[../../GROWTH-DESIGN-TRUTH|DESIGN-TRUTH]] §7.7.)*

### Death Save System
**Trigger:** Frequency current pool reaches zero from any source.  
**Resolution:** FD + bodyResist vs Lady Death's roll (Combat Death). *(Survivable-fail count for combat saves pending Mike's ruling.)*  
**Fated Age Death (ruling r-2026-06-09-01):** independent system — **Fate Die only** vs Tara's Death Roll, each year at/past `fatedAge` (set by Seed; Nectars/Thorns can augment). Each fail → Tara bestows an escalating-age **Thorn**. Third fail after fated age = death.  
**No Effort:** Cannot wager attributes on death saves.  
**Success:** Recover 1 Frequency point (combat save) / nothing happens that year (fated-age roll).  
**Failure:** Character death (Spirit Package falls — see [[Spirit_Package_System]]).

## Magic Integration
**Flow:** Governs [[Three_Pillars_Overview|Mercy Pillar]] magic exclusively  
**Focus:** Governs [[Three_Pillars_Overview|Severity Pillar]] magic exclusively  
**Balance Pillar:** Governed by both Flow AND Focus - can use either or both for effort  
**Casting Methods:** Raw Casting vs [[Casting_Methods|Woven Spells]] affect mana usage and complexity

---

## Links
- Related: [[Seeds_Roots_Branches_System]], [[Three_Pillars_Overview]], [[Character_Approval_Process]]
- References: [[KRMA_Costs_Table]], [[Spell_Strength_Levels]]
- Examples: [[Character_Creation_Example_Cambion_Mercenary]], [[Character_Creation_Example_Human_Scholar]]