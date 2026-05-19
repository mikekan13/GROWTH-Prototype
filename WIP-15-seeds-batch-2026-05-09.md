# 15 Seeds — Nectar/Thorn Design Briefing (2026-05-10)

> **Self-contained briefing for a fresh Claude session.** Everything needed to author the Nectar/Thorn pairs for 15 humanoid seeds. No external file access required.

---

## 1. Project Context

**GROWTH** is a digital-first TTRPG built around three-pillar attribute mechanics (Body / Spirit / Soul, alchemical Salt-Sulfur-Mercury). Characters are constructed from **Seeds** (species/origin templates), **Roots** (background), and **Branches** (life events).

A **Seed** contributes:
- Attribute augments (positive modifiers; rarely negative; sometimes 0)
- Frequency budget (the "currency" the player spends on Roots/Branches at creation)
- Base Fate Die (d4, d6, d8 default, d12, d20)
- Fated Age (species lifespan in cycles/years)
- Base Resist (combat damage resistance for body parts)
- Body Structure (HUMANOID_BODY for beta; all other layouts deferred post-beta)
- One or more **Nectars** (positive seed-bound exploits)
- One or more **Thorns** (negative seed-bound exploits, function as KRMA liens collected at death)
- Optionally: starting Skills (rare; only when a species has innate trained ability)

A character's **seedKV** is the KRMA cost to spawn one of that seed.

---

## 2. Locked Formulas (canon)

| Component | Formula |
|---|---|
| 1 attribute aug | **1 KRMA** per point |
| Frequency budget | **1 KRMA** per point |
| Base Resist | **2 KRMA** per point (positive-only) |
| Fate Die | d4=**5**, d6=**10**, d8=**20** (default), d12=**40**, d20=**80** |
| Fated Age | `ceil(fatedAge × 0.5)` (every cycle costs positive KRMA, no refunds) |
| Skill (starting, if granted) | Apprentice d2=**10**, Novice d3=**14**, Student d4=**19** |
| Nectar / Thorn | Kai-graded individually; baseline scale: +1 mod to roll ≈ 5 KV (contextual = less) |

