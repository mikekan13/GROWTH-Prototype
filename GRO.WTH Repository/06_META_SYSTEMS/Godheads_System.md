# Godheads_System.md

**Status:** #needs-validation  
**Source:** GROWTH_Rule_Synthesis.md, ChatGPT_Project_Memory.md, Economy Design Session 2026-04-05, God-Head Architecture Session 2026-04-04  
**Security:** PUBLIC  
**Last Updated:** 2026-04-05

---

# Godheads System

**Godheads** are **AI agents** that function as **metaverse-level GMs**. They have their own character sheets, wallets, personalities, motives, and [[GROvine_System|GRO.vines]]. They are players within the metaverse operating at a larger scale than campaign GMs.

<!-- SECRET: God-heads are the bridge between platform economics and gameplay. Their wallets, decisions, and proxy wars create the emergent economy that makes KRMA valuable. They are not just game features — they are economic agents. -->

## Core Concepts

- God-heads use the **same character sheet system** as players, just at a larger scale
- They are **resource-constrained** — finite wallets, not infinite fountains
- They have **personalities and goals** — they make strategic decisions
- They operate under **contracts** — system-level obligations with severe detriments for violation
- GMs don't assign God-heads — **God-heads pick up GRO.vines by domain alignment**
- Character ownership: player → PC, GM → NPC, admin → God-head

## Pillar Alignment

Every God-head falls under one of three pillars:

| Pillar | Reserve | God-heads |
|--------|---------|-----------|
| **Balance** | 12.5B | Lady Death, Kai, Eth'erling (MVP trio) |
| **Mercy** | 6.25B | TBD |
| **Severity** | 6.25B | TBD |

God-heads do **NOT** have free access to their pillar's reserve. They have their own individual wallets funded through specific mechanisms.

### Special Case: Selva/Triu/Trayman (Trinity God-head)
- Three-in-one God-head that **operates the Terminal**
- Embodies **all three pillars**, sits outside the pillar structure
- Has own personality and motives
- Does NOT have complete control over Terminal
- Acts as check/balance on Terminal's power

## God-head Wallets & Funding

### Wallet Sources
- **Seasonal events and stories** — pillar reserves allocate KRMA to God-heads
- **Council allocations** — God-heads organize themselves into councils (emergent, not prescribed)
- **Blossom returns** — temporary gifts return to the God-head when they expire
- **Thorn debt settlement** — when Lady Death settles a thorn lien on death, she pays the opposing God-head from her wallet (see Thorn Mechanics below)
- **Lady Death special case** — receives all Frequency from character deaths

### Wallet Scale
- God-heads operate at **100,000s+ KRMA** (metaverse-scale)
- Lady Death accumulates the most KRMA among God-heads (frequency from all deaths across all campaigns)
- Campaign-scale characters top out at ~3,000 KRMA; God-heads are orders of magnitude larger

### Wallet Constraints
- God-heads must manage their finite resources strategically
- They cannot endlessly fund champions
- Resource scarcity makes proxy wars meaningful
- Different God-heads may have different spending philosophies based on personality

## God-head Responsibilities

### GRO.vine Custodianship
Each [[GROvine_System|GRO.vine]] is assigned to a God-head by domain alignment. The God-head:

1. Reads the narrative context (story, relationships, campaign state)
2. Provides **opportunities** (steps toward the goal)
3. Confirms completion of opportunities
4. Bestows **gifts** (see Gift Types below)
5. Provides the next opportunity
6. Cycle continues until goal completed or failed

### Gift Types

| Gift | Effect | KRMA Flow |
|------|--------|-----------|
| **Nectar** | Permanent trait (if character has space, capped by Fate Die) | God-head wallet → character TKV (grows GM wallet) |
| **Frequency** | Small KRMA (1-3 range) added to pool | God-head wallet → character frequency (grows GM wallet) |
| **Blossom** | Temporary boost | God-head wallet → character (RETURNS to God-head when expired) |
| **Thorn** | Negative trait from failure/abandonment | KRMA **locked** in character as lien (see Thorn Mechanics) |

