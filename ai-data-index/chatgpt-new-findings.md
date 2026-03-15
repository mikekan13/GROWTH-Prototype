# New Findings from ChatGPT Design Conversations

**Generated:** 2026-03-13
**Method:** Compared extracted ChatGPT design decisions against COMPREHENSIVE-BUILD-PLAN.md
**Filter:** Only items NOT already covered in the build plan, with concrete design value

---

## 1. GROWTH Acronym: Full Six-Letter Thread Model (W, T, H Defined)

The build plan notes the GROWTH acronym conflict (Section "Data Conflicts #7") but does NOT contain the detailed six-letter Thread model that was extensively designed in ChatGPT. This is the most significant new finding.

### Thread Facet Definitions (Locked)

| Letter | Name | Author | Mechanical Effect |
|--------|------|--------|-------------------|
| **G** | Goal | Trailblazer | Win clause. Completion spawns Nectar (potency = KV+1). Advance = +2 KV, +2F. Setback = -2 KV, -1F. |
| **R** | Ritual | Trailblazer + Watcher | Daily discipline. Upheld once between rests = Max F +1, no KV change. Broken = no penalty stated. |
| **O** | *(name TBD)* | Watcher | Repeatable act that pumps KV. Each qualifying hit = +1 KV. No Frequency moves. Upside-only. |
| **W** | Worry | Watcher | Recurring anxiety. Each time it flares = -1 KV. Mirror of O. |
| **T** | *(name TBD)* | Godhead/divine | Costly divine bargain. First time per rest vow is upheld: Max F +1 AND KV -2. |
| **H** | *(name TBD)* | Terminal | Failure condition. If triggered before Goal completes, Thread ends in Thorn (potency = |KV|+1). |

### Thread Resolution
- KV >= 0 at completion --> Nectar (potency = KV + 1, minimum 1)
- KV < 0 at completion --> Thorn (potency = |KV| + 1)
- KV resets to 0 when Thread goes Dormant

### Naming Shortlists (Still Open)
- **O**: Offering, Opportunity, Overflow, Opt-in, Outpouring
- **T**: Tribute, Tithe, Toll, Temptation, Tradeoff
- **H**: Hex, Hubris, Halt, Hazard, Hard-Stop

**Source:** "Defining growth concept" (2025-07-21) [user + assistant, multiple exchanges]
**Confidence:** HIGH -- Mike actively designed this with ChatGPT across multiple rounds, confirming and correcting details. Mike explicitly locked G, R, W names.

---

## 2. Frequency: Spend vs Burn (Two Distinct Mechanics)

The build plan mentions Frequency and KRMA burn but does NOT clearly distinguish spend vs burn as two separate pool operations.

- **Spend F** (normal use): Subtract from current F. Pool refills to Max F on rest/sleep. If current F hits 0, character dies.
- **Burn F** (sacrifice): Subtract from current F AND reduce Max F by same amount. Max F only recovers through special fiction (meditation, rare Nectar, etc.).

**Example:** Max F = 7, Burn 2F --> current F = 5, Max F now = 5. Later Spend 3F --> current F = 2. After sleep, current F refills to 5 (not 7).

Mike confirmed: "spending would be like I want to upgrade a skill level or an attribute level... But let's say I have a nectar that does something but exhausts 3 frequency in exchange. Then that's 3 from the pool not max."

**Source:** "Defining growth concept" (2025-07-21) [user confirmed]
**Confidence:** HIGH -- Mike explicitly confirmed this model.

---

## 3. Blossoms: AI Godhead-Generated Live Buffs

The build plan mentions Blossoms only as "temporary buffs with expiry" under traits (3B.4). The ChatGPT data defines a much more specific system.

- Blossoms are NOT pre-written. They are **generated in real-time by Godhead LLM agents**.
- Each active Thread is watched over by a specific Godhead.
- Blossoms are bestowed at session start and can refresh mid-session when narrative shifts.
- Potency rated 1-3, never alters KV or Frequency directly.
- On Thread completion/failure, the Blossom vanishes before the Nectar/Thorn appears.
- Each Godhead has a "flavor sheet" (Domain, Tone, Boon style, Bane style) that constrains the LLM's improvisation.
- Watcher can "nudge" the prompt if a Blossom would break balance.

