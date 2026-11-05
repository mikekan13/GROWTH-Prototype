# Kristopher — Hand-Built Sheet (WIP, 2026-11-05)

> Michael is rebuilding Kristopher by hand over the table tests. The four Genesis-generated traits (Hypervigilance Architecture, Ageless Face, Fractured Witness, Moral Injury) are placeholders until replaced. Pricing follows the locked Elven seed (`WIP-elven-seed-design.md`) and the 15-seed batch scale (`GRO.WTH Repository/WIP-15-seeds-batch-2026-05-09.md`). Format follows the Elven file.

## Frame

| Component | Value |
|---|---|
| Seed | Human (FD d8, fated age 80) |
| Trait slots | 8 total (FD d8) · 2 seed-bound (Ambitious, Bounded Potential) · **6 free** |
| Seed-bound Nectar | **Ambitious** — +1 GRO.vine slot (4 instead of 3) |
| Seed-bound Thorn | **Bounded Potential** — [NEEDS MIKE] no mechanic text exists anywhere |
| Pools (level) | Clout 18 · Cel 22 · Con 32 · Foc 14 · Flow 40 · Will 42 · Wis 42 · Wit 30 · Freq 40 |
| TKV today | 299 (no trait carries KV yet) |

## Trait 1 — "Dialed to Eleven" (Thorn; name confirmed Michael 2026-11-05) — ON THE SHEET 2026-11-05 (tmp/add-dialed-to-eleven.ts; engine hooks in lib/character-actions.ts)

*Soul pillar · lien (Lady Death default) · maturity flag: mental-health · KV: **−110** (−125 core + 15 for the instrument clause; range −100..−150)*

> **Every change to a Soul pool's current (Willpower, Wisdom, Wit) is doubled — in and out.**

Clauses, as one rule applied everywhere:
- **Damage** to a Soul pool lands doubled. Overflow to Frequency is whatever spills from the doubled hit; it is not doubled again.
- **Effort** wagered from a Soul pool costs the pool double. The roll gets the wager as written. (Ruled Michael 2026-11-05: "you pay double but you still get the normal wager.")
- **Recovery** into a Soul pool is doubled: Short Rest restores 2 per Soul pool instead of 1; a heal, a Blossom, a spell that restores Willpower restores double. Never above max.
- It moves **current only**. Max, augments, Burn and Long Rest (already to full) are untouched.
- **No middle ground (chosen Michael 2026-11-05).** When Willpower hits 0 the Thorn **generates a Blossom, "Splitting"**: while it is live, any Effort he wagers is **all or nothing** — the whole remaining pool, or none. No measured bet. Expiry = trigger: Willpower above 0 (Blossoms = THE temporary-effects system, expiry mandatory, never count against the trait cap — r-2026-08-21). World-caused, so no custody KRMA. The splitting is said in dice — a human player feels it as "all in on someone or not showing up for them"; the simulated being renders the same bet as a disposition gone to its extreme. Nothing tells either how to feel. The Blossom is the card on the sheet that makes the state trackable; the Thorn itself stays one line plus "generates Splitting".
- **Feelings are the instrument (default, Michael to confirm).** On a Willpower/Wisdom check whose aim is to move another person emotionally (plead, confront, comfort, confess), Soul Effort costs the normal rate — the one place the knob works for him. Player-chosen, in fiction (≈ +15).
- **It shows** (any Soul damage visible to all in view; ≈ −10) is HELD for a possible Hypervigilance replacement.

**Design test (ruled Michael 2026-11-05, applies to every trait from here):** a trait must PRODUCE behaviour through a mechanic, never PRESCRIBE it. If a clause can only be enforced by telling the player what to think, it is not finished. (Mortal Compassion's check-to-break is the acceptable form; "cannot tell direct lies" is the weak form.)

What it does at the table:
- His Soul pools of 42 / 42 / 30 behave like 21 / 21 / 15 against anything that drains them, and refill twice as fast when something gives back.
- Zero comes twice as fast. **Overwhelmed** (Willpower 0: no Short Rest, other recovery halved) is the spiral — and the Thorn's doubled inflow cancels the halving exactly, so the way out of Overwhelmed is also his.
- Every Soul-Effort decision is dearer, so he feels every wager.

Pricing notes:
- Damage ×2 across a pillar ≈ −75 (between Outcast −50 and Emotional Limitations −100 on the batch scale).
- Effort ×2 across the Soul pillar is the heavier half — it is every session, every check he leans on Willpower or Wisdom for ≈ −75 (Synthetic's "no Flow Effort" bundle is −100).
- Recovery ×2 on Soul pools ≈ +25 (First-Born's all-pool Short Rest clause is one third of a +50 Nectar).
- Net ≈ −125. Compare Mortal Compassion −150 (two binding compulsions), Emotional Limitations −100.
- Soul pillar → at death the holder is paid HALF the lien and a faded residue Thorn rides the ghost (r-2026-08-19-02).

Engine shape (data, not code for this trait): `{ trigger: 'pool_delta', pools: ['willpower','wisdom','wit'], effect: 'multiply', factor: 2, clamp: [0, max] }` — one hook on any current-pool change. The cause lexicon (Effort = chosen, Damage = taken) is still worth ruling for later traits, but this Thorn no longer needs it.

Open calls [NEEDS MIKE]: confirm the instrument clause (built as an `exempt` option; nothing sets it yet — the roll popup should offer it as a player choice) · final KV (−110 proposed).

## Traits 2–6

(next ideas here, same format)
