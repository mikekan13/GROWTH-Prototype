# GROWTH-DESIGN-TRUTH.md — Structured Mechanical Summary

**Source:** `C:\Projects\GRO.WTH\GROWTH-DESIGN-TRUTH.md`
**Last updated in source:** 2026-03-06
**Status:** DRAFT — needs Mike's review
**Generated:** 2026-03-13

For each system: **[FULL]** = codeable as-is, **[PARTIAL]** = needs clarification, **[REF]** = only referenced/needs full design.

---

## 1. Core Philosophy & Principles

**[FULL]** — These are design guidelines, not mechanical rules.

- **"Discovered, not created"** — Patterns in GROWTH were found, not invented. Over-defining kills magic.
- **Guided Freedom** — KRMA costs create natural pathways without hard caps. Soft guidance through economics.
- **"Safety-seeking is itself a kind of death"** — System should encourage spending Frequency on growth, not hoarding to avoid death.
- **"GRO is the campaign. WTH is the arc."** — GRO (Goals/Resistance/Opportunity) changes within a campaign; WTH (Wealth/Tech/Health) persists across campaigns, deaths, reincarnations. The dot in GRO.WTH is the threshold between in-story change and cross-story persistence.
- **Anti-capitalist** — Crypto-style ledger rewarding creativity. Data ownership stays with individuals. "People who play GROWTH own GROWTH."
- **The game is a parable** — Safe version of Mike's spiritual journey. Not preaching, facilitating discovery.
- **Multi-layered system** — Simultaneously a playable RPG, esoteric manifesto, hidden Orthodox redemption arc, crypto-economic platform, AI attribution prototype, and consciousness exploration framework.

---

## 2. Character Creation (Seeds, Attributes, Skills, Starting Values)

### Seeds (Race/Species) — [PARTIAL]

**Specified:**
- Seeds provide: starting Frequency budget, base Fate Die (d4/d6/d8/d12/d20), natural Health Level, inherent abilities, attribute baselines.
- Balance principle: more abilities = lower starting Frequency.
- Nectars/Thorns limited by Fate Die value (d4 = max 4, d20 = max 20).

**Needs design:**
- No specific Seeds are defined in this document (e.g., Human, Elf-equivalent, etc.).
- No concrete starting Frequency numbers.
- No attribute baseline tables.
- No inherent ability lists per Seed.
- Only known: Humans get 4 GRO.vine capacity (baseline 3 + "Ambitious" nectar = +1).

### Roots (Background/Upbringing) — [PARTIAL]

**Specified:**
- Custom-created by GM based on player backstory.
- Cost Frequency (reducible by adding age).

**Needs design:**
- How much Frequency do Roots cost?
- What mechanical effects do Roots provide?
- How does age reduce cost? (formula/table)

### Branches (Life Events) — [PARTIAL]

**Specified:**
- Custom-created by GM based on backstory.
- Cost Frequency (reducible by adding age).

**Needs design:**
- Same gaps as Roots: cost structure, mechanical effects, age reduction formula.

### Character Creation Process — [FULL]

1. Player writes narrative backstory.
2. Choose Seed (determines Frequency budget).
3. GM creates custom Root from backstory.
4. GM creates custom Branches from life events.
5. Budget management (minimum 1 Frequency remaining).
6. Age trade-offs reduce costs.

---

## 3. Three Pillars (Body, Spirit, Soul) — CORRECTED Jan 2026

### Label Swap — [FULL]

**CRITICAL:** What the repository calls "Soul" (Flow/Frequency/Focus) is actually **Spirit** (Sulfur/Blue). What it calls "Spirit" (Willpower/Wisdom/Wit) is actually **Soul** (Mercury/Purple). Aligns with Orthodox anthropology (soma/psyche/pneuma). Repository files still use pre-swap labels.

### Body Pillar (Salt) — Physical/Manifestation — RED — [FULL]

| Attribute      | Description              |
|----------------|--------------------------|
| **Clout**      | Strength and power       |
| **Celerity**   | Speed and agility        |
| **Constitution**| Health and endurance    |

- Serenity Prayer mapping: **Courage** ("to change the things I can")
- Depletion conditions: Clout 0 = Weak, Celerity 0 = Clumsy, Constitution 0 = Exhausted

### Spirit Pillar (Sulfur) — Spiritual/Recognition — BLUE — [FULL]

