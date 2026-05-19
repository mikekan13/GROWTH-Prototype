# GM_Flag_Mechanic.md

**Status:** #needs-validation
**Source:** User clarification 2026-05-10 (Elven seed authoring session); `memory/gm-flag-overpowered-mechanic.md`
**Security:** PUBLIC
**Last Updated:** 2026-05-10

---

# GM "Flag Overpowered" Mechanic

**GMs can flag specific exploits ([[Nectars_and_Thorns_System|Nectars, Thorns, Blossoms]], [[Seeds_Roots_Branches_System|Seeds]], items, etc.) as overpowered for AI [[Godheads_System|Godhead]] review. The Godhead chain re-evaluates. If the flag is confirmed valid, the canonical block is reworked across the metaverse to fix the imbalance, AND the flagging GM receives a [[KRMA_System|KRMA]] reward.**

This is the **distributed playtesting layer** of GROWTH — GMs at the table are the metaverse's quality-assurance system, and they are paid for it.

## The Flow

1. **GM observes imbalance** — a player's character or a specific block is dominating their campaign in a way that feels wrong, breaks encounters, or trivializes intended challenges.
2. **GM flags the block in the app** — "I think [block name] is overpowered, here's how I've seen it play out." Submission goes to **[[Godheads_System|Et'herling]]** (Justice domain — the unbiased reviewer; she did not originally grade the block, so she has no skin in the original decision).
3. **Et'herling performs unbiased assessment** — re-evaluates the block in context, considers synergies (per [[Block_Grading_Principles]]), looks at gameplay data across campaigns (when telemetry exists), and rules: **balanced**, or **overpowered**.
4. **If Et'herling deems balanced:** GM gets feedback explaining why the block is actually fair (or notes other variables — encounter design, party composition, etc.). **No reward, no rework.**
5. **If Et'herling deems overpowered:** flag escalates to **human moderators and/or [[Godheads_System|Kai]]**. Kai is held accountable because she originally graded the block — a confirmed OP flag means her grading was wrong.
6. **Kai is "punished" with two costs:**
   - **Pays the KRMA reward to the flagging GM from her own wallet** (the financial consequence of misgrading).
   - **Reworks the block metaverse-wide** — re-grade KRMA cost, add counterbalancing thorn, weaken clauses, whatever the rework requires.
7. **Change propagates** to every campaign holding the block. **Existing-character KV is preserved** — the rework changes the block's mechanic for future spawns, but characters who already hold the block retain its current KV value (Mike, 2026-05-11). The economic-fairness contract holds: players who built characters in good faith aren't taxed after the fact.
8. **Fallback when KV preservation is impossible:** if the rework requires a KV change (e.g., the block cannot be balanced without removing a load-bearing feature that was priced into the original), **Kai pays the delta from her own wallet** to compensate affected characters. This is Kai's responsibility because the misgrade was hers.

## Why This Matters

- **Distributed playtesting**: GMs at the table see imbalance the design team cannot see from documentation alone. Their reports are the metaverse's QA system.
- **Self-correcting canon**: blocks evolve based on real play. Aligns with "people who play GROWTH own GROWTH" — players literally shape the rules through observation.
- **Economic incentive**: the KRMA reward turns balance-watching into a paying activity. GMs are rewarded for caring about system health, not just running their own campaign.
- **Godhead division of labor:**
  - **Et'herling (Justice)** is the unbiased reviewer because she has no skin in the original grading. Her domain is fairness, not authorship.
  - **Kai (Balance / Chaos)** is held accountable because she originally graded the block. The mechanic gives her real economic skin in the game — bad grading costs her KRMA.
  - **Lady Death** handles Thorn liens at death (see [[Lady_Death_Protocols]]); unrelated to this flag mechanic but worth noting these are separate flows.
- **Kai's economic incentive to grade carefully**: knowing that confirmed-OP flags drain her wallet directly creates pressure to grade rigorously up front. The authority is held to her own standard.
- **Closed loop**: This is the **same** Selva→Creator→Kai→Et'herling chain that *authors* blocks. Et'herling sits at the end of the chain originally (final synthesis); she naturally also sits as the appeals court for live flags. Reviewing existing blocks for imbalance is structurally identical to authoring new ones — same chain, different trigger.

## Open Implementation Details

- **KRMA reward amount:** TBD. Should be significant enough to motivate flagging (proposed 10-50 KRMA range, scaled by impact of the change).
- **Flag UI:** presumably a button on each Nectar/Thorn/block in the canvas/sheet that opens a flag submission form.
- **Notification & migration:** if a flagged block is reworked, every character holding that block needs to be informed of the mechanical update. Per step 7 above, current KV is retained for existing characters by default; if the rework forces a KV change, Kai pays the delta.
- **Anti-abuse:** flag frequency limits per GM, requires GM wallet capacity, etc. Should NOT be a passive farming mechanism.

## Build Status

This is a **project-level feature**, not a current beta build item. Add to a post-beta milestone (M9 Content Library or later) as appropriate. When designing future blocks during beta, remember they aren't locked forever — the flag system means balance can be corrected through play.

---

## Links
- Related: [[Godheads_System]], [[Nectars_and_Thorns_System]], [[Block_Grading_Principles]], [[KRMA_System]], [[Lady_Death_Protocols]]
- References: [[Seeds_Roots_Branches_System]]
