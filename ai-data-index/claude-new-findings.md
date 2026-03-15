# Claude Data: New Findings Not in Build Plan

**Generated:** 2026-03-13
**Method:** Compared `claude-design-decisions.md` (339 excerpts from 30 Claude conversations) against `COMPREHENSIVE-BUILD-PLAN.md`
**Note:** The source file has severe duplication (~70% of content is the same Terminal Speak compression block repeated across every category). Unique findings are limited but several are significant.

---

## 1. GROWTH Thread Model (GRO.vine Facets) -- MAJOR NEW SYSTEM

**Source:** GROWTH RPG Character Model Design (2025-07-22)
**Confidence:** HIGH -- Mike presented this as "locked-in facets" he was actively refining

The build plan describes GRO.vines as Goals/Resistance/Opportunity but Mike developed a much more detailed **six-letter GROWTH thread model** where each letter is a facet:

| Letter | Name | Mechanic | Author |
|--------|------|----------|--------|
| **G** | Goal | Player-written win clause. Thread ends in NECTAR (potency = KV + 1) | Player |
| **R** | Ritual | Daily discipline. If upheld once between rests: Max Frequency +1 (no KV change) | Player + Watcher |
| **O** | ??? (open) | Watcher-offered repeatable act. Every time seized: KV +1 | Watcher |
| **W** | Worry | Watcher-written anxiety line. Each time it flares: KV -1 | Watcher |
| **T** | ??? (open) | Costly divine bargain. First time per rest upheld: Max F +1 AND KV -2 | Godhead |
| **H** | ??? (open) | Terminal-authored failure condition. If triggered before Goal: thread ends in THORN (potency = |KV| + 1) | Terminal |

**Key mechanics not in build plan:**
- Each thread has a running **KV counter** that goes up and down based on facet triggers
- Thread KV determines potency of resulting Nectar or Thorn
- Rituals grant Max Frequency +1 (a specific recovery mechanic tied to GRO.vines)
- The T facet is a "divine bargain" from the Godhead AI -- gains Frequency but costs KV
- The H facet is authored by the Terminal AI, not the GM
- O, T, and H names were still being decided as of July 2025

**Relevance to build plan:** The GROvine Panel (marked SKELETON) needs this facet system. The current build plan's GRO.vine description (Section 3E.3 Harvests, GROvine panel) is much simpler than this.

---

## 2. Skilled vs Unskilled Roll Formula Clarification

**Source:** Notion Workspace Restructuring (2025-08-05)
**Confidence:** HIGH -- Mike stated this as a correction

> "If using a skill its 1d6 + (dice or mod associated with skill level) + Effort... if unskilled check then it is fate die + effort from attribute pool. Max checks cant go above max of Fate die + Skill even with added effort (this is called wasted effort when it goes over)"

**What's new vs build plan:**
- **Skilled checks use 1d6** (not Fate Die) as the base die, plus a skill-level die/mod
- Unskilled checks use Fate Die + effort only
- There is a hard cap: total cannot exceed Fate Die max + Skill level = "wasted effort" mechanic
- The build plan (3B.1, 3C.2) describes "Fate Die + Skill Die + Effort" for all checks without distinguishing the 1d6 base for skilled rolls

**This directly answers build plan [QUESTION] in Section 5 (Flat Bonus at Skill Levels 1-3)** -- the "flat bonus" may actually be the 1d6 replacing the Fate Die, plus whatever skill-level modifier applies.

---

## 3. Rest System -- Mike Considering Pillar-Specific Rests

**Source:** Organizing a Comprehensive Game Manual (2025-04-30)
**Confidence:** MEDIUM -- Mike said he has "gone back and forth on it"

> "Currently we have rest and long rest. Long rest just restores all attribute pools while a rest allows you to deplete one frequency to replenish every other attribute by 1. I have toyed with an idea of having rest broken into 3 or more... Entertainment or pleasure to rest the Spirit, Sleep to rest the body, and meditation or similar for the soul."

**What's new vs build plan:**
- Short rest is 1 Frequency to restore 1 point to every other attribute (not the 1:1 ratio described in build plan 3B.3)
- Mike considered pillar-specific rests (entertainment=Spirit, sleep=Body, meditation=Soul) but hasn't committed
- Build plan says "spend Frequency to heal any attribute at 1:1 ratio" -- Mike says it's "deplete one frequency to replenish every other attribute by 1"

**This is a potential correction** to build plan item 3B.3.

---

## 4. Addiction Mechanic Hint

**Source:** Organizing a Comprehensive Game Manual (2025-04-30)
**Confidence:** MEDIUM -- Mike brainstorming but clearly excited

> "maybe they don't tie into the restoration system... not directly. but through thorns and nectars they could (when you indulge in an addiction if you replenish any attribute points it is doubled instead.)"

**What's new:** Addictions could provide doubled attribute restoration when indulged. This answers part of build plan [QUESTION] in 3E.2 about mechanical effects of values/addictions.

---

## 5. Death Split Specifics (Detailed by Pillar)

**Source:** KRMA Farming: Content Tokenization Exploit (2025-08-08)
**Confidence:** HIGH -- Mike stated this clearly as a correction

> "The actual death split is: All body Krma goes back to GM. Half the spirit Krma goes to GM, half stays in soul package, and the soul related content remains entirely in the soul package except whatever the frequency pool was (that goes to lady death)"

**What's new vs build plan:**
- Body KRMA -> 100% back to GM (becomes liquid)
- Spirit KRMA -> 50% to GM, 50% stays in soul package
- Soul KRMA -> remains in soul package entirely
- Frequency pool -> goes to Lady Death's wallet
- Soul packages can be **reincarnated at other players** -- not just the original player
- "It is on character death that a player truly gains that KRMA as their own via soul package"