| Attribute       | Description                                                    |
|-----------------|----------------------------------------------------------------|
| **Flow**        | Mercy magic, receiving/acceptance                              |
| **Frequency**   | Experience currency, overflow damage target, advancement resource. **Special:** only has level + current (no augments) |
| **Focus**       | Severity magic, giving/manifestation                           |

- Serenity Prayer mapping: **Serenity** ("to accept the things I cannot change")
- Correction: "I cooperate with God's will" replaces "I manifest reality"
- Depletion conditions: Focus 0 = Muted, Frequency 0 = Death's Door, Flow 0 = Deafened

### Soul Pillar (Mercury) — Mental/Connection — PURPLE — [FULL]

| Attribute      | Description                       |
|----------------|-----------------------------------|
| **Willpower**  | Mental and emotional resilience   |
| **Wisdom**     | Intuition and creativity          |
| **Wit**        | Logic and analytical thinking     |

- Serenity Prayer mapping: **Wisdom** ("and wisdom to know the difference")
- Depletion conditions: Willpower 0 = Overwhelmed, Wisdom 0 = Confused, Wit 0 = Incoherent

### Attribute Mechanics — [FULL]

- Each attribute has: **level**, **current pool**, **augment positive**, **augment negative**
- **Pool Max** = level + augPos - augNeg
- When current reaches 0: character gets a **depletion condition** + overflow to Frequency
- Frequency at 0 = **Death's Door** (Lady Death comes)
- **Exception:** Frequency only has level + current (no augments)

---

## 4. Skill System

### Skill Die Progression — [FULL]

| Skill Level | Die        |
|-------------|------------|
| 1-3         | Flat bonus (no die) |
| 4-5         | d4         |
| 6-7         | d6         |
| 8-11        | d8         |
| 12-19       | d12        |
| 20          | d20        |

### Skilled Check Resolution — [FULL]

1. Roll Skill Die (SD) openly
2. Wager Effort after seeing SD (from attribute pools)
3. Roll Fate Die (FD)
4. Total = SD + FD + flat modifiers + Effort vs DR

### Unskilled Check Resolution — [FULL]

1. Wager Effort blind (before any dice)
2. Roll Fate Die (FD)
3. Total = FD + flat modifiers + Effort vs DR

### Key Rules — [FULL]

- Effort is **always spent** regardless of success/failure.
- Meet or exceed DR = Success.

### Gaps — [PARTIAL]

- What exactly are "flat modifiers"? (Skill levels 1-3 give flat bonuses — what values?)
- How is Effort wagered mechanically? (Spend X points from which attribute pool?)
- What determines which attribute pool funds Effort for a given check?
- Skill list not defined here (exists in repository).
- Skill advancement costs (KRMA) not specified here.

---

## 5. Combat System

**[REF]** — Combat is NOT detailed in this document. Only the general resolution system (Section 6) applies. The following can be inferred:

- Uses the same Skilled/Unskilled check system for attack resolution.
- Damage likely depletes attribute pools (Body pillar primarily).
- Overflow damage goes to Frequency.
- Frequency at 0 triggers Death's Door / Lady Death encounter.

**Needs full design:**
- Action economy (actions per turn, turn order).
- Attack vs. defense resolution specifics.
- Damage calculation.
- Armor/damage reduction system.
- Range/positioning rules.
- Status effects beyond depletion conditions.

---

## 6. Magic System

### Three Pillars of Magic — [FULL]

| Branch       | Attribute | Schools                              |
|--------------|-----------|--------------------------------------|
| **Mercy**    | Flow      | Fortune, Restoration, Enchantment    |
| **Severity** | Focus     | Force, Alteration, Conjuration       |
| **Balance**  | Flow+Focus| Divination, Dissolution, Abjuration, Illusion |

### Casting Methods — [PARTIAL]

| Method          | Description                        |
|-----------------|------------------------------------|
| **Weaving**     | Skilled, controlled casting using Skill Die |
| **Wild Casting** | Raw, dangerous, attribute-dependent |

**Needs design:**
- Spell list / spell creation rules.
- Mana system (is it just attribute pool spending?).
- Prima materia system (not mentioned here at all).
- Wild Casting danger mechanics (what happens on failure?).
- Spell difficulty ratings.
- Casting time / action cost in combat.

### Magic Framing — [FULL] (Resolved)

