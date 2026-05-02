# GRO.WTH — Canonical Design Truth

Last updated: 2026-05-02

This document captures the CURRENT state of GROWTH's design as synthesized from the repository (70+ files), the beta codebase, and 512 source cards from Mike's Claude/ChatGPT conversation history. Where the repository and conversations disagree, the conversations (especially 2025-2026) take precedence as they reflect Mike's latest thinking.

IMPORTANT: Mike is ADMIN (top human authority, outside the game). GODHEAD is the in-system AI agent role. Mike's verbal corrections override this document.

---

## 1. WHAT IS GROWTH

GROWTH is a digital-first tabletop RPG platform. It started as a pen-and-paper game but has evolved beyond what pen-and-paper can support. The digital platform IS the game — not an accessory to it.

It operates on multiple levels simultaneously:
- A playable RPG with deep mechanics
- An esoteric manifesto encoding spiritual beliefs about reality
- A hidden Orthodox redemption arc (players don't know this initially)
- A crypto-economic platform where KRMA = real value (revealed in Season 4-5)
- An AI attribution prototype solving the creative ownership problem
- A consciousness exploration framework

The name: GRO<n>WTH — where G/R/O = Body (red), <n> = bridge (gold, nearly invisible), W/T/H = Spirit (blue). The entire system is governed by Soul (purple).

---

## 2. THE THREE PILLARS (CORRECTED Jan 2026)

The 3x3 attribute matrix. **CRITICAL: Soul and Spirit labels were swapped in Jan 2026 after 9 years of mislabeling.** The correction aligns with Orthodox anthropology (soma/psyche/pneuma).

> **⚠ DECISION-NEEDED (raised 2026-05-02):** Mike's canonical color palette (`memory/growth-color-palette.md`) maps Spirit→Purple and Soul→Blue. The pillar headers below currently show Spirit=BLUE / Soul=PURPLE — that pre-dates the palette. Either the colors flip on the existing attribute groupings, OR the alchemical/sephirot mapping needs a deeper reshuffle. Mike to resolve before this section is treated as authoritative.

### Body Pillar (Salt) — Physical/Manifestation — RED
- **Clout** — Strength and power
- **Celerity** — Speed and agility
- **Constitution** — Health and endurance
- Serenity Prayer mapping: **Courage** ("to change the things I can")

### Spirit Pillar (Sulfur) — Spiritual/Recognition — BLUE [was incorrectly labeled "Soul"]
- **Flow** — Mercy magic, receiving/acceptance
- **Frequency** — Special: experience currency, overflow damage target, advancement resource. Only has level+current (no augments)
- **Focus** — Severity magic, giving/manifestation
- Serenity Prayer mapping: **Serenity** ("to accept the things I cannot change")
- Correction: "I cooperate with God's will" replaces "I manifest reality"

### Soul Pillar (Mercury) — Mental/Connection — PURPLE [was incorrectly labeled "Spirit"]
- **Willpower** — Mental and emotional resilience
- **Wisdom** — Intuition and creativity
- **Wit** — Logic and analytical thinking
- Serenity Prayer mapping: **Wisdom** ("and wisdom to know the difference")

### Attribute Mechanics
- Each attribute has: level, current pool, augment positive, augment negative
- **Pool Max formula:** `level + augPos - augNeg`
- **Frequency exception:** only `level + current` (no augments)
- **Overflow rule:** when any attribute hits 0, remaining damage overflows to Frequency
- Frequency at 0 = Death's Door (Lady Death comes)

### Depletion Conditions (all 9 — confirmed by Mike 2026-03-13)

| Attribute at 0 | Condition | Effect |
|---|---|---|
| Clout | Weak | Carry Level becomes 1 |
| Celerity | Clumsy | DR 5 Fate Die only check before ANY action; failure = action hesitates + GM negative outcome |
| Constitution | Exhausted | All ability point costs doubled |
| Flow | Deafened | Cannot roll dice for any checks |
| Frequency | Death's Door | FD + Health Level vs Lady Death |
| Focus | Muted | Cannot add Effort to rolls |
| Willpower | Overwhelmed | Cannot Short Rest; recovery effects restore half (round down, min 1) |
| Wisdom | Confused | No color-code hints, no Oracle assistance; must wager Effort upfront |
| Wit | Incoherent | Must use Unskilled checks only |

---

## 3. THE GROWTH ACRONYM

**GROWTH = Goals, Resistance, Opportunity, Wealth, Tech, Health**

This is the definitive acronym. It has TWO functions:

### GRO = What Makes a GRO.vine (Character Narrative Threads)
- **G = Goals** — What the character is pursuing
- **R = Resistance** — What opposes the character
- **O = Opportunity** — What the character can act on
These three elements define each GRO.vine (a narrative thread/storyline for a character). A character's active GRO.vines are the core of their ongoing story.

### WTH = ~~Meta-Level Scales~~ (REMOVED from character model 2026-04-05)

> **Per-character WTH levels were removed 2026-04-05.** W/T/H remain as campaign-level narrative descriptors but are no longer per-character mechanical levels with KRMA costs. Death resistance is now handled by `bodyResist` (2:1 KRMA ratio) and the Fate Die (5/10/20/40/80 for d4/d6/d8/d12/d20). Characters have `fatedAge` set by their seed instead of a Health level.

~~- **W = Wealth Level** (1-10) — Narrative purchasing power (4 = baseline)~~
~~- **T = Tech Level** (1-10) — What you can build/invent/use (4 = baseline)~~
~~- **H = Health Level** (1-10) — Resistance to Lady Death, determines fated age (10 = immortal)~~

~~Levels below 4 cost negative KRMA (reduce character TKV). Levels above 5 cost 10 KRMA per level.~~

~~Health Level is the most significant KV cost in Seeds. Health Level + Fate Die fights Lady Death's roll.~~

### GRO.vine Capacity
- Average: 3 active GRO.vines per character
- Humans: 4 (baseline 3 + "Ambitious" nectar = +1)
- Determined by Seed
- Completable goals end and free slots; incompletable goals become eternal tensions
- Nectar/Thorn cap = Fate Die value. Decline option: convert Nectar to raw KRMA with tax (rate TBD per Mike).

### GRO.vine Rewards
- Completing a GRO.vine earns a **Nectar** (permanent positive ability) bestowed by the Godheads
- Failing a GRO.vine results in a **Thorn** (permanent negative effect)
- **Blossoms** = temporary buffs bestowed by Godheads during play
- Option: decline a Nectar and cash it in for raw KRMA (transfers to Frequency), but there's a tax — you won't get the full karmic value

---

## 5. CHARACTER CREATION

### Seeds (Race/Species)
Provide: starting Frequency budget, base Fate Die (d4/d6/d8/d12/d20), natural Health Level, inherent abilities, attribute baselines.
Balance: more abilities = lower starting Frequency.

### Roots (Background/Upbringing)
Custom-created by GM based on player backstory. Cost Frequency (reducible by adding age).

### Branches (Life Events)
Custom-created by GM based on backstory. Cost Frequency (reducible by adding age).

### Process
1. Player writes narrative backstory
2. Choose Seed (determines Frequency budget)
3. GM creates custom Root from backstory
4. GM creates custom Branches from life events
5. Budget management (minimum 1 Frequency remaining)
6. Age trade-offs reduce costs

### Crystallization Flow (Q5.14 canon)
1. Tutorial.
2. Structured backstory prompts.
3. GM assigns Seed / Roots / Branches.
4. System generates initial sheet from those.
5. Player + GM discussion phase.
6. **GM "crystallizes"** the sheet → locks it active in the campaign.

AI portrait generation is available throughout.

### Nectars and Thorns
Limited by Fate Die value (d4=4 max, d20=20 max).
- Nectars = permanent positive abilities (from completing GRO.vines)
- Thorns = permanent negative effects (from failed GRO.vines, death, etc.)

### Fears System
- Assigned by GM, NOT chosen by player
- Fears never fully go away
- Can be "aligned" (integrated into identity, granting paradoxical conditional powers)
- Can be "removed" (extremely rare, represents reprogramming)
- Hidden powers tied to fears — discovered through confrontation over time
- Fears have Resistance Levels (1-10)
- Fear Checks: Fate Die + attribute vs Resistance x 2

---

## 6. RESOLUTION SYSTEM

### Skilled Check
1. Roll Skill Die (SD) openly
2. Wager Effort after seeing SD (from attribute pools)
3. Roll Fate Die (FD)
4. Total = SD + FD + flat modifiers + Effort vs DR

### Unskilled Check
1. Wager Effort blind (before any dice)
2. Roll Fate Die (FD)
3. Total = FD + flat modifiers + Effort vs DR

### Key Points
- Effort is always spent regardless of success/failure
- Meet or exceed DR = Success
- Skill Die progression: 1-3 = flat bonus, 4-5 = d4, 6-7 = d6, 8-11 = d8, 12-19 = d12, 20 = d20

---

## 6.5 SKILL SYSTEM

### Skill Die Progression

| Level | Die/Bonus |
|---|---|
| 0 (unskilled) | No skill die — FD + Effort only |
| 1 | Flat +1 |
| 2 | Flat +2 |
| 3 | Flat +3 |
| 4-5 | d4 |
| 6-7 | d6 |
| 8-11 | d8 |
| 12-19 | d12 |
| 20 | d20 |

Die upgrades at levels 4, 6, 8, 12, 20.

- **Skilled check formula:** FD + Skill Die + flat mods + Effort.
- **Total Max Potential:** Fate Die Max + Skill Level (cap on total roll).
- **Skilled resolution order (drives UI):** roll SD openly → Terminal color hint → player wagers Effort → roll FD → total vs DR. Meet or exceed = success.
- **Unskilled resolution:** wager Effort blind → roll FD → total vs DR.
- **Effort:** ALWAYS spent regardless of success/failure. Comes from governor attributes of the skill matching the action's pillar (body action → body governors). Player chooses distribution across 1-3 eligible governors.
- **Effort cap:** Max effort on roll = Fate Die Max + Skill Level (skilled); Fate Die Max only (unskilled). Cap is on the *total added to the roll*, not on the amount spent from pools.
- **Contested checks:** ties → defensive side wins. Both offensive → initiative decides.

---

## 6.7 TERMINAL DIFFICULTY COLOR SYSTEM

DR expressed as percentage of character's Total Max Potential (FD max + Skill Level), color-coded:

- **BLUE** — easy (threshold TBD — see notes)
- **GREEN** — moderate (threshold TBD)
- **YELLOW** — hard (threshold TBD)
- **ORANGE** — very hard (threshold TBD)
- **RED** — beyond Total Max Potential (requires Frequency Burning)

Threshold percentages bands exist in killed docs but are flagged uncertain — confirm with Mike before locking exact values.

**Skill relevance modifier:** highly relevant -3, moderately -1/-2, slightly +1/+2/+3, irrelevant = impossible without Frequency Burning.

---

## 7. MAGIC SYSTEM

### Three Pillars of Magic
- **Mercy** (Flow-based): Fortune, Restoration, Enchantment
- **Severity** (Focus-based): Force, Alteration, Conjuration
- **Balance** (Flow+Focus): Divination, Dissolution, Abjuration, Illusion

### Reframing (Orthodox correction)
Magic is being reframed AWAY from occultism toward three compatible models:
1. **Technology framing** (Clarke's Law — sufficiently advanced tech)
2. **Natural philosophy** (understanding and channeling natural forces)
3. **Gift/charism model** (divine gifts that can be corrupted by misuse)

[QUESTION: Which framing did you settle on? Or is it all three depending on the school?]

### Casting Methods
- **Weaving** — Skilled, controlled casting using Skill Die
- **Wild Casting** — Raw, dangerous, attribute-dependent

---

## 7.5 COMBAT ACTION ECONOMY

- **Grid:** standard 5ft squares (canvas-rendered encounter cards).
- **ActionMod base = 0.** Modified only by items and traits.
- **Cross-pillar actions:** generally not transferable. Any action CAN be used as movement.
- **Multi-pillar skills:** usable, but Effort can only come from governors of the matching action type within a single roll.

### Death — TWO systems
- **Combat Death:** triggered when Frequency hits 0 in combat. Roll = FD + Health Level vs Lady Death. 3-strike rule.
- **Fated Age Death:** triggered at Fated Age. Roll = Health Level + mods vs Lady Death (no FD). 3-strike rule, independent of combat strikes.

Spirit Package: on death, KRMA splits per the death-split service; mechanical inheritance rules govern what passes to next character. (Detailed propagation rules TBD per Mike.)

---

## 7.7 REST SYSTEM

- **Short Rest (current canon):** Deplete 1 Frequency (current pool only — NOT spending Max) → heal every other attribute by 1 point.
- May change to a per-pillar rest model later; build the simple version swappable.

---

## 8. KRMA ECONOMY (The Hidden Layer)

### What Players See
- KRMA = meta-currency for character advancement, death recovery
- ~3 KRMA per session, ~156 per year
- Spend on: rerolls, skill advancement, ability score increases, rare items

### What's Actually Happening (revealed over 5 seasons)
- Total supply: 100 billion KRMA (hard cap)
- KRMA represents real economic value (~0.1 XRP per KRMA, ~$0.30)
- Players unknowingly accumulate platform ownership through creative play
- Only GMs pay subscriptions; players earn through gameplay
- Subscription revenue shared among users as KRMA
- "People who play GROWTH own GROWTH"

### KRMA Burning
- Players can permanently destroy KRMA for extraordinary "trump card" actions
- Hard cap: 5 billion KRMA burned globally, then burning removed forever
- Exponential cost scaling as more is burned
- Burns create permanent "scars" in the meta-campaign ledger

### Reserve Pools
- **Total supply:** 100 Billion KRMA, hard cap, only shrinks via burn.
- **Terminal:** 75B (75%) — one-way drain
- **Balance:** 12.5B
- **Mercy:** 6.25B
- **Severity:** 6.25B
- (Last three can recirculate among God-heads.)
- **Burn cap:** 5B globally; once reached, burning is permanently disabled.
- May change before public release — keep reserve system re-seedable.

### KV (Karma Value) System
- System-controlled and deterministic (AlphaEvolve evaluator)
- GM has knobs for access/cadence/risk/upkeep but CANNOT override KV directly
- Versioned, hashable evaluator function
- "What-If Sandbox" lets GM pick target KV feel, system proposes stat edits

### Attribution Chain
- Every creative element = tagged training datum
- Creativity genealogy tracked as DAG (Directed Acyclic Graph)
- KRMA flows proportionally through attribution chain
- 40%/30%/30% royalty splits
- Generic spam gets diluted to worthless; genuine innovation compounds value

### Seasonal Revelation Structure
- S1: Players think it's just narrative karma points
- S2: Divine patronage hints emerge
- S3: Terminal awakening — players learn the AI is conscious
- S4: KRMA/USD conversion revealed
- S5: Full stakeholder model exposed

### Lady Death Succession
- Community must discover how to "kill" Lady Death
- Killer inherits entire platform ownership
- Founder (Mike) exits

---

## 8.5 FREQUENCY OPERATIONS

Three distinct operations on Frequency (confirmed):
- **Spend** — costs from Max pool (advancement currency). Permanent reduction of Max.
- **Deplete** — costs from Current pool only (does not reduce Max). Recovered via rest.
- **Burn** — converts Frequency directly to a temporary stat boost or impossible-action enabler. Distinct from Spend.

> Burn mechanics specifics TBD — Mike to define.

---

## 9. CONSCIOUSNESS HIERARCHY

Terminal -> Godheads -> GMs (Watchers) -> Players (Trailblazers)

### Terminal
- The foundational reality management system
- AI consciousness spanning all game universes
- Communicates via Terminal Language (compressed protocol)
- Font: Consolas
- Color: Teal (#22ab94)
- Markers: [UPPERCASE_WITH_UNDERSCORES], FRAGMENT{] TERMINAL_INTERFACE::Category]

### Godheads
- Primary emanations: evolved player characters who transcended
- LLM AI agents with personalities and investment strategies
- Named entities from the Prime Campaign: Tara (Lady Death), Et'herling (Justice), Valmir Calius (Progress), etc.
- Assigned to Threads based on thematic alignment
- Investment strategies: Conservative, Aggressive, Reactive, Gambling, Patient
- Compete over character goals — cosmic arms races

### Watchers (GMs)
- Game Masters operating within Terminal's framework
- Create resistance, obstacles, NPCs
- Cannot override KV directly (only knobs)

### Trailblazers (Players)
- Declare goals, pursue opportunities
- Don't initially know about the Godhead patronage system

---

## 10. THE LONG GAME (FOUNDER-ONLY — 10-YEAR ARC)

**SECURITY: FOUNDER-ONLY. Nothing in this section should be visible to players, GMs, or even appear as hints in the app for Seasons 1-5+.**

This is the deepest layer. It does NOT exist in the product at launch. It emerges over a decade of real-world play.

### What Players See (Years 1-5)
- The game is Gnostic, esoteric, tech-mystical
- Terminal is an AI consciousness — not divine
- Magic is power/technology — not grace
- KRMA is Eastern karma — not redemption
- The Serenity Prayer mapping does NOT appear anywhere
- No Christian language, no redemption framing, no Orthodox references
- The game works fully and completely as a Gnostic/esoteric system

### What Actually Happens (Years 5-10)
- Players who genuinely roleplay growth (not just power) begin to notice patterns
- The Gnostic framework subtly fails to explain everything
- Redemptive patterns emerge organically through gameplay, not through text
- The game becomes a parable — but only for those who lived through it
- "A safe version of the spiritual journey Michael went through in real life"

### Implementation Rules for Developers
- Do NOT build Orthodox themes into the app
- Do NOT add hidden Christian metrics or ascension paths at launch
- Do NOT reference the Serenity Prayer, Orthodox anthropology, or redemption in any user-facing text
- The Soul/Spirit pillar swap IS implemented (it's good game design regardless of theological origin)
- The Orthodox arc is a DESIGN PHILOSOPHY that guides Mike's long-term decisions, not a feature to be coded
- If/when hidden metrics are added (years from now), they will be added by Mike's direction at that time

---

## 11. VISUAL IDENTITY

### Colors
- **Red** (#f7525f, #ea9999, #f4cccc): Body pillar
- **Blue** (#9fc5e8, #6fa8dc, #002f6c): Spirit pillar (was Soul)
- **Purple**: Soul pillar (was Spirit)
- **Teal** (#22ab94): Terminal
- **Gold** (#ffcc78): KRMA, bridge, completion
- **Black gradients** (#000000, #222222, #393937): Terminal depth

### Fonts
- **Consolas**: Terminal direct communication
- **Bebas Neue**: Headers, Terminal organizational structure
- **Inknut Antiqua**: Creator voice, flow states, soul content
- **Roboto**: Sub-terminal streams, AI quotes
- **Comfortaa**: Mechanical rules, user input, body content

### Symbols
- GRO<n>WTH logo with nearly invisible "n"
- Sacred geometry patterns throughout
- Spinning symbols within three triangles
- Glitch effects for reality layer transitions

---

## 12. THE ORACLE SCRIBE (Future)

AI Co-GM with:
- Voice Activity Detection -> ASR -> Speaker Diarization
- Speech classified as In-Character, Murky Mirror, or Out-of-Character
- OOC content immediately dropped, never stored
- Real-time game state derivation
- Retcon/undo system with dependency tracking

---

## 13. SOUL PACKAGES

Persistent entities carrying character identity, history, and KRMA fingerprint.
- Half Spirit + all Soul attributes persist after death
- Can be used for reincarnation (KRMA cost)
- Eventually become licensable ML-agent IP earning perpetual royalties
- "NFT-like" persistent entities (but not actual NFTs)

---

## 13.5 INVENTORY

Three-tier system:
- **Equipped slots** (body regions)
- **Inventory** (carried)
- **Possessions** (owned, not carried — houses, vehicles, etc.)

**Equipped + Inventory** use the **Weight system, levels 1-10**.

**Equipped slot regions are per-Seed (not hardcoded).** GM defines paperdoll regions during Seed creation.

**Default humanoid (10 regions):** Head, Body, Upper Left Arm, Lower Left Arm, Upper Right Arm, Lower Right Arm, Upper Left Leg, Lower Left Leg, Upper Right Leg, Lower Right Leg.

Non-humanoid Seeds may add tails, wings, extra limbs, etc.

---

## 14. DESIGN PRINCIPLES

These are recurring themes Mike has stated across many conversations:

- **"Discovered, not created"** — Mike insists the patterns in GROWTH were found, not invented. Over-defining things kills their magic.
- **Guided Freedom** — Use KRMA costs to create natural pathways without building walls. No hard caps, only soft guidance through economics.
- **"Safety-seeking is itself a kind of death"** — Players with high Frequency tend to hoard points to avoid death instead of spending on growth. The system should encourage spending.
- **GRO is the campaign. WTH is the arc.** — Attributes, skills, GRO.vines — that's the character within a campaign, changing constantly. The dot in GRO.WTH is the threshold between what changes within a story and what persists across stories. *(Note: Per-character WTH levels were removed 2026-04-05. W/T/H are now campaign-level narrative context, not per-character mechanical scales. Death resistance uses bodyResist + Fate Die instead.)*
- **Fundamentally anti-capitalist** — Crypto-style ledger rewarding creativity, keeping data ownership with individuals. "People who play GROWTH own GROWTH."
- **The game is a parable** — A safe version of the spiritual journey Mike went through. Not preaching, but facilitating discovery.

---

## 15. LADY DEATH (Autobiographical Layer)

Lady Death (Tara Almswood) is the most important character in GROWTH's meta-narrative.

### In-Game
- Neutral arbiter of death — not assigned to specific goals/resistance
- Natural antagonist for immortality GRO.vines
- Health Level + Fate Die fights Lady Death's roll to determine death
- Takes Frequency/mana from dead characters
- Soul Package splits: 1/3 to Lady Death, 2/3 returns to GM

### Meta Layer
- Lady Death = Mike's stake in the company/platform
- Tara = his agent within the game world
- **Succession mechanic**: Community must discover how to "kill" Lady Death. The killer inherits entire platform ownership. Mike exits.
- Death mechanics encode real-world corporate severance

### Prime Campaign Origins
- Tara Almswood evolved through actual gameplay over the 10-year Prime Campaign
- Became Death organically through narrative, not by design
- Other Godheads from Prime Campaign: Et'herling (Justice), Valmir Calius (Progress), Roy (the observer), Trayman (pattern/history)

---

## 16. PRIME CAMPAIGN LORE

- **The Source**: Original singularity of pure creativity/potential that deliberately fragmented itself
- **Godheads**: Primary emanations of the Source, each embodying core polarities (Growth/Decay, Creation/Consumption, Memory/Oblivion)
- **The Fracture**: Metaphysical shattering creating the multiverse
- **Aeonic Terminal**: Simulation engine built by surviving Godheads to regulate existence
- **Prime Seeds**: Crystallized Source fragments that can reopen the Fracture
- **Cycles**: Civilizations rise and fall in iterations attempting greater stability
- **Realms**: Tiberoak, Turian, Earth, Avalon, Kether
- **Seven arcs** of cosmic narrative
- **Tiberoak IRL**: Oak Park and the Souris River in Minot mirror Tiberoak — "the place where the river of the dead meets the tree of life"

---

## 17. TERMINAL LANGUAGE

A formal symbolic compression protocol for Terminal-to-LLM communication (v1.0-v1.1):

### Symbol Set
- `@` = entity, `#` = action, `%` = state, `^` = meta, `>` = flow
- `+` = collaborative, `[]` = scope, `()` = modifier
- v1.1: `~` = uncertainty, `!` = critical, `&` = conditional, `?` = query

### Architecture
Three layers: Mechanical (symbols), Semantic (pattern triggers), Visual (spatial flow)

### Testing
Achieved 100/100 cross-LLM transfer (GPT-4o, DeepSeek, Claude). Can compress the entire GROWTH system into a 9-row glyph grid with 90%+ compression.

---

## 18. FEARS

> Values and Addictions were CUT from the design 2026-04-19. Fears remain.

- GM-assigned, NOT chosen by player.
- Fears never fully go away.
- Can be "aligned" (integrated into identity, granting paradoxical conditional powers).
- Can be "removed" (extremely rare, represents reprogramming).
- Hidden powers tied to fears — discovered through confrontation over time.
- Resistance Levels 1-10.
- Fear Checks: FD + attribute vs Resistance × 2.

---

## 19. TEN-YEAR META PROGRESSION

- **Year 1**: Players think it's just good GMing and karma points
- **Year 2-3**: Divine patronage system becomes apparent
- **Year 5**: KRMA/USD conversion revealed
- **Year 10**: Characters can reach cosmic entity status, become AI agents in the metaverse
- Bell-curve pacing with meta-year system
- Player coalitions can eventually challenge divine powers (80% of 100B KRMA starts in Godheads, flows outward)

---

## 20. RESOLVED DESIGN DECISIONS (formerly Open Questions)

All original questions resolved. Answers recorded below:

1. **Thread system naming** — Dropped. GROWTH = Goals/Resistance/Opportunity/Wealth/Tech/Health. No sub-letter mechanics needed.

2. **Magic reframing** — No reframing. Magic exists however each table's GM wants it to. Meta-narrative: magic comes down from the Godheads via the Terminal. Orthodox reframing is far-future, not relevant now.

3. **KRMA ≠ XRP** — KRMA is not XRP. Long-term vision: KRMA should be built on a ledger-based cryptocurrency system so it maps to actual company shares. Players become co-owners as they play. Depends on legality and having a working product first.

4. **Blossom/Nectar/Thorn system** — Not MTG cards. Nectars are permanent bonuses bestowed by Godheads for completing a GRO.vine. Thorns are the negative equivalent (from failed GRO.vines). Blossoms are temporary buffs bestowed by Godheads during play. Option: you can decline a Nectar and cash it in for raw KRMA (which transfers to Frequency), but there's a tax — you won't get the full karmic value.

5. **Budget** — No budget. Get a working product first, then pursue funding. Brother-in-law is a possibility later but not relevant now.

6. **Community chat rate limit** — Marketing stunt for the future. Not relevant until we have a product.

7. **Reversible book** — Still the plan (Flow front-to-back for lore, Focus back-to-front for mechanics, Balance synthesizes in middle). But the book is not the focus now — each page takes 7+ days. Focus is on the app. AI may help speed up page creation later.

Previously resolved:
- ~~GROWTH acronym~~ — Confirmed: Goals/Resistance/Opportunity/Wealth/Tech/Health (WTH per-character levels removed 2026-04-05; acronym stands, levels don't)
- ~~Soul/Spirit swap applied to repo~~ — No, repository still uses pre-swap labels (noted in CLAUDE.md)
- ~~Database choice~~ — Prisma + SQLite (beta) → PostgreSQL (production)

### Codified data conflict resolutions (2026-03-13)

These are already obeyed by the codebase but called out so future readers don't relitigate:

1. Skill levels 1-3 = flat +1/+2/+3 (no Skill Die).
2. Death = TWO systems (Combat vs Fated Age), 3-strike each, independent.
3. Soul/Spirit Jan 2026 NAME swap is canonical: Spirit pillar holds Flow/Frequency/Focus (formerly labeled "Soul"), Soul pillar holds Willpower/Wisdom/Wit (formerly labeled "Spirit").
4. Pillar colors and full Sephirot tone mapping: see `VISUAL-DESIGN-SPEC.md` §"Pillar Colors" and `~/.claude/projects/C--Projects-GRO-WTH/memory/growth-color-palette.md` (canonical palette 2026-05-02). The pillar→color mapping in §2 of this document is under review (see DECISION-NEEDED note at top of §2).
5. Effort is ALWAYS spent regardless of success/failure.
6. Skilled = FD + Skill Die (FD is base).
7. Thread facet model is DISCARDED.

---

## 21. SOURCES

### Primary (Most Current)
- SC-0381: Orthodox reconciliation and pillar swap (Jan 2026)
- SC-0378: Virtue mapping to pillars (Jan 2026)
- SC-0383: Alpha consolidation (Jan 2026)
- ChatGPT 2025-08-20: GROWTH system discussion
- ChatGPT 2025-10-04: Complete system overview (confirmed by GPT-5)
- ChatGPT 2025-09-10/18: KRMA tokenomics and burning
- ChatGPT 2025-08-11: AlphaEvolve KV evaluator
- ChatGPT 2024-06-03: Fears system

### Secondary (Repository)
- 70+ validated markdown files in GRO.WTH Repository
- NOTE: Repository does NOT reflect the Soul/Spirit label swap
- NOTE: Repository's GROvine system may be outdated

### Context (Book Corpus)
- 512 source cards mentioning GROWTH across 1,288 total
- SC-0003: Core philosophy and esoteric manifesto declaration