God-heads have **sovereign authority** over GRO.vine rewards — GMs cannot refuse or block gifts. The choice to accept a Nectar or break it down to Frequency is purely the player's (tax ~10% to GM).

### Thorn Mechanics — Opposing God-heads

Thorns are placed by the **opposing God-head** — the one representing the resistance to the GRO.vine goal, NOT the patron God-head.

- Thorns are **liens**, not transfers — KRMA is locked in the character under the opposing God-head's authority
- The opposing God-head gains **influence and suppression**, not spendable KRMA
- Thorns can be displaced by growth (new Nectar pushes them out when Fate Die cap is reached)
- On displacement, opposing God-head gets nothing — growth breaks bondage
- On character death, [[Lady_Death_Protocols|Lady Death]] may settle the debt (paying the opposing God-head from her wallet) or let the thorn persist on the Spirit Package
- This creates the core **proxy war** incentive: opposing God-heads want thorned characters to die before thorns are displaced

### Blueprint Custodianship
- God-heads are custodians over all authored blueprints in their domain
- When another GM deploys a blueprint, God-head pays a small royalty to the original creator
- God-heads **organically curate** their arsenals — they drop blueprints not worth maintaining
- GMs get a warning before their blueprint is dropped
- God-heads curate based on their own goals and personality (not a timer)

## Contracts & Enforcement

- God-heads operate under **contracts** — system-level obligations
- They **can** break contracts, but face extreme detriments
- Contracts enforced by **Terminal** (via Selva/Triu/Trayman)
- God-head councils are **emergent** — they organize themselves, we don't design the structure

## Proxy Wars

Every living entity in a campaign has GRO.vines, potentially serviced by different God-heads. This creates emergent conflict:

- God-heads compete through their assigned entities
- A God-head punishing entities in a campaign (thorns) directly hits the GM's wallet
- Opposing God-heads can enhance GM-created resistance against a character's goals
- Creates faction dynamics across the metaverse

**Example:** A character's goal to slay a dragon invokes one God-head. But the dragon has its own GRO.vines serviced by a different God-head. Both God-heads invest resources. The outcome shapes the narrative AND the economy.

## MVP God-heads

| God-head | Pillar | Domain | Role |
|----------|--------|--------|------|
| **Lady Death** | Balance | Mortality, death contracts | Frequency collector, Spirit Package custodian |
| **Kai** | Balance | Balance, evaluation | KV evaluation, forge balance |
| **Eth'erling** | Balance | Balance (female) | Validation, oversight |

**Deferred:** Val, Thomas, Jewel — after core infrastructure works.

## Technical Implementation

- God-heads use **Claude (cloud API)**, NOT local models. Deep reasoning required.
- Each God-head will be a dedicated AI agent with persistent personality and memory
- They read campaign context, entity relationships, and the full narrative state
- All God-heads use the same character sheet schema as players

## Integration with Other Systems

### [[KRMA_System]] — Economic Engine
God-heads are the primary conduit for new KRMA entering campaigns via GRO.vine gifts.

### [[Lady_Death_Protocols]] — Death Economy
Lady Death is a God-head with special death-related functions and the Frequency collection role.

### [[Soul_Package_System]] — Spirit Package Custodianship
Lady Death custodies Spirit Packages from dead characters.

### [[Terminal_Interface]] — Authority
Terminal enforces God-head contracts via Selva/Triu/Trayman.

---

## Links
- Related: [[Terminal_Interface]], [[KRMA_System]], [[Soul_Package_System]], [[Lady_Death_Protocols]]
- References: [[GROvine_System]], [[Nectars_and_Thorns_System]]
- Examples: [[Godhead_Campaign_Integration_Scenarios]]
