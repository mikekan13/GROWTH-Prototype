# KRMA_System.md

**Status:** #needs-validation  
**Source:** GROWTH_Rule_Synthesis.md, ChatGPT_Project_Memory.md, Economy Design Session 2026-04-05  
**Security:** PUBLIC  
**Last Updated:** 2026-04-05

---

# KRMA System

The **KRMA** (Karma) system is GRO.WTH's **universal meta-currency** with a hard-capped supply. Every unit exists in a global namespace traceable from its origin reserve through every wallet it has touched.

<!-- SECRET: KRMA is actually influence mass that gets bound into creations and represents ownership stake in the GRO.WTH ecosystem. Players unknowingly accumulate real economic value through creative play. Only GMs pay subscriptions - players accumulate KRMA through gameplay that eventually converts to platform ownership. -->

## Genesis & Supply

**Total Supply:** 100 Billion KRMA — hard cap, never increases, only shrinks via burn.

| Reserve | Allocation | Purpose |
|---------|-----------|---------|
| **Terminal** | 75B (75%) | GM allocations, system-wide functions. One-way drain, never replenished. |
| **Balance** | 12.5B (12.5%) | God-head pillar reserve. Can recirculate among God-heads. |
| **Mercy** | 6.25B (6.25%) | God-head pillar reserve. Can recirculate among God-heads. |
| **Severity** | 6.25B (6.25%) | God-head pillar reserve. Can recirculate among God-heads. |

**Burn Cap:** 5 Billion globally. Once reached, burning is permanently disabled across the entire metaverse.

## KRMA vs KV vs TKV

| Concept | Nature | Description |
|---------|--------|-------------|
| **KRMA** | Currency in wallets | Transferable, traceable units in the global ledger |
| **KV** | Power rating | Karma Value of a specific creation (item, nectar, entity) |
| **TKV** | Derived total | Total Karmic Value — sum of all KV in a character. Never stored directly, always calculated. |

## KRMA States

| State | Description | Example |
|-------|-------------|---------|
| **Fluid** | Available for transfer/spending | KRMA in a wallet |
| **Locked** | Bound into a creation/character | KRMA invested in an attribute |
| **Lien** | Locked and under another entity's authority | KRMA suppressed by a Thorn (see Thorn Mechanics) |
| **Burned** | Permanently destroyed | Frequency burn for impossible actions |

Transitions: Fluid → Locked (investment), Locked → Fluid (death/deconstruction), Locked → Lien (thorn placed), Lien → Locked (thorn displaced/forgiven), Fluid → Burned (voluntary burn, irreversible).

## Wallet Types & Circulation

### Entity Hierarchy

| Entity | Wallet | Relationship |
|--------|--------|-------------|
| **Terminal** | System reserve (75B) | Funds GM allocations. Operated by Selva/Triu/Trayman (Trinity God-head). |
| **God-heads** | Individual wallets | Funded via seasonal events/council allocations from pillar reserves. NOT free access to reserves. |
| **GMs (Watchers)** | Campaign wallet | Capacity ceiling over all active campaign content. |
| **Characters** | Part of GM wallet | All character TKV sits within the GM's wallet. |
| **Players** | Account-level (Spirit Packages only) | Only hold KRMA via Spirit Packages from dead characters, or if they upgrade to GM subscription. |

### GM Wallet — Capacity Ceiling Model

The GM's KRMA is **not a consumable currency** — it is a **capacity ceiling**. Everything **active** in the campaign (player characters, NPCs, items, locations, materials, towns) must sit under the GM's total KRMA.

- Blueprints/plans on the shelf do NOT count — only deployed/active content
- One wallet across all campaigns (GMs encouraged to run one at a time)
- Characters are **bound** to their campaign for life — death is the only exit
- Each new player joining is a KRMA investment from the GM

### How GMs Get KRMA

1. **Lump sum on signup** (~4,000 KRMA, rising over time as metaverse matures) — from Terminal reserve
2. **Monthly subscription allocation** (~400 KRMA, flat for all GMs) — from Terminal reserve
3. **Retention bonuses** — milestone lump sums at 6mo, 1yr, 2yr, 3yr, 5yr — from Terminal reserve
4. **Creative royalties** — when authored blueprints are used in other campaigns (paid by domain God-head)
5. **GRO.vine flow** — God-head gifts to entities in the campaign increase the wallet organically
6. **Nectar breakdown tax** (~10%) — when players convert nectars to frequency, GM receives the tax portion

### How Campaigns Grow

Every [[GROvine_System|GRO.vine]] gift from a God-head injects new KRMA into the campaign. This simultaneously grows the character's TKV AND the GM's wallet. More active story = more GRO.vines completed = more KRMA flowing in = bigger campaign capacity.

Players are the **main source** of new KRMA flowing into campaigns (outside of creative royalties and monthly subscription increases).

## Frequency — The Player's Liquid KRMA

[[Three_Pillar_Attributes|Frequency]] is multi-faceted:

1. **Character currency** — spend to raise attributes, skills, craft, level up. This is a conversion (TKV stays flat — liquid becomes fixed investment).
2. **Last-resort health pool** — when ANY attribute pool hits zero, further costs come from Frequency.
3. **Death tax** — entire Frequency pool goes to [[Lady_Death_Protocols|Lady Death]] on death.

### Three Frequency Operations

| Operation | Effect | Reversible? | Description |
|-----------|--------|-------------|-------------|
| **Deplete** | Reduces current pool | Yes (refills on rest) | Normal gameplay usage |
| **Spend** | Reduces max permanently | No | Converts to attributes/skills (leveling up). TKV stays flat. |
| **Burn** | Destroyed forever | Never | For desperate/impossible moments. Draws from global 5B cap. |