**Source:** "Defining growth concept" (2025-07-21) [assistant, confirmed by user]
**Confidence:** HIGH -- Mike confirmed: "the AI doesn't just curate. It bestows blessings from the godheads" and "blossoms will change significantly depending on what godhead they are tied to."

---

## 4. Death Save Details (Answers Build Plan Question #6)

The build plan's Data Conflict #6 asks: "How many death saves? What's the DC? Is it escalating?"

ChatGPT data confirms from the rulebook review:
- **Three strikes rule**: Each failed Death Save adds a health-related Thorn. Three failures = death.
- Death Saves start **annually** upon reaching Fated Age.
- Fated Age calculation: Lifespan Level x Tech Level multiplier x Fated Percentage (from 2d100 roll by Lady Death).

**Source:** "Rulebook Structure and Focus" (2025-03-24) [confirmed as "Clear and Explicit" from rulebook]
**Confidence:** HIGH -- Extracted directly from Mike's rulebook text reviewed by ChatGPT.

---

## 5. Combat Phase = 6 Seconds

The build plan describes phase-based combat but does not specify the in-game duration.

- Each **combat phase = 6 seconds** of narrative time.
- Phase-based (not player-based) turns.

**Source:** "Rulebook Structure and Focus" (2025-03-24) [assistant confirmed from Mike's input]
**Confidence:** HIGH -- Mike stated this directly.

---

## 6. Skill Level Mechanics: Levels 1-3 Are Flat Bonuses (Answers Build Plan Question #5)

The build plan's Data Conflict #5 asks: "Is it +1/+2/+3, or nothing?"

ChatGPT data confirms through a detailed worked example that Mike corrected multiple times:
- **Skill Levels 1-3**: Flat bonus (+1/+2/+3) added directly to Fate Die roll. No Skill Die.
- **Skill Level 4**: Introduction of Skill Die (d4). Total = Fate Die + d4.
- **Skill Level 5+**: Skill Die remains d4, but Total Max Potential = Fate Die Max + Skill Level (not skill die max). Reaching full potential above dice max requires spending at least 1 Effort point.

**Source:** "Rulebook Structure and Focus" (2025-03-24) [user corrected assistant multiple times to arrive at final version]
**Confidence:** HIGH -- Mike actively corrected the AI to get this right across 4+ iterations.

---

## 7. Terminal Difficulty Color System

Not in the build plan. The Terminal displays color-coded difficulty based on the player's maximum potential output:

- **BLUE**: DR is <= 25% of total potential
- **PURPLE**: DR is <= 50% of total potential
- **RED**: DR is > 50% of total potential

Total potential = Fate Die max + Skill Level (not skill die max).

**Source:** "Rulebook Structure and Focus" (2025-03-24) [assistant, corrected by Mike]
**Confidence:** HIGH -- Confirmed through multiple correction rounds.

---

## 8. Godhead KV Grading System (Clarifies Build Plan Section on KRMA)

The build plan mentions KRMA and TKV evaluator but does not describe the Godhead grading role specifically.

Mike clarified: "Kai (Chaos and Order) and Et'herling (Justice) don't oversee KRMA balances across campaigns in so much as they judge and grade all elements created. Woven spells, Items, Blossoms, Thorns, Seeds, Every modular thing in this gets graded when created. They assign it a KV or Karmic Value."

This means:
- Godheads of Justice + Chaos/Order are the **KV evaluators** for all created content.
- GM can imagine anything, but must have the KRMA budget to materialize it.
- The grading is automatic/system-driven, not narrative.

**Source:** "Rulebook Structure and Focus" (2025-03-24) [user]
**Confidence:** HIGH -- Direct Mike statement.

---

## 9. KRMA Multiplier System (Sector-Based)

The build plan mentions spending multipliers but not the specific sector/popularity model.

Mike clarified: "The multipliers are essentially sectors. The sectors have the multipliers and that is how much the KRMA increases when coming in. Like every Godhead, Watcher, I mean even on a character level (although strictly controlled). That is what is happening. If I give you one krma and your multiplier was 2 well then you would see it as 2."

And: "The multipliers are essentially how popular that thing is... Like a GM with a large wallet would essentially have many other Watchers (GM) using his creations, like seeds, items, whatever."

**Source:** "Karma Growth in GROWTH" (2025-02-21) [user]
**Confidence:** MEDIUM -- Mike explained the concept but specific formulas were not finalized.

---

## 10. Rest System: Dice-Based Recovery (Not Just 1:1 Frequency Spend)

The build plan describes rest as "Short rest: spend Frequency 1:1 to heal pools" and "Long rest: full recovery." The ChatGPT data shows a more complex dice-based system was discussed:

- **Short Rest (1-7 hours)**: Roll Fate Die per hour, pick one pillar to recover. Max 5 rolls.
- **Sleep**: Free-pick pillar (any), normal Fate Die rolls. Short sleep (<=4h) = half value.
- **Long Rest (>=8 hours)**: Full restore only if no Sleep Debt. Sleep Debt accrues if Long Rest is skipped.
- **Sleep Debt**: -1 per debt point from recovery totals.

However, Mike said "Forget the way it is written atm... I mean the mechanics. I want you to really go over the mechanics of it and weigh the cons and pros" -- indicating this was brainstorming, not final.

**Source:** "Rest Recovery System Review" (2025-04-30) [assistant proposal, user asked for review]
**Confidence:** LOW -- This was brainstorming/evaluation, not confirmed as canon. The simpler model in the build plan may be Mike's current preference.

---

## 11. Wealth/Tech/Health Level Tracks (Full 1-10 Scales)

The build plan references these but does not include the full scale definitions. ChatGPT extracted complete scales:

### Wealth Levels
1. Destitute, 2. Impoverished, 3. Poor, 4. Modest, 5. Comfortable, 6. Affluent, 7. Wealthy, 8. Prosperous, 9. Opulent, 10. Magnate

### Tech Levels
1. Primitive (Stone Age), 2. Basic (Bronze/Iron Age), 3. Simple (Medieval), 4-10. (progressively more advanced through modern and sci-fi)

### Health/Lifespan Levels
1-10 scale where 1 = ~3 years lifespan, 10 = immortality

**Source:** "G.R.O.W.T.H system overview" (2025-08-20) [extracted from repository files]
**Confidence:** HIGH -- Directly from canonical repository files.

---

## 12. Synchronicity (GM Alignment Metric)

Not mentioned in the build plan at all. From the earliest ChatGPT conversations:

- **Synchronicity** is a metric exclusively for GMs (Watchers), ranging from -100 to +100.
- Zero = perfect alignment with The Terminal's narrative.
- Positive = penchant for adding novel lore to the universe.
- Negative = preference for existing tales.
- GMs can choose "Disconnection" to craft stories outside GROWTH's AetherNet.

**Source:** "Canvas for Growth Support" (2024-10-05) [from rulebook extraction]
**Confidence:** MEDIUM -- This is from early rulebook material and may have been superseded. Not mentioned in DESIGN-TRUTH or recent conversations.

---

## 13. Rulebook Physical Design: Dual-Orientation

Not relevant to app development but notable for context:
- Front of book (Flow side): Spine at top, narrative/lore/philosophy.
- Middle (Axis Mundi): Spine shifts orientation, bridging narrative and mechanics.
- Back (Focus side): Spine at bottom, pure mechanics.

**Source:** "Rulebook Structure and Focus" (2025-03-24) [confirmed by Mike]
**Confidence:** HIGH -- But not relevant to current app development.

---

## 14. Equipment Durability States

Briefly mentioned in ChatGPT but not in the build plan:
- Item conditions: **Undamaged, Worn, Broken, Removed**
- Separate Hard/Soft resist ratings on items

**Source:** "Rulebook Structure and Focus" (2025-03-24) [from rulebook review]
**Confidence:** HIGH -- From canonical rulebook material, but may need Mike confirmation for current relevance.

---

## Items NOT Included (Filtered Out)

The following were present in the ChatGPT data but excluded from this report:
- **XRP/blockchain integration**: Brainstorming only, explicitly superseded by current SQLite/Prisma approach
- **Unity development discussions**: Superseded by Next.js decision
- **AI twin/Ouroboros Engine**: Far-future speculation
- **Google Docs/Sheets workflows**: Dead per CLAUDE.md
- **Repeated descriptions of attributes, pillars, dice**: Already fully captured in build plan
- **ChatGPT workflow recommendations**: Development process advice, not game design
- **Social media campaign details**: Already noted in build plan Phase 7.3
- **Sonnet 4 discussion**: Not GROWTH-related
- **Periodontal treatment**: Not GROWTH-related