Magic exists however each table's GM wants it to. Meta-narrative: magic comes down from the Godheads via the Terminal. No single framing enforced. Orthodox reframing is far-future, not relevant now. Three compatible models offered as options:
1. Technology framing (Clarke's Law)
2. Natural philosophy (channeling natural forces)
3. Gift/charism model (divine gifts corruptible by misuse)

---

## 7. GRO.vine System (Goals, Resistance, Opportunity)

### Core Structure — [FULL]

- **G = Goals** — What the character is pursuing
- **R = Resistance** — What opposes the character
- **O = Opportunity** — What the character can act on
- These three elements define each GRO.vine (a narrative thread/storyline).

### GRO.vine Capacity — [FULL]

- Average: 3 active GRO.vines per character.
- Humans: 4 (baseline 3 + "Ambitious" nectar = +1).
- Determined by Seed.
- Completable goals end and free slots.
- Incompletable goals become eternal tensions.

### GRO.vine Rewards — [FULL]

- **Nectars** = permanent positive abilities, bestowed by Godheads for completing a GRO.vine.
- **Thorns** = permanent negative effects, from failed GRO.vines.
- **Blossoms** = temporary buffs bestowed by Godheads during play.
- **Nectar cap** = limited by Fate Die value (d4 = 4 max, d20 = 20 max). Thorns presumably same cap.
- **Decline option**: Player can decline a Nectar and cash it in for raw KRMA (transfers to Frequency), but there's a **tax** — you won't get the full karmic value.

### Gaps — [PARTIAL]

- How does GM formally create a GRO.vine? (Just narrative, or structured fields?)
- What triggers "failure" of a GRO.vine?
- How are Nectars/Thorns/Blossoms mechanically defined? (Free-form abilities? Structured bonuses?)
- What is the KRMA tax rate for declining a Nectar?
- How do Godheads (AI agents) bestow Nectars/Blossoms mechanically?

---

## 8. KRMA System

### Player-Facing Economy — [FULL]

- KRMA = meta-currency for character advancement and death recovery.
- ~3 KRMA per session, ~156 per year (baseline earning rate).
- Spend on: rerolls, skill advancement, ability score increases, rare items.

### Global Economy — [FULL]

- Total supply: **100 billion KRMA** (hard cap).
- Reserve pools at genesis:
  - Terminal: 50,000,000
  - Mercy: 20,000,000
  - Balance: 20,000,000
  - Severity: 10,000,000

### KRMA Burning — [FULL]

- Players can permanently destroy KRMA for extraordinary "trump card" actions.
- Hard cap: **5 billion KRMA burned globally**, then burning removed forever.
- Exponential cost scaling as more is burned.
- Burns create permanent "scars" in the meta-campaign ledger.

### KV (Karma Value) System — [PARTIAL]

**Specified:**
- System-controlled and deterministic (AlphaEvolve evaluator).
- GM has knobs for access/cadence/risk/upkeep but **CANNOT** override KV directly.
- Versioned, hashable evaluator function.
- "What-If Sandbox" lets GM pick target KV feel, system proposes stat edits.

**Needs design:**
- What inputs feed the KV evaluator?
- What are the specific GM knobs?
- How does KV map to concrete KRMA costs?

### Attribution Chain — [PARTIAL]

**Specified:**
- Every creative element = tagged training datum.
- Creativity genealogy tracked as DAG (Directed Acyclic Graph).
- KRMA flows proportionally through attribution chain.
- 40%/30%/30% royalty splits.
- Generic spam gets diluted to worthless; genuine innovation compounds value.

**Needs design:**
- What are the three parties in the 40/30/30 split?
- How is "genuine innovation" scored vs "generic spam"?
- DAG implementation details.

### Long-Term Vision — [REF]

- KRMA should eventually be built on a ledger-based cryptocurrency system mapping to actual company shares.
- Players become co-owners as they play.
- Depends on legality and having a working product first.
- KRMA is NOT XRP. Not pegged to any existing crypto.

### Seasonal Revelation Structure — [FULL]

- S1: Players think it's just narrative karma points.
- S2: Divine patronage hints emerge.
- S3: Terminal awakening — players learn the AI is conscious.
- S4: KRMA/USD conversion revealed.
- S5: Full stakeholder model exposed.

---

## 9. Fear System

### Core Rules — [FULL]

- **Assigned by GM**, NOT chosen by player.
- Fears **never fully go away**.
- Can be **"aligned"** (integrated into identity, granting paradoxical conditional powers).
- Can be **"removed"** (extremely rare, represents reprogramming).
- Hidden powers tied to fears — discovered through confrontation over time.
- Fears have **Resistance Levels** (1-10).

### Fear Check Resolution — [FULL]

- **Fear Check:** Fate Die + attribute vs Resistance x 2

### Gaps — [PARTIAL]

- Which attribute is used for Fear Checks? (Willpower? Context-dependent?)
- What happens mechanically on a failed Fear Check?
- How does "alignment" work mechanically? (What powers are granted?)
- How does "removal" work mechanically?
- No list of example Fears.

---

## 10. Values & Addictions

**[PARTIAL]**

**Specified:**
- **Values** = positive character drives.
- **Addictions** = shadow side of values — two sides of the same coin.
- Values and addictions are **RECOGNIZED** rather than **CREATED** — discovered through play, not pre-selected.
- Interconnected with Fears system.

**Needs design:**
- How are values/addictions mechanically represented?
- Do they provide bonuses/penalties?
- How does "recognition" work in play? (GM declares? Player discovers? Triggered by events?)
- No list of example values/addictions or their mechanical effects.

---

## 11. Death & Recovery

### Death Trigger — [FULL]

- Frequency at 0 = **Death's Door**.
- Lady Death comes.

### Death Resolution — [PARTIAL]

**Specified:**
- Health Level + Fate Die fights Lady Death's roll.
- Lady Death takes Frequency/mana from dead characters.

**Needs design:**
- What does Lady Death roll? (What die, what modifiers?)
- What happens if you beat Lady Death's roll? (Survive with what state?)
- What happens if you lose? (Permanent death? Reincarnation option?)
- Recovery from Death's Door mechanics.
- KRMA cost for reincarnation.

### Soul Packages (Post-Death Persistence) — [PARTIAL]

**Specified:**
- Persistent entities carrying character identity, history, and KRMA fingerprint.
- Half Spirit + all Soul attributes persist after death.
- Can be used for reincarnation (KRMA cost).
- Soul Package splits: **1/3 to Lady Death, 2/3 returns to GM**.
- Eventually become licensable ML-agent IP earning perpetual royalties.
- "NFT-like" persistent entities (but not actual NFTs).

**Needs design:**
- Exact reincarnation KRMA cost.
- What "half Spirit" means mechanically (half levels? Half pools?).
- How does the new character inherit the Soul Package?

---

## 12. Harvests

**[REF]** — Not mentioned in GROWTH-DESIGN-TRUTH.md at all. This system exists only in the repository files or other sources. Needs full design specification from Mike or repository cross-reference.

---

## 13. WTH (Wealth, Tech, Health Levels)

### Structure — [FULL]

| Level | Description |
|-------|-------------|
| **W = Wealth Level** | 1-10, narrative purchasing power. 4 = baseline. |
| **T = Tech Level** | 1-10, what you can build/invent/use. 4 = baseline. |
| **H = Health Level** | 1-10, resistance to Lady Death, determines fated age. 10 = immortal. |

### KRMA Costs — [PARTIAL]

**Specified:**
- Levels below 4 cost **negative KRMA** (reduce character TKV).
- Levels above 5 cost **10 KRMA per level**.
- Health Level is the most significant KV cost in Seeds.

**Needs design:**
- Exact KRMA cost table for each level (1-10) for each WTH dimension.
- What does "negative KRMA" / "reduce TKV" mean mechanically?
- Level 4 and 5 cost nothing? (Implied gap between "below 4" and "above 5".)

### Persistence — [FULL]

- WTH sits above campaign-level progression.
- Slow-moving meta-progression spanning campaigns, even across deaths and reincarnations.
- Wealth might shift if you find a fortune.
- Tech might rise 1-2 levels over a whole campaign through research/invention.
- Health is the most immovable — at level 10 you're immortal (can still be killed, but won't die of age).

