# KRMA Economy Design Session Plan

**Purpose:** Nail down the theoretical framework before hardcoding numbers. Every formula in the evaluator, every constant in the God-head prompts, and every curve in the WTH system flows from decisions made here.

**Prerequisite reading:** `memory/krma-economy-master-reference.md` has the compiled research from all sources.

---

## What's Settled (Don't Relitigate)

- [ ] 100B hard cap, 4 reserves (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%)
- [ ] Deflationary by design (burn sink + frequency death sink)
- [ ] Two-track evaluation: deterministic (attrs/skills/WTH) + AI-graded (nectars/thorns/abilities)
- [ ] 1 attribute point = 1 KV, 1 skill level = 1 KV, 2 KV per magic skill level
- [ ] Age on roots = -2 KV per year
- [ ] WTH is exponential, not linear
- [ ] Death split: Body→GM, Spirit→Player, Soul→50/50, Frequency→Lady Death
- [ ] Nectars/thorns are rare, AI-graded, capped by Fate Die value
- [ ] GM describes → God-head authors → Kai evaluates → GM confirms
- [ ] Mechanical DNA is identity, flavor is cosmetic
- [ ] First-mover attribution with diminishing returns, derivative IP tax

---

## Decisions Needed (Session Agenda)

### 1. WTH Exponential Curve
**Current proposal:** `KV = 50 × (1.6 ^ (Level - 1))`
**Questions:**
- Is 50 the right base? (Level 1 = 50 KV feels like a lot for "destitute/fragile/primitive")
- Is 1.6 the right growth rate? (Level 10 = 3,500 KV — does this feel right for "immortal/magnate/reality-altering"?)
- Are WTH stats truly MULTIPLIERS on final KV, or additive costs during creation?
- If multipliers: `Final KV = Base × (W_mult × T_mult × H_mult)` — does this mean a Level 1 Wealth character (0.15x) actually REDUCES their total KV? That would mean poverty makes you cheaper to create, which has philosophical implications.
- Should the curve differ per stat? (Health = survival time, Wealth = optionality, Tech = capability ceiling — maybe different growth rates?)

### 2. Starting Character TKV Budget
**Conflicting numbers:** 180 KV (normal human), 200 KV (template), 250-300 KV (starting PC), 350-400 KV (from design doc)
**Questions:**
- What's a Level 1 starting PC supposed to look like? (Seed + Root + 1 Frequency minimum)
- Human seed = 225 KV in the catalog. If root adds ~100 KV minus age... starting PC = ~285 KV?
- Is there a hard "creation budget" or is it purely what the GM can afford from their pool?
- What's the minimum viable character? (Seed only, no root, just born?)

### 3. GM Economy
**Questions:**
- How much KRMA does a GM start with? (First campaign creation budget)
- 75 KRMA/session earning — is this confirmed or proposed?
- How does subscription tier map to KRMA allocation? (Bell curve over subscription lifetime)
- Can a GM run out? What happens? (Campaign stalls? Can't create new content?)
- How many characters should a GM be able to sustain in a campaign? (5 players × 300 KV = 1,500 KV minimum?)

### 4. Skill Level Costing
**Current:** 1 KV per level, 2 KV per magic level
**But:** Repository says skill proficiency costs 10/14/19 KRMA (in-game advancement cost, not creation KV)
**Questions:**
- Is the 1:1 creation KV correct? (Level 8 skill = 8 KV during creation)
- Should higher levels cost more? (Linear 1:1 means level 20 skill = only 20 KV, but it's god-level mastery)
- Skill die progression is non-linear (flat → d4 → d6 → d8 → d12 → d20) — should KV match die jumps?
- In-game advancement cost (10/14/19 KRMA) is separate from creation KV — confirm this distinction?

### 5. Nectar/Thorn KV Ranges
**Current:** AI-graded (non-deterministic track)
**Questions:**
- What's the KV range? (Minor nectar = 5 KV? Major = 50? Game-breaking = 500?)
- Reference examples from old version needed as calibration anchors
- Should there be a formula based on the REF-9 factors (base value × range × target scale × effect magnitude)?
- Or is it truly case-by-case God-head evaluation?

### 6. Material Economy (Sub-1 KV)
**Current:** 13-decimal continuous spectrum, 6-step formula in COMPREHENSIVE-BUILD-PLAN
**Questions:**
- Is the 6-step formula validated or theoretical?
- Material property KV modifiers (+3 protective, +5 proof, -4 combustible, etc.) — are these confirmed?
- How does material KV flow into item KV? (Additive? Or material provides base that other properties multiply?)
- Common materials (iron, wood) should have negligible KV — what's the practical floor?

### 7. Item KV Formula
**Current:** `Item KV = Material + Damage + Resistance + Mods + Abilities`
**Questions:**
- Is this additive formula confirmed?
- Item rarity KV placeholders (Common=1, Uncommon=3, Rare=5, Legendary=20, Artifact=30+) — are these creation costs or assessment values?
- How do weapon properties (damage types, range) map to KV?
- Armor resistance → KV conversion?

### 8. Frequency as Creation Currency
**Questions:**
- Root frequency = (attributes + skills + WTH costs) - (age × 2) — is this confirmed?
- Does seed frequency work the same way?
- Minimum 1 Frequency must remain unspent to play — confirmed?
- How does starting Frequency relate to TKV? (Is Frequency included in TKV or separate?)

### 9. 10-Year Supply Modeling
**Questions:**
- At maturity (10K tables × 4 players × 52 sessions/year), how much KRMA circulates annually?
- When does Terminal reserve run dry? (75B ÷ annual GM allocation = ?)
- What's the target equilibrium? (New KRMA entering = KRMA being burned/sunk)
- Do we need a simulation? (Monte Carlo model of economy over 10 years with growth assumptions)

---

## Approach

For each decision:
1. **State the options** with implications
2. **Mike decides** (or says "test it")
3. **Document the decision** with reasoning
4. **Flag dependencies** (what other decisions this affects)

Some of these may need actual simulation (especially the 10-year supply model). We can build a simple economy simulator as a script if needed.

---

## Output

By end of session, produce:
- `docs/KRMA-ECONOMY-SPEC.md` — locked-down formulas and constants
- Updated `types/krma.ts` — WTH exponential curve, any new constants
- Updated `services/krma/evaluator.ts` — if formulas change
- Updated forge-authoring prompts — with validated numbers
- Economy simulation script (if needed for supply modeling)
