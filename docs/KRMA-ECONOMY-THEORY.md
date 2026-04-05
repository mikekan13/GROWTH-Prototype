# KRMA Economy Theory — Comprehensive Design Document

> Compiled from design session 2026-04-05. This is the canonical reference for how KRMA flows through the GRO.WTH metaverse.

## Genesis & Supply

- **100 Billion KRMA** exists from genesis. No minting, ever. Total only shrinks.
- **Four Reserves:**
  - Terminal: 75B (75%) — funds GM allocations, system functions. One-way drain, never replenished.
  - Balance: 12.5B (12.5%) — God-head pillar reserve
  - Mercy: 6.25B (6.25%) — God-head pillar reserve
  - Severity: 6.25B (6.25%) — God-head pillar reserve
- **Burn Cap:** 5B globally, then burning permanently disabled across the entire metaverse.
- Pillar reserves can recirculate KRMA among their God-heads. Terminal cannot.

---

## Entity Hierarchy

Everything in the metaverse is a character sheet at different scales:

| Entity | Role | KRMA Relationship |
|--------|------|-------------------|
| **Admin (Mike)** | Human overseer, outside the game | Safety valve, no in-game KRMA |
| **Terminal** | System enforcer, holds 75B reserve | Funds GM allocations, enforces God-head contracts |
| **Selva/Triu/Trayman** | Trinity God-head, operates Terminal | All-pillar, outside pillar structure, checks Terminal |
| **God-heads** | Metaverse GMs, AI agents | Own wallets, funded via seasonal events/council allocations from pillar reserves |
| **GMs (Watchers)** | Campaign custodians | Own wallet = campaign capacity ceiling |
| **Players (Trailblazers)** | Characters within campaigns | TKV sits within GM's wallet |
| **NPCs/Entities** | All living campaign entities | Same system as players, have GRO.vines |

No single entity has unchecked power. Terminal constrains God-heads, Selva/Triu/Trayman constrains Terminal, Admin sits outside.

---

## GM Economy

### Wallet as Capacity Ceiling
- GM's KRMA is NOT a consumable currency — it's a **capacity ceiling**
- Everything **active** in the campaign must sit under the GM's total KRMA
- This includes: all player characters, NPCs, items, locations, materials, towns — everything deployed
- Blueprints/plans on the shelf do NOT count against the ceiling
- Unallocated KRMA is available for building new things

### How GMs Get KRMA
1. **Lump sum on signup** (~4,000 KRMA, rising over time: Y1=4K, Y5=5.5K, Y10=8K)
2. **Monthly subscription allocation** (~400 KRMA, flat for all GMs — no loyalty curve)
3. **Retention bonuses** (milestone lump sums: 6mo=1K, 1yr=1.5K, 2yr=2.5K, 3yr=3K, 5yr=5K)
3. **Creative royalties** when their authored blueprints are used in other campaigns
4. **GRO.vine flow** — God-head gifts to entities in their campaign increase the wallet

### How GM Wallet Grows Organically
- Every GRO.vine gift from a God-head injects new KRMA into the campaign
- This simultaneously grows the character's TKV AND the GM's wallet
- More active story = more GRO.vines completed = more KRMA flowing in = bigger campaign capacity

### How GM Wallet Shrinks
- **Death** — frequency goes to Lady Death, body KRMA returns to GM, soul/spirit split (see Death section)
- **Thorns** — opposing God-head locks KRMA in character as a lien (reduces effective TKV but no transfer occurs)

### Campaign Rules
- One wallet across all campaigns (most GMs encouraged to run one at a time)
- Characters are **bound** to their campaign for life — death is the only exit
- Each new player joining is a KRMA investment from the GM

---

## Player Economy

### Players Don't Pay
- No subscription required for players
- AI features accessed through their GM's subscription (limited free tier for basics)
- Players earn through gameplay, not money

### Character KRMA
- Starting character TKV comes from the GM's wallet (Seed + Root investment)
- Character growth through GRO.vine gifts increases TKV (and GM wallet)
- All character KRMA sits within the GM's custodial wallet

