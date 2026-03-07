# Skilled vs Unskilled Checks — Change Spec (v0.1)

**Summary:**  
Unskilled checks keep the original flow (wager Effort, then roll Fate). **Skilled** checks now roll a **Skill Die (SD)** first; after seeing SD, the Trailblazer chooses how much Effort to wager, then rolls the Fate Die (FD). This makes training grant **information-before-spend**, reducing guesswork and burn.

## Terms

- **Watcher** = GM, sets DR and adjudicates.
    
- **Trailblazer** = player character’s controller.
    
- **DR** = Difficulty Rating (color → number as usual).
    
- **FD** = Fate Die (default **d8** in base GRO.WTH).
    
- **SD** = Skill Die from rank (see ladder).
    
- **Effort** = Focus-spend added to a roll’s total (unless prohibited).
    

---

## Core Procedure

### 0) Declarations & Locks (timing guardrail)

Before any dice are rolled:

- **Watcher** declares DR and any situational modifiers that are already knowable.
    
- **All boosts from allies, Nectars, items, stances, and declared set-ups must be committed now.**
    
    > After the SD is revealed, the only decision a Trailblazer may change is **how much Effort** to wager.
    

### Unskilled Check

1. **Wager Effort** (pay it).
    
2. **Roll FD.**
    
3. **Total = FD + flat modifiers + Effort.** Compare to **DR**.
    

### Skilled Check

1. **Roll SD** (open-face; everyone can see it).
    
2. **Wager Effort** (after seeing SD; pay it).
    
3. **Roll FD.**
    
4. **Total = SD + FD + flat modifiers + Effort.** Compare to **DR**.
    

> **Flat modifiers** = attribute adds, passive item bonuses, environment penalties, etc. (Aid/Guide and other pre-declared boons are already locked in at Step 0.)

---

## Skill Die Ladder (default)

- **Untrained:** — (no SD; use _Unskilled_ flow)
    
- **Novice:** d4
    
- **Adept:** d6
    
- **Expert:** d8
    
- **Master:** d10
    
- **Legend:** d12
    

Design knob: if success rates run hot at your table, either raise DR bands slightly or cap the ladder at **d10**.

---

## Interactions & Edge Cases

### Depletion States (current canon)

- **Focus — Muted (0):** You **cannot add Effort**.
    
    - _Unskilled:_ skip the wager step; roll **FD** only.
        
    - _Skilled:_ roll **SD**, then **FD**; no Effort may be added.
        
- **Flow — Deafened (0):** You **cannot roll dice**.
    
    - All checks become **Effort-only vs DR** (no SD, no FD). Apply Step 0 locks normally.
        
- **Wit — Incoherent (0):** **No Skills.**
    
    - You must use the **Unskilled** flow even if trained; SD does not apply.
        
- **Willpower — Overwhelmed (0):** **Recovery suppressed** (Short Rest unavailable; other recovery halved; Long Rest full).
    
    - No direct change to check flow.
        
- **Frequency — Death’s Door (0):** Death adjudication as normal; check flow unchanged.
    
- **Celerity — Clumsy (0):** Perform its **pre-check gate** before Step 0; on failure, the action Hesitates/negatives per that rule.
    

> **Wisdom — Confused (0):** still TBD; recommended options in that file stand (e.g., **Tactical Isolation** or **Terminal Fog**) and remain compatible with this change.

### Aid/Guide & Set-Ups

- Because of Step 0 locking, Aid/Guide, flanking, elevation, and other **pre-established boons must be declared before SD**.
    
- If a boon’s trigger depends on the FD outcome (e.g., “on hit, chain X”), resolve it after the check as usual; it does not retroactively change Effort.
    

### Multiple Rolls / Reactions

- **Reactions** that add dice to _this_ check must be declared at Step 0 unless their timing explicitly says “after a roll is shown.”
    
- If a feature says “after seeing a die” and doesn’t specify which, it refers to **SD or FD**; the Watcher may constrain timing to preserve table speed.
    

---

## Optional Tuning (off by default)

- **Per-check Effort Cap:** Max Effort you can add to a single check = **3**.
    
- **Band Reveal Mode:** Instead of the exact SD face, the Watcher may reveal **Low/Mid/High** bands (e.g., d6 → {1–2, 3–4, 5–6}). Use only if analysis paralysis becomes an issue.
    

---

## Worked Examples

**A. Skilled (Adept d6), Blue task DR 7**

- Step 0: Ally Aid (+1) committed.
    
- Roll **SD d6 → 5**.
    
- Choose **Effort 1**.
    
- Roll **FD d8 → 1**.
    
- Total = 5 + 1 (FD) + 1 (Aid) + 1 (Effort) = **8 ≥ 7** → success.
    

**B. Unskilled, same task DR 7**

- Step 0: no boosts.
    
- Must **wager Effort before any roll**; chooses **Effort 2**.
    
- Roll **FD d8 → 2**.
    
- Total = 2 + 2 = **4 < 7** → fail (blind gamble didn’t cover the gap).
    

---

## Quick Odds Cue (FD=d8)

After SD and modifiers, define **gap = DR − (SD + mods + Effort)** (minimum 1).

- Need FD ≥ **3** → **75%**
    
- Need FD ≥ **2** → **87.5%**
    
- Need FD ≥ **1** → **100%**
    

(Use table-side as a fast mental aide when picking Effort after SD.)

---

## Rationale (short)

- **Information before commitment** is the core value of training; it speeds decisions and reduces wasted Effort.
    
- **Step-0 locking** prevents “see SD → pile boons” gaming and keeps pacing tight.
    
- Plays cleanly with depletion states: **Muted** strips Effort, **Deafened** strips dice, **Wit 0** strips the Skilled flow itself.
    

---

## Migration Notes

- Existing content that said “make a skill check” now follows the **Skilled** flow.
    
- Content that assumes a static skill bonus still works; just map rank → SD.
    
- DR color bands may want a light pass after playtest with your table’s typical SD ranks.