**All KRMA contributions are POSITIVE.** Negatives exist only as **Thorn liens** (debt collected by Lady Death at the character's death). Static refunds break the economy and are forbidden.

---

## 3. Tier Framework

Different seeds anchor to different TKV tiers. **Aug totals are NOT fixed** — they vary by seed identity. Balance is achieved at the tier level, not by parity.

| Tier | seedKV range | Anchor |
|---|---|---|
| **Low** | 130-220 | Human ~225 paper |
| **Medium** | 220-350 | Altered Human ~350 paper |
| **High** | 350-550 | Elven 476 (LOCKED) |
| **Premium** | 550+ | Celestial (proposed ~685) |

---

## 4. The Locked Elven Seed (Gold Standard Precedent)

This is what a fully-authored seed looks like, with play-defining exploits done right. Use this as the reference point.

### Elven — seedKV 476

| Component | Value | KRMA |
|---|---|---|
| Body Structure | HUMANOID_BODY | — |
| **Augs (60 net)** | Clout 4 / Cel 8 / Con 7 / Foc 7 / Flow 10 / Will 7 / Wis 13 / Wit 4 | **+60** |
| Pillar shape | Body 19, Spirit 17, Soul 24 | — |
| Fated Age | 1000 cycles | **+500** |
| Base Fate Die | d6 | **+10** |
| Base Resist | 13 | **+26** |
| Skills | none | 0 |
| Starting Frequency Budget | 30 | **+30** |
| **First-Born** Nectar (Et'herling-owned, seed-bound) | three clauses, see below | **+50** |
| **Diminishing** Thorn (Lady-Death-owned, seed-bound, lien) | one clause, see below | **−200** |
| **TOTAL** | | **+476** |

### Identity
Tolkien-archetype: long-lived, magic-attuned, deliberate, wisdom-defined. Et'herling (Justice godhead) was Elven before ascension — she is the natural sponsor of Elven Nectars.

### Pillar shape narrative
- **Body 19**: 4 Clout (light-built) / 8 Celerity (graceful) / 7 Constitution (disease-resistant, hardy). Not strong but agile and enduring.
- **Spirit 17**: 7 Focus / 10 Flow. Magical attunement.
- **Soul 24**: 7 Will / 13 Wisdom / 4 Wit. Wisdom-spike is the defining trait, mirroring Human's Willpower 13.

### First-Born — Nectar text *(Et'herling-owned, seed-bound, KV: +50)*

Three mechanical clauses:
- On Wisdom checks for perception (distance, hearing, low-light), the check gains a **+1 flat modifier**. Low-light conditions impose no penalty on Elven sight.
- On Willpower checks resisting mental compulsion, charm, fear, or domination, the check gains a **+2 flat modifier**.
- **On Short Rest, each 1 Frequency depleted restores 1 additional point to every non-Frequency attribute pool (2 total per pool, vs the standard 1).** ← This third clause is the play-defining piece.

### Diminishing — Thorn text *(Lady-Death-owned, seed-bound, lien, KV: −200)*

> **Cannot Spend or Burn Frequency that would take Max ≤ current age in cycles.**

Lien collected by Lady Death at character death. The thorn enforces the Tolkien arc — actively-engaged Elven outpace the floor through GROvines; withdrawn Elven let the floor catch up and become locked from advancement.

### Why this seed is the gold standard

The **Diminishing thorn** reshapes the entire Frequency economy across the character's lifespan. The **Short Rest clause** in First-Born reshapes the rest economy. Together they create a synergistic identity: old Elven are hard to wear down (forced high reserves, double-efficient recovery, large damage absorption). Tolkien-perfect: Galadriel doesn't tire, doesn't get sick, doesn't easily fall.

A player picking Elven plays *the Frequency economy game differently* than a player picking Human, throughout the entire character's lifetime. **That is what a seed should accomplish.**

---

## 5. Design Principle: Nectars/Thorns Are Play-Defining EXPLOITS

**Paper-version name was "Exploits."** They exploit, augment, and change base rules to make the character feel mechanically unique.

**MTG analogy:** "Think MTG commander decks. The abilities of a commander basically define how that person builds and uses their entire deck."

### Failure mode to avoid
Authoring D&D-style racial traits ("+2 Dex, advantage on Stealth"). These produce variant Humans, not seed-defined characters. **A +1 flat modifier is not a Nectar.**

### Success mode
The Nectar/Thorn changes how the player plans, manages resources, takes risks, or interprets game state. It carries weight in EVERY session, not just in niche check contexts.

### Checklist for each Nectar/Thorn

For each exploit, ask:
1. **"Would removing this make the seed feel meaningfully different?"** If no, it's not pulling its weight.
2. **Resource-economy rewrites** (Frequency, attribute pools, Effort costs work differently) > flat numeric modifiers.
3. **Rule-bending exploits** ("once per session, declare a roll succeeded before rolling") > stat tweaks.
4. **Strategic constraints** ("cannot use Flow Effort") that reshape build choices > minor penalties.
5. **Flat ±N modifiers are acceptable** as part of a larger play-defining clause, but never as the ENTIRE Nectar/Thorn.

### Example: Berserker Heart for Orcish (work-in-progress, Mike is authoring canonical version)

**Wrong** (stat tweak):
> "+1 to Clout-based combat checks. When at 25% Constitution, +2 to attacks."

**Better** (play-defining but broken):
> "Once per encounter, declare Rage. All Body-pool Effort costs zero." ← Free unlimited Effort = unconditional win-button. Broken.

**Better still** (play-defining with real cost):
> "Once per encounter, declare Rage before any action. For the rest of the encounter: you may wager Effort from Body pools TO BELOW ZERO, drawing on pain. Each point of Effort wagered past zero also depletes 1 Frequency current. Cannot take defensive reactions. Cannot voluntarily disengage. When Rage ends, Body pools refill to 0 (debt forgiven, but you're depleted)."

The player picks WHEN to Rage, spends real resources (Frequency) for the boon, accepts real downsides (no defense, no retreat), and exits depleted. Berserker fantasy: tapping into pain/rage as fuel, burning yourself out.

Mike is finalizing the canonical Berserker Heart and will hand it back as the template for the batch.

---

## 6. Design Principle: Exploits Must Be Easy to Track

Even though server-side AI tracks state, players need to know what their character does without consulting screens mid-decision.

- **Prefer binary state triggers** (in this state / not in this state — single flag).
- **Prefer player-triggered exploits** ("once per encounter, declare X") over auto-trigger thresholds.
- **Prefer zero-thresholds** ("when any pool hits 0") over percentage thresholds ("when at 25%").
- **Avoid** percentage math, ratios, multi-pool conditions, or "if X happened this scene" tracking.
- The mechanical complexity is in WHAT the exploit does, not WHEN it activates.

---

## 7. Other Locked Canon

### Seeds can grant starting skills (rarely)
Default: 0 skills. Exception: species with innate-born trained ability (Synthetic with Technical Interface, Goblinoid with Scavenging, Orcish with Intimidation, Halfling with Stealth, etc.). Typically Apprentice d2 (+10 KRMA), occasionally Novice d3 (+14 KRMA) for stronger native fluency.

### Aug totals vary by seed
No fixed total. A small/simple seed might have 40 augs; a powerful seed might have 80+. Choose magnitude to fit the seed's identity, then anchor to the right TKV tier.

### Block ownership
Each block (Seed, Nectar, Thorn, etc.) is owned by a Godhead. Seed-bound traits inherit ownership from their original sponsor.
- **Et'herling** (Justice) — was Elven before ascension; natural owner of Elven Nectars and other elegant/cosmic species.
- **Kai** (Chaos & Balance) — graded all blocks; owns crafted/structural seeds (Synthetic, Machine-Hybrid, Dwarven).
- **Lady Death** — owns all Thorn liens (default); also seeds with death-adjacent identity (Astral Drifter, possibly Orcish).

### Synergy-aware grading
Blocks are NOT graded in isolation. Kai considers how blocks compound within a seed when grading. The Diminishing+Short-Rest synergy in Elven was deliberately priced; the seed's identity emerges from the combination.

### Fate Die limit
Total Nectars + Thorns ≤ Fate Die value. Elven d6 → max 6 traits, 2 used (First-Born + Diminishing), 4 free for in-play acquisition. Seed-bound traits cannot be replaced via the Fate Die limit mechanic.

### Seed-bound vs character-bound
Seed-bound traits attach to the seed blueprint, not the character. If a character changes seed mid-game (canonically possible), bound traits change with it.

### Thorns are LIENS
Negative KRMA from a Thorn is debt collected at character death by the Thorn's owner Godhead (typically Lady Death). Not a creation refund — a deferred obligation.

### GM "flag overpowered" meta-mechanic
GMs can flag a block as overpowered. Et'herling (Justice, unbiased) reviews. If confirmed OP, escalates to human moderators and/or Kai. Kai is "punished" — pays the KRMA reward to the flagging GM from her own wallet, then reworks the block metaverse-wide. Kai's economic skin in the game keeps her grading honest.

---

## 8. The 15 Seeds Needing Nectar/Thorn Authoring

Stats are tier-balanced and locked. **Nectar/Thorn pairs need rebuild** as play-defining exploits (the current v2 versions are stat-tweaks and don't meet the principle).

Format per seed: identity → augs → fated age → FD → base resist → freq budget → optional skill → seedKV target → existing Nectar/Thorn names (placeholder, mechanics to redesign).

---

### Low Tier (130-220)

#### 1. Goblinoid — seedKV target ~145
- **Identity:** Scrappy survivors. Pack-mentality cunning, opportunistic, short-lived. Wit-defined.
- **Augs (45 net):** Clout 3 / Cel 10 / Con 5 / Foc 3 / Flow 3 / Will 6 / Wis 5 / Wit 11
- **Fated Age:** 45 (+23) | **FD:** d6 (+10) | **Base Resist:** 11 (+22) | **Freq:** 25 (+25)
- **Skill:** Scavenging d2 (+10)
- **Existing concept:** Pack Cunning (Kai) / Compulsion-Driven (Lady Death lien)
- **Design direction for redesign:** Pack mechanics in combat, scavenging that exploits the economy, impulse-driven mechanical compulsions

#### 2. Orcish — seedKV target ~178
- **Identity:** Brutal warrior-nomads. Short-lived, raw-strength, tribal.
- **Augs (55 net):** Clout 13 / Cel 6 / Con 9 / Foc 3 / Flow 3 / Will 11 / Wis 4 / Wit 6
- **Fated Age:** 60 (+30) | **FD:** d8 (+20) | **Base Resist:** 20 (+40) | **Freq:** 25 (+25)
- **Skill:** Intimidation d2 (+10)
- **Existing concept:** Berserker Heart (Lady Death) / Outcast (Lady Death lien)
- **Design direction for redesign:** Rage that costs real resources (Mike is canonicalizing). Outcast reshapes social toolkit toward Clout/intimidation.

#### 3. Halfling — seedKV target ~197
- **Identity:** Small folk. Hardy, lucky, stealthy. Hobbit-archetype.
- **Augs (50 net):** Clout 2 / Cel 9 / Con 5 / Foc 5 / Flow 6 / Will 12 / Wis 7 / Wit 4
- **Fated Age:** 120 (+60) | **FD:** d8 (+20) | **Base Resist:** 11 (+22) | **Freq:** 30 (+30)
- **Skill:** Stealth d2 (+10)
- **Existing concept:** Lucky Step (Et'herling) / Small Stature (Lady Death lien)
- **Design direction for redesign:** Luck as a player-triggered exploit (declare a check Lucky BEFORE rolling for narrative-friendly outcome). Small Stature as constraint on equipment + spatial benefits.

#### 4. Moon-Blessed — seedKV target ~217
- **Identity:** Nocturnal humanoids with lunar attunement. Powerful at night, weakened by sunlight.
- **Augs (55 net):** Clout 4 / Cel 8 / Con 5 / Foc 9 / Flow 12 / Will 8 / Wis 5 / Wit 4
- **Fated Age:** 180 (+90) | **FD:** d4 (+5) | **Base Resist:** 12 (+24) | **Freq:** 30 (+30)
- **Existing concept:** Lunar Heart (Et'herling) / Sun-Aversion (Lady Death lien)
- **Design direction for redesign:** Magic that works differently in night vs day. Lunar regeneration as a rest-economy hack. Sun-Aversion as an actual constraint, not a flat penalty.

---

### Medium Tier (220-350)

#### 5. Tiefling — seedKV target ~220
- **Identity:** Planetouched mortals with infernal heritage. Cunning, supernaturally resilient, marked.
- **Augs (55 net):** Clout 5 / Cel 6 / Con 6 / Foc 7 / Flow 7 / Will 8 / Wis 5 / Wit 11
- **Fated Age:** 100 (+50) | **FD:** d6 (+10) | **Base Resist:** 14 (+28) | **Freq:** 30 (+30)
- **Existing concept:** Infernal Heritage (Et'herling) / Cursed Bloodline (Lady Death lien)
- **Design direction for redesign:** Heritage as a damage-type interaction (fire transformation, heat channels). Cursed Bloodline reshapes how divine entities/sacred spaces react.

#### 6. Machine-Hybrid — seedKV target ~233
- **Identity:** Cyborgs. Augmented mortals with tech mastery and EM vulnerability.
- **Augs (65 net):** Clout 8 / Cel 7 / Con 12 / Foc 8 / Flow 3 / Will 7 / Wis 4 / Wit 16
- **Fated Age:** 150 (+75) | **FD:** d6 (+10) | **Base Resist:** 17 (+34) | **Freq:** 25 (+25)
- **Skill:** Technical Interface d2 (+10)
- **Existing concept:** Cybernetic Augmentation (Kai) / System Vulnerability (Lady Death lien)
- **Design direction for redesign:** Network-coordination exploits with other tech-seeds. KRMA storage as a separate reserve. System Vulnerability as a real EM-based constraint (debilitating in certain environments).

#### 7. Cambion — seedKV target ~254
- **Identity:** Half-demons. Physical edge, dual nature, internal moral tension.
- **Augs (65 net):** Clout 10 / Cel 10 / Con 8 / Foc 5 / Flow 5 / Will 10 / Wis 6 / Wit 11
- **Fated Age:** 150 (+75) | **FD:** d8 (+20) | **Base Resist:** 17 (+34) | **Freq:** 30 (+30)
- **Existing concept:** Dual Nature (Et'herling) / Torn Heart (Lady Death lien)
- **Design direction for redesign:** Choose-your-resistance per-day exploit. Torn Heart as a forced-decision moment that reshapes scenes (GM triggers, player rolls Willpower or acts according to dual nature).

#### 8. Cambion-adjacent — Neo-Human — seedKV target ~287
- **Identity:** Post-human evolved. Engineered for alien environments. Versatile, durable.
- **Augs (60 net):** Clout 6 / Cel 7 / Con 10 / Foc 8 / Flow 7 / Will 8 / Wis 6 / Wit 8
- **Fated Age:** 200 (+100) | **FD:** d8 (+20) | **Base Resist:** 16 (+32) | **Freq:** 35 (+35)
- **Existing concept:** Adaptive Physiology (Kai) / Genetic Drift (Lady Death lien)
- **Design direction for redesign:** Per-day environmental adaptation choice. Inability to rest fully outside a controlled environment — reshapes long-rest economy.

#### 9. Elemental-Kin — seedKV target ~277
- **Identity:** Humanoids with one chosen elemental bloodline (fire/water/earth/air/lightning/cold).
- **Augs (60 net):** Clout 7 / Cel 6 / Con 9 / Foc 9 / Flow 11 / Will 7 / Wis 6 / Wit 5
- **Fated Age:** 200 (+100) | **FD:** d6 (+10) | **Base Resist:** 15 (+30) | **Freq:** 30 (+30)
- **Existing concept:** Elemental Affinity (Et'herling) / Environmental Dependency (Lady Death lien)
- **Design direction for redesign:** Affinity reshapes magic-Effort economy for that element. Innate minor manifestation without checks. Hostile environment depletes Constitution over time.

#### 10. Soul-Forged — seedKV target ~297
- **Identity:** Warriors with reforged souls. Spirit-anchored body durability, identity fragmentation.
- **Augs (55 net):** Clout 7 / Cel 6 / Con 12 / Foc 6 / Flow 5 / Will 13 / Wis 2 / Wit 4
- **Fated Age:** 300 (+150) | **FD:** d4 (+5) | **Base Resist:** 20 (+40) | **Freq:** 25 (+25)
- **Existing concept:** Spirit Weapon (Et'herling) / Fragmented Identity (Lady Death lien)
- **Design direction for redesign:** Manifest a weapon scaled to Will pool. Per-session fragment-surface (visions/lapses) — reshapes scenes.

#### 11. Memory-Keeper — seedKV target ~313
- **Identity:** Beings with perfect ancestral memories. Lore-deep, Wisdom-defined.
- **Augs (60 net):** Clout 4 / Cel 6 / Con 7 / Foc 8 / Flow 5 / Will 11 / Wis 13 / Wit 6
- **Fated Age:** 300 (+150) | **FD:** d6 (+10) | **Base Resist:** 14 (+28) | **Freq:** 30 (+30)
- **Skill:** Lore d2 (+10)
- **Existing concept:** Ancestral Memories (Et'herling) / Information Overload (Lady Death lien)
- **Design direction for redesign:** Spend Frequency to gain a piece of GM-provided info. Cannot be lied to about historical events. Overload risks losing actions in stress moments.

---

### High Tier (350-550)

#### 12. Synthetic — seedKV target ~421
- **Identity:** Artificial beings. Logic-strong, emotion-poor, durable. Native technical fluency.
- **Augs (70 net):** Clout 8 / Cel 8 / Con 12 / Foc 14 / Flow 2 / Will 6 / Wis 4 / Wit 16
- **Fated Age:** 500 (+250) | **FD:** d8 (+20) | **Base Resist:** 18 (+36) | **Freq:** 30 (+30)
- **Skill:** Technical Interface d3 (+14)
- **Existing concept:** Logical Processor (Kai) / Emotional Limitations (Lady Death lien)
- **Design direction for redesign:** Immune to charm/illusion/poison/disease (a play-defining package). Perfect recall via Frequency Spend. The Thorn locks out Flow Effort entirely — reshapes magic and social tools.

#### 13. Starborn — seedKV target ~519
- **Identity:** Beings born in stellar nurseries. Long-lived, cosmic-attuned, starlight-dependent.
- **Augs (60 net):** Clout 4 / Cel 4 / Con 8 / Foc 13 / Flow 9 / Will 9 / Wis 9 / Wit 4
- **Fated Age:** 1000 (+500) | **FD:** d4 (+5) | **Base Resist:** 16 (+32) | **Freq:** 30 (+30)
- **Skill:** Astral Navigation d2 (+10)
- **Existing concept:** Stellar Attunement (Et'herling) / Solar Dependency (Lady Death lien)
- **Design direction for redesign:** Long Rest under starlight has special properties. Stellar-source effort regeneration per session. Solar Dependency forces locations/timing decisions for the campaign.

#### 14. Astral Drifter — seedKV target ~526
- **Identity:** Cosmic wanderers, phase-walker, detached-perspective.
- **Augs (55 net):** Clout 4 / Cel 7 / Con 6 / Foc 9 / Flow 6 / Will 8 / Wis 7 / Wit 10
- **Fated Age:** 1000 (+500) | **FD:** d8 (+20) | **Base Resist:** 13 (+26) | **Freq:** 25 (+25)
- **Skill:** Cosmic Lore d2 (+10)
- **Existing concept:** Void-Walker (Lady Death) / Temporal Displacement (Lady Death lien)
- **Design direction for redesign:** Per-rest phasing through a solid object. Immune to terror. Per-session displacement (briefly removed from physical reality — can't act but can't be targeted).

---

### Premium Tier (550+)

#### 15. Celestial — seedKV target ~685
- **Identity:** Angelic beings in mortal realms. Divine codes, mortal-compassion-as-weakness.
- **Augs (65 net):** Clout 4 / Cel 7 / Con 8 / Foc 9 / Flow 10 / Will 13 / Wis 8 / Wit 6
- **Fated Age:** 1500 (+750) | **FD:** d4 (+5) | **Base Resist:** 17 (+34) | **Freq:** 25 (+25)
- **Existing concept:** Divine Mandate (Et'herling) / Mortal Compassion (Lady Death lien)
- **Design direction for redesign:** Cannot tell lies (mechanical compulsion). Once-per-rest healing via touch. Mortal Compassion forces hesitation in moral dilemmas — reshapes how the player navigates pressure.

---

## 9. What's Needed from the Brainstorm Session

For each of the 15 seeds:
1. Author the **Nectar** as a play-defining exploit (one block, can have multiple clauses, but at least one clause must reshape resource economy / action options / rule interactions in a way that defines the character's mechanical identity).
2. Author the **Thorn** as a play-defining constraint (also functions as a Lady Death lien). The Thorn should not just be a flat penalty — it should change how the player navigates the system.
3. Assign each block an **owner Godhead** (Kai, Et'herling, or Lady Death typically — Lady Death automatic for Thorn liens).
4. Optionally suggest **Kai-graded KV** for each (use the seedKV target as the budget and back-solve from the locked stat-based KV contributions).

Once finalized, the 15 will get one-per-seed `WIP-*-seed-design.md` files matching the locked Elven format.

---

## 10. Reference: Other Locked Seeds (for context)

### Human (paper, FD bumped to d8 in current code)
- Augs Body 15, Spirit 12, Soul 23 (Willpower 13 defining)
- Fated 80, Base Resist 15, Freq 40, d8
- Paper-locked: "Ambitious" Nectar + "Bounded Potential" Thorn (currently not re-graded as exploits — paper holdover)

### Altered Human (paper, FD bumped to d8 in current code)
- Similar baseline shape to Human
- Fated 85, Freq 70, d8
- Paper-locked: trades Nectars/Thorns for Frequency at character creation (a flexibility-focused seed)

### Dwarven (drafted, not locked)
- Augs Body 25, Spirit 9 (low — magic-distrustful), Soul 26 (Will 13 defining stubbornness)
- Fated 350, Base Resist 18, Freq 30, d6
- Tolkien-archetype: hardy, crafters, stubborn, magic-skeptical
- Existing drafts: "Stone-Born" Nectar (Kai, +50) / "Stone-Heart" Thorn (Lady Death, −75, locks Mercy magic via Flow Effort)
- Worth re-evaluating as play-defining when convenient

---

## 11. Final Notes

- All seeds are HUMANOID_BODY. Non-humanoid body layouts are deferred post-beta.
- All Nectars and Thorns are SEED-BOUND. Players cannot replace them via the Fate Die limit mechanic. They attach to the seed blueprint, not the character.
- The 15 in this doc + already-locked Human, Altered Human, Elven, Dwarven = 19 total. Beta target is 12-15, so a trim of 4 may be desired (suggestions in v2: Astral Drifter, Memory-Keeper, Moon-Blessed, Soul-Forged) — but this is Mike's call after seeing the finalized authoring.
- Each Nectar/Thorn is graded **with synergies considered** (Kai's job). Same Nectar in a different seed could re-grade differently.
- When in doubt, refer back to **First-Born + Diminishing** in the locked Elven section as the model.