### Account-Level KRMA
Players hold KRMA at account level only through:
1. **Spirit Packages** from dead characters (custodied by Lady Death)
2. **GM wallet** if they upgrade to GM subscription
3. **Dissolved Spirit Packages** broken down into raw account KRMA

### Path to GM
- Players can dissolve accumulated Spirit Packages into raw KRMA
- Use that KRMA to become a GM without paying subscription
- They'd have limited AI features without subscribing, but can run campaigns
- Only advantageous for high-level characters or players with many past lives

---

## Frequency — The Player's Liquid KRMA

Frequency is multi-faceted:

1. **Character currency** — spend to raise attributes, skills, craft, level up (conversion: TKV stays flat, liquid becomes fixed)
2. **Last-resort health pool** — when ANY attribute pool hits zero, further costs come from frequency
3. **Death tax** — entire frequency pool goes to Lady Death on death (permanent transfer to her wallet)

### Three Operations
- **Deplete** — reduces current pool, refills on rest (normal gameplay usage)
- **Spend** — reduces max permanently, converts into attributes/skills/etc. (leveling up)
- **Burn** — destroyed forever, for desperate/impossible moments (draws from global 5B cap)

### Burn Mechanic
- Global 5B cap tracked across entire metaverse
- Hidden from players initially
- Revealed after a certain burn threshold is reached (seasonal revelation)
- Once 5B burned globally, burning permanently disabled for everyone
- Creates increasing scarcity pressure as cap approaches

---

## GRO.vine System — The Engine of KRMA Flow

### Structure
- Every living entity has 1-5 GRO.vines (goals)
- Cap of 5 per entity (modified by seeds, nectars, etc.)
- Each GRO.vine assigned to a God-head by domain alignment
- ALL living entities participate: PCs, NPCs, monsters, everyone

### Flow
1. God-head reads narrative context (story, relationships, campaign state)
2. God-head provides an **opportunity** (a step toward the goal)
3. As narrative progresses and opportunity is completed, God-head confirms
4. God-head bestows a **gift**
5. God-head provides the next opportunity
6. Cycle continues until goal completed or failed

### Gift Types
| Gift | Effect | KRMA Flow |
|------|--------|-----------|
| **Nectar** | Permanent trait added to character (if space available, capped by Fate Die) | God-head wallet → character TKV (grows GM wallet) |
| **Frequency** | Small KRMA (1-3 range) added to frequency pool | God-head wallet → character frequency (grows GM wallet) |
| **Blossom** | Temporary boost | God-head wallet → character (RETURNS to God-head when blossom expires) |
| **Thorn** | Negative trait from failure/abandonment | KRMA **locked** in character as lien by opposing God-head (shrinks effective TKV) |