### Burn Mechanic
- Global 5B cap tracked across entire metaverse
- Hidden from players initially — revealed after a burn threshold is reached
- Once 5B burned globally, burning permanently disabled for everyone
- Creates increasing scarcity pressure as cap approaches

## Character Creation KRMA

**Base Template:** ~200 KV total budget
- **100 KV:** Seed selection
- **100 KV:** Root selection
- **Age Modifier:** -2 KV per year of starting age (Root age, usually 16-21 years)

### KV Costing (Deterministic Track)

| Element | KRMA Cost |
|---------|-----------|
| Each attribute point | 1 KRMA |
| Each frequency point | 1 KRMA |
| Skill levels | TBD (starting assumption 1:1, may differ) |
| Body Resist | TBD (paper version was 2:1) |
| Fate Die | TBD |
| WTH levels | Three separate doubling curves: **W < T < H** |

#### WTH Curves (Draft — Will Tune Through Playtesting)

Expense ordering: **Wealth** (campaign-scoped) < **Tech** (metaverse-scoped) < **Health** (existence-scoped)

| Level | Wealth | Tech | Health |
|-------|--------|------|--------|
| 1 | 1 | 2 | 3 |
| 2 | 2 | 4 | 7 |
| 3 | 4 | 8 | 15 |
| 4 | 8 | 15 | 30 |
| 5 | 15 | 30 | 60 |
| 6 | 30 | 60 | 125 |
| 7 | 55 | 110 | 250 |
| 8 | 100 | 200 | 500 |
| 9 | 180 | 375 | 1,000 |
| 10 | 325 | 700 | 2,000 |

Health 10 (immortality) costs ~3,990 cumulative — an entire god-tier character's worth of investment. Wealth 10 costs ~720 cumulative. Tech 10 costs ~1,504 cumulative.

### KV Costing (Non-Deterministic Track)

[[Nectars_and_Thorns_System|Nectars]], [[Nectars_and_Thorns_System|Thorns]], abilities, and custom creations are AI-graded and KV-stamped immutably.

## KRMA and Death

See [[Lady_Death_Protocols]] and [[Spirit_Package_System]] for full details.

### Death Split

| Component | Destination | GM Wallet Effect |
|-----------|------------|-----------------|
| Body attributes (Red) | 100% stays with GM | Returned to wallet |
| Soul attributes (Blue) | 50% GM / 50% Spirit Package | Half returned, half leaves |
| Spirit attributes (Purple) | 100% Spirit Package | Leaves wallet |
| Frequency pool | 100% [[Lady_Death_Protocols|Lady Death]]'s wallet | Leaves wallet (stays in economy) |
| Skills | Split by governor pillar | Varies |
| **Active Thorns** | Lady Death decides (see below) | Depends on her choice |

**Lady Death does NOT remove KRMA from the economy.** Frequency goes to her wallet — she is a full player with her own motives, GRO.vines, and agenda.

### Thorn Settlement on Death
When a character dies with active thorns, **Lady Death chooses** for each thorn:
- **Settle the debt**: Pay the opposing God-head from her wallet. The thorn is removed. Spirit Package goes clean.
- **Let it ride**: Thorn remains on the Spirit Package. The opposing God-head's lien persists into the player's next life.

Lady Death's choice is driven by her own contracts, emblems, personality, economic situation, and strategic goals. She may also make moral judgments that could conflict with her contracts (with consequences). See [[Lady_Death_Protocols]] for full details.

## Subscription Model

### GM Subscription
Two things bundled:
1. **Monthly KRMA allocation** from Terminal reserve
2. **AI feature access** — portrait generation, content creation tools, enhanced limits

### Player (Free)
- No subscription required
- Minimal free tier AI features
- Advanced AI features through their GM's subscription
- Can upgrade to GM subscription at any time

### Play-Earned GM
- Players can dissolve accumulated Spirit Packages into raw KRMA
- Use that KRMA to become a GM without paying subscription
- Limited AI features without subscribing
- Only advantageous for high-level characters or players with many past lives

## Inflation Controls (7 Layers)

1. **Hard 100B supply cap** — no minting, ever
2. **GM wallet constraint** — campaign content capped by GM's KRMA
3. **Subscription gatekeeping** — Terminal drains to fund GMs, finite reserve
4. **Burn sink** — 5B permanently destroyed
5. **Death frequency transfer** — Lady Death collects (redistributive, not deflationary)
6. **Campaign wallet isolation** — one wallet per GM, can't freely move between GMs
7. **God-head contract obligations + organic curation** — constrained agents, not infinite fountains

## 10-Year Arc

<!-- SEASONAL-S4: KRMA/USD conversion revealed -->
<!-- SEASONAL-S5: Full stakeholder model -->

| Phase | What Players See | What's Actually Happening |
|-------|-----------------|--------------------------|
| Y1-3 | "Just karma points" for progression | Sparse economy, high value per KRMA |
| ~Y4-5 | Divine patronage hints, burn reveal | Players realize KRMA is finite and shared |
| ~Y5+ | KRMA/USD relationship exposed | KRMA = equity in the company |
| Y10+ | Mature metaverse | Characters can become AI agents, full stakeholder ownership |

### Future Phases
- **Ghost Campaign Raids (~Y4-5):** Dormant campaigns with locked KRMA become raid targets for cross-campaign PvP
- **Campaign Media:** Campaigns as packageable stories — videos, TV shows, merchandise. GMs own narrative IP.

---

## Links
- Related: [[Spirit_Package_System]], [[Lady_Death_Protocols]], [[Godheads_System]], [[Terminal_Interface]]
- References: [[KRMA_Costs_Table]], [[GROvine_System]]
- Examples: [[KRMA_Spending_Strategies]]