The build plan mentions death split exists but doesn't have this pillar-by-pillar breakdown. This is more detailed than what's in MEMORY.md too.

---

## 6. Wealth Level Purchase Mechanic

**Source:** GROWTH Database Character Creation (2025-08-23)
**Confidence:** HIGH -- Mike explained this at length

Key rules not in build plan:
- Items have levels 1-10, matched against character's Wealth Level
- If Wealth Level >= item level: purchase freely (within narrative reason)
- If item level is 1 above Wealth Level: can purchase but Wealth Level drops by 1
- Can only purchase ONE item above your level at a time
- GM monitors for abuse (no infinite purchases of trivial items)

**Not covered anywhere in the build plan** -- there's no wealth/purchase system described.

---

## 7. GM Wallet Economics -- Rough Numbers

**Source:** GROWTH Database Character Creation (2025-08-23)
**Confidence:** MEDIUM -- Mike was workshopping numbers, not finalizing

- Starting characters: ~350-400 KV each
- Characters can grow to 600-800 total KV
- Party of 4 players + GM is the assumed standard
- Opposition should be **double or more** the heroes' total KV (to create "narrative headroom")
- World infrastructure/NPCs should be roughly equal to or slightly less than opposition KV
- A GM's wallet needs to cover: all characters + world + opposition + reserve
- Seeds give starting Frequency; Roots add more Frequency; Frequency is spent to purchase Branches

**Partially answers build plan [QUESTION] 4B.1** about GM allocation formula, though these are guidelines not a formula.

---

## 8. KRMA Subscription Economics Vision

**Source:** KRMA Farming: Content Tokenization Exploit (2025-08-08)
**Confidence:** MEDIUM -- Mike's vision, not final design

> "More like you get more and more KRMA each month from subscription paying until it evens off. So the longer you play and subscribe eventually you stop making as much KRMA from that and more from the social media aspects. This should correlate with the actual money people pay to play. The idea is that after sometime you aren't seen as a customer but more of an employee of the system."

**Not in build plan at all.** The subscription->KRMA generation has a diminishing curve where eventually social/creative contributions outweigh subscription payments.

---

## 9. Character Retirement -> AI Agent

**Source:** GROWTH Database Character Creation (2025-08-23)
**Confidence:** MEDIUM -- Mike described this excitedly but as future vision

> "end game final... would be like to retire your character... they become just an AI LLM. The idea is that after a certain amount of time playing a character you've trained it."

Retired characters become permanent AI agents in the system. This connects to Godhead AI (Phase 6.4) but adds the specific mechanic that player characters can become Godhead-class entities through retirement. **Not in build plan.**

---

## 10. "Dark Souls Invasions" as First Meta Update

**Source:** GROWTH Database Character Creation (2025-08-23)
**Confidence:** MEDIUM -- Mike described it as "one of the first updates to the game"

Cross-campaign invasion events (like Dark Souls) are planned as an early post-launch update. Godhead entities can intrude on campaigns. **Not mentioned in build plan at all.**

---

## 11. Canvas Vision -- Purple KRMA Line

**Source:** Customizable Digital TTRPG Campaign Board (2025-04-13)
**Confidence:** HIGH -- Mike described this as core to the canvas

> "A purple line runs horizontally through this space that the players build along."

The build plan mentions a KRMA line but this confirms it's specifically purple and horizontal, with players building their content along it. The existing canvas implementation has this (it's the tether system), so this is more of a confirmation than new info.

---

## 12. Lore: The Original Party / Godheads

**Source:** GROWTH Database Character Creation (2025-08-23), Completing a Rulebook Skeleton (2024-11-05)
**Confidence:** HIGH -- Mike gave specific details

The named Godhead entities from the original campaign:
- **Tara / Lady Death** -- Mike's character, becomes Death itself
- **Et'herling** -- God of Justice
- **Valmir Calius** -- God of Progress
- **Roy** -- Originally human, achieved ultimate Lucidity, can "become anyone" (Agent Smith parallel). Orchestrated the defeat of the Demiurge
- **Thomas Denholm** -- Remained human (the only non-deity)
- **Trayman** -- God of pattern/history (past/present/future aspects)

The build plan mentions these names (Section 6.4) but the detailed lore about Roy's Lucidity power, the Demiurge, and the party's cycling through failed timelines is not captured there.

---

## Summary of Actionable Items

### Answers to Build Plan [QUESTION] markers:
1. **3B.3 Rest durations:** Short rest = 1 Frequency restores 1 to every other attribute (not 1:1 ratio). Pillar-specific rests are considered but not committed.
2. **3B.4 Trait effects (partial):** Addictions may double attribute restoration when indulged.
3. **3E.2 Values/Addictions effects (partial):** Doubled restoration on indulgence.
4. **4B.1 GM allocation (partial):** Starting characters ~350-400 KV, opposition should be 2x+ heroes.
5. **Data Conflict #5 (Flat bonus levels 1-3):** Skilled checks use 1d6 base (not Fate Die), which may be the "flat bonus" distinction.

### Systems missing from build plan:
1. The full GROWTH thread facet model (G/R/O/W/T/H with KV counter, Ritual->Frequency, Terminal-authored H facet)
2. Wealth Level purchase mechanics (level matching, dropping wealth to buy above level)
3. Detailed death split by pillar (Body->GM, Spirit 50/50, Soul->package, Frequency->Lady Death)
4. Character retirement -> AI agent conversion
5. Dark Souls-style cross-campaign invasion events
6. KRMA subscription diminishing curve economics