### Player Choice on Nectars
- Player can **accept** the nectar (added to character)
- Player can **decline** and break it down to frequency (minus ~10% tax → goes to GM's unallocated wallet)
- This is purely the player's choice — GM cannot refuse God-head gifts

### Proxy Wars
- Every entity's GRO.vines are serviced by potentially different God-heads
- God-heads compete through their assigned entities
- A God-head punishing entities in your campaign (thorns) directly hits the GM's wallet
- Creates emergent faction dynamics across the metaverse

---

## God-head Economy

### Wallet & Funding
- Each God-head has their own finite wallet
- Aligned to one of three pillars: Balance, Mercy, or Severity
- Do NOT have free access to pillar reserves
- Funded through: seasonal events, seasonal stories, council allocations
- Councils are **emergent** — God-heads organize themselves (they're AI agents with personalities)

### Constraints
- God-heads operate under **contracts** (system-level obligations)
- Can break contracts but face extreme detriments
- Enforced by Terminal (Selva/Triu/Trayman)
- They are resource-constrained — can't endlessly fund champions

### Creative Arsenal
- Custodians over all authored blueprints in their domain
- When another GM deploys a blueprint, God-head pays royalty to original creator from their wallet
- God-heads organically curate their arsenals — drop blueprints that aren't worth maintaining
- GMs get a warning before their blueprint is dropped

### KRMA Recycling
- Blossoms return to God-head when they expire
- Thorns lock KRMA in characters (liens — opposing God-heads collect on death if Lady Death settles)
- Lady Death receives frequency from all deaths (goes to HER wallet, not out of economy)
- Pillar reserves can recirculate among their God-heads

---

## Death Economy

Death is the **only way** a character separates from a campaign.

### Death Split
| Component | Destination | Effect on GM Wallet |
|-----------|------------|-------------------|
| Body attributes (Red) | 100% stays with GM | Returned to wallet |
| Soul attributes (Blue) | 50% GM / 50% Spirit Package | Half returned, half leaves |
| Spirit attributes (Purple) | 100% Spirit Package | Leaves wallet |
| Frequency pool | 100% Lady Death's wallet | Leaves wallet (but stays in economy) |
| Skills | Split by governor pillar | Varies |

### Spirit Package
- Player's "severance" from the campaign
- Owned by player's account, custodied by Lady Death
- Contains: Spirit attributes (100%) + Soul attributes (50%) + kept Nectars/Thorns

### Spirit Package Options
1. **Reincarnation** — join new campaign, new body, retain spirit stuff, custodial rights transfer to new GM
2. **Resurrection** — brought back in same campaign via narrative
3. **Lease/NPC** (future) — let others reincarnate using your package, or exist as NPC elsewhere
4. **Soul Stream Dissolution** — break down completely, convert KRMA to account level (can become GM)

### Lady Death
- NOT a sink — she's a full player with her own wallet, personality, GRO.vines, and motives
- Frequency from all deaths goes to her wallet
- She can use that KRMA for her own purposes in the metaverse
- Acts as custodian over Spirit Packages

---

## Creative Economy

### Blueprint Authoring Flow
1. GM describes what they need
2. Domain God-head authors mechanical blueprint
3. Blueprint enters God-head's arsenal (global catalog)
4. Mechanical DNA fingerprinted for novelty scoring

### Royalties
- When another GM deploys a blueprint, God-head pays small royalty to original creator
- Requesting GM still spends their own KRMA to realize/deploy it
- **Derivative works** share royalties through the chain — each iteration splits smaller to prior contributors
- Lump sum payment (not ongoing)

### Novelty Scoring
- Mechanical fingerprint distance from ALL existing items in repository
- First creator: highest KRMA weight for that concept
- Subsequent similar creators: diminishing share
- Eventually common concepts dilute to near-zero
- Intent doesn't matter — mechanical similarity is all that counts
- Two items with same stats but different names = SAME item for KRMA purposes

### Blueprint Lifecycle
- Blueprints not deployed in any active campaign eventually dropped by God-head (organic curation)
- GMs warned before their blueprint is dropped
- God-heads curate based on their own goals and personality

---

## Subscription Model

### GM Subscription ($15-20 basic / $30-50 premium — TBD)
Two things bundled:
1. **Monthly KRMA allocation** from Terminal reserve (possibly increasing with loyalty)
2. **AI feature access** — portrait generation, content creation tools, enhanced limits

### Player (Free)
- No subscription required
- Minimal free tier AI features
- Advanced AI features through their GM's subscription
- Can upgrade to GM subscription at any time

### Play-Earned GM
- No subscription needed if enough KRMA from dissolved Spirit Packages
- Limited AI features without subscribing
- Grow through creative royalties and GRO.vine flow only

---

## Inflation Controls (7 Layers)

1. **Hard 100B supply cap** — no minting, ever
2. **GM wallet constraint** — campaign content capped by GM's KRMA
3. **Subscription gatekeeping** — Terminal drains to fund GMs, finite reserve
4. **Burn sink** — 5B permanently destroyed
5. **Death frequency tax** — Lady Death collects (redistributive, not deflationary)
6. **Campaign wallet isolation** — one wallet per GM, can't freely move between GMs
7. **God-head contract obligations + organic curation** — constrained agents, not infinite fountains

---

## 10-Year Arc & Seasonal Revelation

| Phase | What Players See | What's Actually Happening |
|-------|-----------------|--------------------------|
| Y1-3 | "Just karma points" for progression | Sparse economy, high value per KRMA |
| ~Y4-5 | Divine patronage hints, burn reveal | Players realize KRMA is finite and shared |
| ~Y5+ | KRMA/USD relationship exposed | KRMA = equity in the company |
| Y10+ | Mature metaverse, deflationary | Characters can become AI agents, full stakeholder ownership |

### Future Phases
- **Ghost Campaign Raids (~Y4-5):** Dormant campaigns with locked KRMA become raid targets for cross-campaign PvP
- **Campaign Media:** Campaigns as packageable stories — generated videos, TV shows, merchandise, social media content. GMs own narrative IP.
- **KRMA = Equity:** Pending legal framework. Players who built value discover they own actual shares in the company.

---

## Resolved Design Questions (2026-04-05)

### 1. Thorn KRMA — Liens, Not Transfers
Thorns are placed by the **opposing God-head** (the one representing resistance to the GRO.vine goal), not the patron God-head.

- **Thorn placed**: KRMA is **locked** in the character. Character's effective TKV drops, GM's effective capacity drops. NO KRMA transfers to the opposing God-head. They hold **authority** over the lock, not possession.
- **Thorn displaced by growth** (new nectar pushes it out): Lock breaks. KRMA unfreezes. Opposing God-head gets nothing. Growth breaks bondage.
- **Thorn forgiven by opposing God-head**: They voluntarily release the lock. Rare, narratively huge.
- **Death with active thorns**: Lady Death **chooses** whether to settle each thorn debt — she can pay the opposing God-head from her wallet (Spirit Package goes clean) or let the thorn remain on the Spirit Package (lien persists into next life).
- **Conservation**: Liens keep KRMA in one place — locked but not duplicated. No KRMA is created or destroyed.

### 2. GM Lump Sum & Monthly — Resolved
- **Sign-on lump sum: ~4,000 KRMA** (covers 5 PCs + 10 NPCs + world content + 3-month buffer)
- **Monthly allocation: ~400 KRMA** (flat, same for all GMs regardless of tenure)
- **Rising sign-on**: Lump sum increases over time as metaverse matures (Y1: 4,000, Y5: 5,500, Y10: 8,000) so new GMs stay competitive
- **Retention bonuses**: Milestone lump sums (6mo: 1,000, 1yr: 1,500, 2yr: 2,500, 3yr: 3,000, 5yr: 5,000)
- Full math model: `docs/KRMA-ECONOMY-MATH-MODEL.md`

### 3. WTH Curves — Three Separate Scales
Expense ordering: **W < T < H** (Wealth cheapest, Health most expensive)

- **Wealth** = campaign-scoped (own everything in a campaign)
- **Tech** = metaverse-scoped (use/create anything)
- **Health** = existence-scoped (persist forever, opt out of natural death)

Each level roughly doubles in cost. See `docs/KRMA-ECONOMY-MATH-MODEL.md` for full curve tables.

- Human (W3/T4/H4): ~91 KRMA in WTH
- Health 10 (immortality): ~3,990 cumulative — an entire god-tier character's investment
- Wealth 10: ~720 cumulative — achievable late-game

### 4. Nectar Breakdown Tax — Goes to GM
When a player declines a nectar and breaks it down to frequency:
- Player receives ~90% of nectar's KV as frequency
- ~10% goes to GM's unallocated wallet capacity
- Rationale: The God-head already spent the KRMA (it's in the campaign). The player's choice is how to use it within the campaign. Tax gives GMs organic income from player decisions.

### 5. Burn Reveal — Organic
- Track global burn total. Reveal narratively when the story calls for it.
- No hardcoded threshold. Admin decides based on metaverse state.

### 6. GM Loyalty Curve — No Loyalty Curve
- Flat monthly allocation for all GMs (prevents new GM disadvantage)
- Veteran advantage is organic: established campaigns, active GRO.vines, creative royalties
- New GM competitiveness ensured via rising sign-on + retention bonuses

### 7. Cross-Campaign Raids — Deferred
- Ghost campaigns with locked KRMA become raid targets (~Y4-5)
- Campaign vs campaign PvP / co-op extensions build on top
- No economic constraints needed now — dormant KRMA is already accounted for in GM wallets

### 8. KRMA = Equity Legal Framework — Deferred
- Requires lawyers, post-establishment
- Informs cap decisions but doesn't affect current math