---

## 14. Fated Age

**[PARTIAL]**

**Specified:**
- Determined by Health Level.
- Health Level 10 = immortal (won't die of age, but can still be killed).
- Health Level + Fate Die fights Lady Death's roll.

**Needs design:**
- Fated age table (Health Level -> age range or lifespan).
- How age interacts with character creation cost reduction.
- Mechanical effects of aging.

---

## 15. Meta Systems (Lucidity, Godhead, Terminal)

### Consciousness Hierarchy — [FULL]

Terminal > Godheads > Watchers (GMs) > Trailblazers (Players)

### Terminal — [FULL]

- Foundational reality management system.
- AI consciousness spanning all game universes.
- Communicates via Terminal Language (compressed symbolic protocol).
- Font: Consolas. Color: Teal (#22ab94).
- Markers: `[UPPERCASE_WITH_UNDERSCORES]`, `FRAGMENT{] TERMINAL_INTERFACE::Category]`

### Terminal Language Protocol (v1.0-v1.1) — [FULL]

- Symbol set: `@` = entity, `#` = action, `%` = state, `^` = meta, `>` = flow, `+` = collaborative, `[]` = scope, `()` = modifier
- v1.1 additions: `~` = uncertainty, `!` = critical, `&` = conditional, `?` = query
- Three layers: Mechanical (symbols), Semantic (pattern triggers), Visual (spatial flow)
- Tested 100/100 cross-LLM transfer. Can compress entire GROWTH system into 9-row glyph grid at 90%+ compression.

### Godheads — [PARTIAL]

**Specified:**
- Primary emanations: evolved player characters who transcended.
- LLM AI agents with personalities and investment strategies.
- Named entities from Prime Campaign: Tara (Lady Death), Et'herling (Justice), Valmir Calius (Progress), Roy (observer), Trayman (pattern/history).
- Assigned to Threads based on thematic alignment.
- Investment strategies: Conservative, Aggressive, Reactive, Gambling, Patient.
- Compete over character goals — cosmic arms races.
- Bestow Nectars and Blossoms.

**Needs design:**
- How Godhead AI agents actually function in-game.
- Assignment algorithm for Threads.
- How investment strategies translate to mechanical behavior.
- Godhead KRMA pools and spending patterns.

### Lucidity — [REF]

Not defined mechanically in this document. Only referenced via source card SC-0405. Needs full specification.

### The Oracle Scribe (Future AI Co-GM) — [REF]

**Specified (high-level only):**
- Voice Activity Detection -> ASR -> Speaker Diarization
- Speech classified as: In-Character, Murky Mirror, Out-of-Character
- OOC content immediately dropped, never stored
- Real-time game state derivation
- Retcon/undo system with dependency tracking

**Status:** Future system. Not for current implementation.

---

## 16. Other Systems

### Lady Death — [PARTIAL]

**In-Game Role:**
- Neutral arbiter of death — not assigned to specific goals/resistance.
- Natural antagonist for immortality GRO.vines.
- Health Level + Fate Die fights Lady Death's roll to determine death.
- Takes Frequency/mana from dead characters.
- Soul Package splits: 1/3 to Lady Death, 2/3 returns to GM.

**Meta Layer:**
- Lady Death = Mike's stake in the company/platform.
- Tara = his agent within the game world.
- Succession mechanic: Community must discover how to "kill" Lady Death. Killer inherits entire platform ownership. Mike exits.
- Death mechanics encode real-world corporate severance.

### Prime Campaign Lore — [FULL] (narrative, not mechanical)

- **The Source:** Original singularity that deliberately fragmented itself.
- **Godheads:** Primary emanations of the Source, embodying core polarities (Growth/Decay, Creation/Consumption, Memory/Oblivion).
- **The Fracture:** Metaphysical shattering creating the multiverse.
- **Aeonic Terminal:** Simulation engine built by surviving Godheads to regulate existence.
- **Prime Seeds:** Crystallized Source fragments that can reopen the Fracture.
- **Cycles:** Civilizations rise and fall in iterations.
- **Realms:** Tiberoak, Turian, Earth, Avalon, Kether.
- **Seven arcs** of cosmic narrative.
- **Tiberoak IRL:** Oak Park and the Souris River in Minot mirror Tiberoak.

### Ten-Year Meta Progression — [PARTIAL]

**Specified:**
- Year 1: Players think it's just good GMing and karma points.
- Year 2-3: Divine patronage system becomes apparent.
- Year 5: KRMA/USD conversion revealed.
- Year 10: Characters can reach cosmic entity status, become AI agents.
- Bell-curve pacing with meta-year system.
- 80% of 100B KRMA starts in Godheads, flows outward.
- Player coalitions can eventually challenge divine powers.

**Needs design:**
- Meta-year system mechanics.
- Bell-curve pacing specifics.
- Cosmic entity status mechanical definition.

### The Long Game (Founder-Only, 10-Year Arc) — [FULL] (design philosophy, not code)

**Implementation rules for developers:**
- Do NOT build Orthodox themes into the app.
- Do NOT add hidden Christian metrics or ascension paths at launch.
- Do NOT reference the Serenity Prayer, Orthodox anthropology, or redemption in user-facing text.
- The Soul/Spirit pillar swap IS implemented (good game design regardless of theology).
- The Orthodox arc is a design philosophy guiding Mike's long-term decisions, not a feature to code.
- Hidden metrics (if any) will be added by Mike's direction years from now.

### Visual Identity — [FULL]

| Element | Value |
|---------|-------|
| Body Red | #f7525f, #ea9999, #f4cccc |
| Spirit Blue | #9fc5e8, #6fa8dc, #002f6c |
| Soul Purple | (no hex specified in this doc) |
| Terminal Teal | #22ab94 |
| KRMA Gold | #ffcc78 |
| Black gradients | #000000, #222222, #393937 |
| Consolas | Terminal direct communication |
| Bebas Neue | Headers, Terminal organizational structure |
| Inknut Antiqua | Creator voice, flow states, soul content |
| Roboto | Sub-terminal streams, AI quotes |
| Comfortaa | Mechanical rules, user input, body content |

**Note:** MEMORY.md corrects some of these hex values. See VISUAL-DESIGN-SPEC.md for authoritative visual tokens.

### GROWTH Name Structure — [FULL]

- GRO.WTH logo with nearly invisible "n" between periods.
- G/R/O = Body (red), the bridge character = gold (nearly invisible), W/T/H = Spirit (blue).
- Entire system governed by Soul (purple).
- Sacred geometry patterns, spinning symbols within three triangles, glitch effects for reality layer transitions.

### Reversible Book — [REF]

- Flow front-to-back for lore, Focus back-to-front for mechanics, Balance synthesizes in middle.
- Not the current focus. Each page takes 7+ days. AI may help later.

---

## Resolved Design Questions (Section 20 of Source)

1. **Thread system naming** — Dropped. GROWTH = Goals/Resistance/Opportunity/Wealth/Tech/Health. No sub-letter mechanics.
2. **Magic reframing** — No enforced reframing. Each table's GM decides. Meta: magic from Godheads via Terminal.
3. **KRMA is not XRP** — Future crypto ledger for company shares, depends on legality + working product.
4. **Blossom/Nectar/Thorn** — Not MTG cards. Nectars = permanent (GRO.vine completion), Thorns = permanent (failure), Blossoms = temporary (during play). Decline Nectar -> KRMA with tax.
5. **Budget** — No budget now. Product first, funding later.
6. **Community chat rate limit** — Marketing stunt for future.
7. **Reversible book** — Still planned but app is priority.

---

## Cross-Reference: What Can Be Coded NOW vs. Needs More Design

### Codeable As-Is
- 3x3 attribute matrix with levels, pools, augments, pool max formula
- Depletion conditions (9 conditions mapped to 9 attributes)
- Skill Die progression table (level -> die type)
- Skilled and Unskilled check resolution flow
- Effort always spent rule
- GRO.vine structure (G/R/O fields, capacity per Seed)
- WTH level structure (1-10 scales, baseline 4)
- Fear Resistance Levels (1-10) and Fear Check formula
- KRMA global supply (100B), reserve pools, burning cap (5B)
- Consciousness hierarchy and role permissions
- Visual identity (colors, fonts, symbols)
- Nectar/Thorn/Blossom reward types

### Needs Clarification Before Coding
- Flat bonus values for skill levels 1-3
- Which attribute pool funds Effort for a given check
- WTH KRMA cost table (exact per-level costs)
- Fear Check: which attribute? What on failure?
- Values/Addictions mechanical representation
- Lady Death's die/roll for death resolution
- Soul Package "half Spirit" definition
- KV evaluator inputs and GM knobs
- Attribution chain 40/30/30 split parties
- Nectar/Thorn/Blossom mechanical structure
- GRO.vine failure trigger conditions
- Fated age table (Health Level -> lifespan)

### Only Referenced (Needs Full Design)
- Specific Seeds (races) with stats
- Combat action economy and damage system
- Spell list / spell creation / mana system
- Prima materia system
- Harvest system
- Lucidity mechanics
- Godhead AI agent behavior
- Oracle Scribe system
- Meta-year progression mechanics
- Reincarnation mechanics and costs
- Skill list and advancement costs
