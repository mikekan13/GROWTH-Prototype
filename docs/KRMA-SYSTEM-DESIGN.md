# KRMA System — Architectural Design Plan

**Version:** 0.1 (Draft — Pending Clarification)
**Date:** 2026-03-09
**Author:** Claude Opus 4.6 (under Godhead authority)
**Status:** DESIGN PHASE — Not approved for implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core KRMA Model](#2-core-krma-model)
3. [Ledger Architecture](#3-ledger-architecture)
4. [Transaction Types](#4-transaction-types)
5. [Security Model](#5-security-model)
6. [Multi-Campaign Balance](#6-multi-campaign-balance)
7. [Audit and Transparency](#7-audit-and-transparency)
8. [System Interfaces](#8-system-interfaces)
9. [Existing Infrastructure](#9-existing-infrastructure)
10. [Required Clarification Questions](#10-required-clarification-questions)

---

## 1. Executive Summary

KRMA (Karma) is the universal meta-currency of the GRO.WTH metaverse. It regulates all value creation, transfer, and destruction across every campaign, character, and table. It functions as both a gameplay advancement resource and — in later seasons — a real economic instrument representing platform ownership.

Because KRMA will eventually map to real economic value, the system must be designed with the rigor of financial infrastructure from day one. Retroactive corrections to a ledger are catastrophically expensive. The architecture must be:

- **Immutable** — No transaction can be altered after recording
- **Deterministic** — Given identical inputs, the system always produces identical outputs
- **Auditable** — Any balance can be reconstructed from the transaction log at any point in time
- **Tamper-resistant** — No single actor (including the Godhead) can silently alter the ledger
- **Infallible in accounting** — The sum of all balances must equal the total supply minus burns, always

### Design Constraint: Build for Season 1, Architect for Season 5

The implementation will initially serve Season 1 needs (narrative karma points, character advancement). But the architecture must support the full vision: attribution chains, royalty flows, USD conversion, and stakeholder ownership. We build the ledger once.

---

## 2. Core KRMA Model

### 2.1 What KRMA Is

KRMA is a single universal currency with a hard-capped supply. It is not campaign-local. It is not per-table. Every unit of KRMA exists in a global namespace and can be traced from its origin (reserve pool) through every wallet it has ever touched.

**Repository authority:**
> "Total supply: 100 billion KRMA (hard cap)"
> — GROWTH-DESIGN-TRUTH.md §8

### 2.2 KRMA States

KRMA exists in three states (per the Economic Model document):

| State | Description | Example |
|-------|-------------|---------|
| **Fluid** | Available in a wallet for spending | GM's unallocated campaign pool |
| **Locked** | Bound into a creation; cannot be spent until released | KRMA invested in a character's TKV |
| **Burned** | Permanently destroyed; removed from total supply | "Trump card" extraordinary action |

**Transition rules:**
- Fluid → Locked: When KRMA is invested into a character, item, or creation
- Locked → Fluid: When the creation is destroyed, character dies (partial return), or item is deconstructed
- Fluid → Burned: Voluntary burn for extraordinary effect (irreversible)
- Locked → Burned: Not permitted (must unlock first)
- Burned → Any: **Impossible.** Burns are permanent.

### 2.3 KRMA vs KV (Karma Value)

These are distinct concepts that the system must track separately:

| Concept | Nature | Who Controls It | Mutable? |
|---------|--------|-----------------|----------|
| **KRMA** | Spendable currency in wallets | Ledger (transfer rules) | Yes (via transactions) |
| **KV** | Power rating of a creation | Two-track system (see below) | Depends on track |
| **TKV** | Total Karmic Value — sum of all KV in a character | Calculated, never stored directly | Derived (read-only) |

**Repository authority:**
> "KV (Karma Value): Character's total accumulated life experience"
> "KRMA: Spendable meta-currency for improvements"
> "System-controlled and deterministic (AlphaEvolve evaluator)"
> "GM has knobs for access/cadence/risk/upkeep but CANNOT override KV directly"
> — GROWTH-DESIGN-TRUTH.md §8, Repository KRMA_System.md

**Critical distinction:** KRMA is transferred between wallets. KV is *assigned* to creations — either calculated or graded. The GM cannot set KV directly; they author creations and the system assigns KV. TKV is always a derived value — never written, only computed.

#### Two-Track KV Assignment

KV values are assigned through two distinct tracks depending on whether the creation is deterministic or non-deterministic:

| Track | Applies To | Assigned By | Properties |
|-------|-----------|-------------|------------|
| **Deterministic** | Attribute levels, skill levels, WTH levels, language acquisition, reroll costs | Formula (versioned, hashable) | Reproducible, auditable, version-controlled |
| **Non-deterministic** | Nectars, Thorns, item abilities, custom Roots/Branches, NPC abilities, any GM-authored creation | AI Agent: **God of Chaos and Balance** | Graded at creation time, stamped immutably, auditable via AI reasoning trace |

**Deterministic track:** A versioned function that takes structured inputs (attribute value, skill level, etc.) and outputs a KV. The formula is not yet defined but must be:
- Pure (no side effects, no randomness)
- Versioned (formula changes tracked, old versions preserved)
- Hashable (the function itself can be checksummed for integrity)

**Non-deterministic track (God of Chaos and Balance):** An AI agent that evaluates GM-authored creations and assigns KV at the moment of creation/authoring. Key properties:
- **Grading happens once** — KV is stamped at creation and becomes immutable
- **AI reasoning is recorded** — The full evaluation rationale is stored alongside the KV for audit
- **GM cannot override** — The AI's KV grade is final (GM can adjust the creation and re-submit for re-grading)
- **Consistency enforcement** — The AI agent must maintain internal consistency across campaigns (a "Fireball" Nectar shouldn't be 5 KV in one campaign and 50 in another)

**Architectural implication:** Every KV assignment must be recorded in the ledger with its source track, evaluator version (deterministic) or AI session ID (non-deterministic), and the inputs that produced it. This ensures TKV can always be decomposed into its component KV assignments with full provenance.

### 2.4 Wallet Types

Every unit of KRMA lives in exactly one wallet at any given time. Wallets are categorized:

| Wallet Type | Owner | Cardinality | Purpose |
|-------------|-------|-------------|---------|
| **Reserve** | System | Exactly 4 (Terminal, Balance, Mercy, Severity) | Genesis supply. Four divine pools that seed the economy. |
| **User** | User (any role) | One per user | Personal wallet. GMs and Players each have exactly one. GMs fund campaigns from here. Players receive Spirit Package KRMA here. |
| **Campaign** | Campaign entity | One per campaign | Operational pool funded by GM's personal wallet. All character investments draw from here. |
| **Character** | Character entity | One per character | Locked KRMA representing the character's TKV investment. |
| **Burn Sink** | System (special) | Exactly 1 | Write-only sink. KRMA enters, never leaves. Tracks global burn total. |
| **Lady Death** | System (special) | Exactly 1 | Collects Frequency from dead characters. The founder's fee sink. |

**Wallet rules:**
- Each user gets exactly **one personal wallet**, created at registration. No campaign-specific sub-wallets.
- GMs fund campaigns by transferring from their personal wallet to the campaign wallet (liquid KRMA can flow back).
- Campaign wallets are the operational layer — all character creation, rewards, and session costs flow through them.
- The `@unique` constraint on `ownerId` in the current schema is correct for user wallets. Campaign and character wallets use `campaignId`/`characterId` instead.

**Reserve wallet genesis balances:**

All 100B KRMA is allocated to the four reserve wallets at genesis. Distribution to Godheads and initial GMs will be determined before live launch and executed as standard ledger transactions from these reserves.

| Reserve | Percentage | Initial Balance | Role |
|---------|-----------|----------------|------|
| Terminal | 75% | 75,000,000,000 | Primary distribution, system operations, GM allocations |
| Balance | 12.5% | 12,500,000,000 | Cross-campaign equilibrium adjustments |
| Mercy | 6.25% | 6,250,000,000 | Compassionate corrections, edge cases |
| Severity | 6.25% | 6,250,000,000 | Penalties, anti-exploit enforcement |

**Total:** 100,000,000,000 KRMA (100% of supply in reserves at genesis)

**Rationale:** Terminal is the primary faucet — all KRMA entering circulation flows from Terminal via GM subscription allocations, Godhead distributions, and system operations. Balance holds double what Mercy or Severity holds, reflecting its role as the active equilibrium mechanism across campaigns. Mercy and Severity are equal counterweights for compassionate and punitive corrections respectively.

### 2.5 Supply Distribution

At genesis, 100% of supply sits in reserve wallets. All subsequent distribution is recorded as ledger transactions:

| Phase | Source | Destination | Determined By |
|-------|--------|-------------|---------------|
| Pre-launch | Terminal | Godhead wallets | Godhead to decide before live |
| Pre-launch | Terminal | Initial GM wallets | Godhead to decide before live |
| Live | Terminal | GM wallets (subscription) | Subscription tier + system rules |
| Live | GM wallets | Campaign wallets | GM discretion (within balance) |
| Live | Campaign wallets | Player/Character wallets | Gameplay events |

This approach ensures every unit of KRMA has a complete audit trail from genesis reserve to current holder, with no pre-allocated "phantom" supply.

### 2.6 Burn Mechanics

**Repository authority:**
> "Hard cap: 5 billion KRMA burned globally, then burning removed forever"
> "Exponential cost scaling as more is burned"
> "Burns create permanent 'scars' in the meta-campaign ledger"
> — GROWTH-DESIGN-TRUTH.md §8

- Global burn counter tracked in a dedicated system record
- When `totalBurned >= 5,000,000,000`: burn transactions rejected system-wide
- Cost scaling function: Exponential — exact formula TBD through testing (see Deferred Q2)
- "Scars" are metadata attached to burn transactions (narrative description of what the burn accomplished)

---

## 3. Ledger Architecture

### 3.1 Design Principles

The KRMA ledger follows double-entry accounting. Every transaction has a debit (source) and credit (destination). The ledger is append-only — no updates, no deletes.

**Invariants (must hold at all times):**

1. **Conservation of KRMA:** `SUM(all wallet balances) + SUM(all burns) = 100,000,000,000`
2. **Non-negative balances:** No wallet balance may go below zero
3. **Append-only log:** Transactions are never modified or deleted
4. **Atomic execution:** A transaction either fully completes or fully fails — no partial transfers
5. **Causal ordering:** Every transaction has a strictly monotonic sequence number within the global ledger
6. **Referential integrity:** Every `fromWalletId` and `toWalletId` must reference an existing wallet

### 3.2 Transaction Record Schema

Each transaction in the ledger contains:

```
KrmaTransaction {
  id:             String     — Unique identifier (CUID2)
  sequenceNumber: BigInt     — Global monotonic counter (gap-free)
  fromWalletId:   String     — Source wallet
  toWalletId:     String     — Destination wallet
  amount:         BigInt     — Positive integer, in base KRMA units
  state:          Enum       — FLUID | LOCK | UNLOCK | BURN
  reason:         String     — Machine-readable transaction type code
  description:    String     — Human-readable explanation
  metadata:       JSON       — Contextual data (characterId, campaignId, skillId, etc.)
  campaignId:     String?    — Campaign context (if applicable)
  actorId:        String     — User or system identity that initiated
  actorType:      Enum       — USER | SYSTEM | GM | EVALUATOR
  checksum:       String     — Hash of (sequenceNumber + fromWallet + toWallet + amount + previousChecksum)
  createdAt:      DateTime   — Immutable timestamp
}
```

### 3.3 Chain Integrity (Checksum Design)

Each transaction's `checksum` is derived from the previous transaction's checksum, creating a hash chain similar to a blockchain:

```
checksum(N) = SHA-256(
  sequenceNumber(N) ||
  fromWalletId(N) ||
  toWalletId(N) ||
  amount(N) ||
  state(N) ||
  reason(N) ||
  checksum(N-1)
)
```

The genesis transaction (sequence 0 — system initialization) uses a known seed value.

**Purpose:** If any historical transaction is altered, all subsequent checksums become invalid. This provides:
- Tamper detection (not prevention — we're not decentralized)
- Audit verification (recompute the chain to validate integrity)
- Forensic anchoring (any export of the ledger can be verified)

### 3.4 Balance Computation

Wallet balances are **materialized views** derived from the transaction log. They exist for performance but are never authoritative. The transaction log is the source of truth.

```
balance(walletId) = SUM(credits to walletId) - SUM(debits from walletId)
```

**Reconciliation:** A background job periodically recomputes all balances from the transaction log and compares against materialized balances. Any discrepancy triggers an alert and halts transactions until resolved.

### 3.5 Sequence Numbering

The global sequence number ensures total ordering of all KRMA transactions. This is critical for:
- Deterministic replay (rebuild state from log)
- Conflict detection (optimistic concurrency)
- Audit trails (unambiguous ordering)

Implementation: A dedicated `LedgerSequence` singleton record with an atomic increment operation. All transactions acquire their sequence number inside the same database transaction that writes the ledger entry and updates wallet balances.

### 3.6 Idempotency

Every transaction request includes a client-generated `idempotencyKey`. The system rejects duplicate keys, preventing:
- Double-spend from network retries
- Accidental duplicate rewards
- Replay attacks

---

## 4. Transaction Types

### 4.1 Transaction Type Registry

Every transaction has a machine-readable `reason` code. The following types are derived from the repository:

#### Genesis & System Operations

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `GENESIS_SEED` | (none) | Reserve wallet | FLUID | Initial supply allocation at system creation |
| `RESERVE_TRANSFER` | Reserve | Reserve | FLUID | Rebalancing between reserve pools |

#### GM Economy

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `GM_ALLOCATION` | Reserve (Terminal) | GM wallet | FLUID | Periodic KRMA allocation to subscribed GM |
| `CAMPAIGN_FUND` | GM wallet | Campaign wallet | FLUID | GM invests KRMA into a campaign pool |
| `CAMPAIGN_DEFUND` | Campaign wallet | GM wallet | FLUID | GM withdraws unused KRMA from campaign |

#### Character Creation (GM Loans KRMA to Player)

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `CHARACTER_INVEST` | Campaign wallet | Character wallet | LOCK | KRMA locked into character creation (Seed, Root, Branches) |
| `CHARACTER_ADJUST` | Campaign wallet | Character wallet | LOCK | Additional KRMA invested during character refinement |

**Repository authority:**
> "Character Creation: GM loans KRMA to player for character"
> "Player operates with: borrowed KRMA (not truly owned)"
> — Economic Model document

#### Session Play

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `SESSION_REWARD` | Campaign wallet | Player wallet | FLUID | ~3 KRMA per session (GM discretion) |
| `REROLL_COST` | Player wallet | Campaign wallet | FLUID | Death save reroll, critical failure reroll, etc. |
| `SKILL_ADVANCE` | Player wallet | Character wallet | LOCK | KRMA spent advancing a skill level |
| `ATTRIBUTE_ENHANCE` | Player wallet | Character wallet | LOCK | KRMA spent increasing an attribute |
| `WEALTH_CHANGE` | Player wallet | Character wallet | LOCK | KRMA spent/refunded changing WTH levels |
| `RARE_ITEM_ACCESS` | Player wallet | Campaign wallet | FLUID | Purchasing access to rare equipment |
| `STORY_INFLUENCE` | Player wallet | Campaign wallet | FLUID | Spending KRMA for minor story influence |
| `DIVINE_FAVOR` | Player wallet | Campaign wallet | FLUID | Deity-dependent special favor |
| `LANGUAGE_ACQUIRE` | Player wallet | Character wallet | LOCK | Language learning (Easy=3, Moderate=5, Hard=8) |
| `GROUP_CONTRIBUTION` | Player wallet | Campaign wallet | FLUID | Pooled KRMA for group objectives |

#### Death & Reincarnation

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `DEATH_BODY_RETURN` | Character wallet | Campaign wallet | UNLOCK | Body KRMA (Clout/Celerity/Constitution) returns to GM — loan returned |
| `DEATH_SOUL_SPLIT` | Character wallet | (split) | UNLOCK | Soul KRMA (Willpower/Wisdom/Wit): 50% to campaign, 50% to Soul Package |
| `DEATH_SPIRIT_TO_PLAYER` | Character wallet | Player wallet | UNLOCK | Spirit KRMA (Flow/Frequency/Focus): 100% to player Soul Package |
| `DEATH_FREQUENCY_SINK` | Character wallet | Lady Death wallet | UNLOCK | Frequency pool taken by Lady Death |
| `SOUL_PACKAGE_CREATE` | Character wallet | Player wallet | FLUID | Player's Soul Package — first true ownership |
| `REINCARNATION_COST` | Player wallet | Campaign wallet | FLUID | Cost to retrieve and integrate a Soul Package |

**Death split (corrected for Jan 2026 Soul/Spirit name swap):**

The split operates at the **attribute and component level**, not as a simple percentage of total TKV. Each element of the character is routed by its pillar affiliation:

> **Attributes:**
> 1. **Body** (Clout, Celerity, Constitution) → 100% KV returns to GM campaign wallet (loan returned)
> 2. **Soul** (Willpower, Wisdom, Wit — Purple/Mercury) → Halved. 50% KV to GM campaign wallet, 50% retained in Spirit Package
> 3. **Spirit** — Flow and Focus → 100% retained in Spirit Package (player ownership)
> 4. **Frequency** → 100% taken by Lady Death (system sink / founder's fee tax)
>
> **Skills:** Routed by their governing attributes. A purely Spirit-governed skill is retained as-is. A skill governed by mixed pillars (e.g., Clout + Flow) is halved — half the KV goes to the GM, half stays in the Spirit Package.
>
> **Nectars & Thorns:** Each is classified at creation time as either "kept" or "destroyed" on death. Kept ones remain in the Spirit Package with their KV. Destroyed ones have their KV returned to the GM campaign wallet.
>
> **Items:** [TBD — classification system needed, similar to Nectars/Thorns]
>
> *Note: The repository's Economic Model document has these labels inverted due to predating the Jan 2026 name swap to align with Orthodox anthropology (soma/psyche/pneuma).*

#### GRO.vine Rewards

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `GROVINE_NECTAR` | Campaign wallet | Character wallet | LOCK | Nectar bestowed (KV added to character) |
| `GROVINE_NECTAR_DECLINE` | Campaign wallet | Player wallet | FLUID | Player declines nectar for raw KRMA (taxed) |
| `GROVINE_TAX` | (from declined amount) | Campaign wallet | FLUID | Tax withheld on nectar-to-KRMA conversion |
| `THORN_NECTAR_REPLACE` | Character wallet | Player wallet | UNLOCK | Nectar destroyed by Thorn converts to KRMA (taxed) |

**Nectar tax:** The tax rate on Nectar-to-KRMA conversion is determined by the Godhead who authored the Nectar. Each Nectar carries its tax rate as metadata set at creation.

**Nectar KV:** Determined by the Godhead presiding over the GRO.vine, based on the Godhead's personality/domain and the resistance of the GRO.vine. This is a non-deterministic KV assignment graded by the God of Chaos and Balance AI agent at creation time.

**Repository authority:**
> "Option: decline a Nectar and cash it in for raw KRMA (transfers to Frequency), but there's a tax"
> — GROWTH-DESIGN-TRUTH.md §3

#### Harvest Economy

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `HARVEST_REWARD` | Campaign wallet | Character wallet | LOCK | Harvest period advancement rewards |
| `HARVEST_WEALTH` | Campaign wallet | Character wallet | LOCK | Wealth improvement from harvest investment |

#### Burn Transactions

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `KRMA_BURN` | Player wallet | Burn Sink | BURN | Voluntary destruction for extraordinary action |
| `KRMA_BURN_GROUP` | (multiple players) | Burn Sink | BURN | Group burn for campaign-level reality alteration |

#### GRO.vine Resistance/Opportunity (KV Accounting)

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `GROVINE_RESISTANCE` | Campaign wallet | (locked in GRO.vine) | LOCK | GM creates obstacles opposing a character's goal |
| `GROVINE_OPPORTUNITY` | Godhead reserve | (locked in GRO.vine) | LOCK | Divine intervention investment |

#### Attribution Chain (Season 2+)

| Reason Code | From | To | State | Description |
|-------------|------|----|----|-------------|
| `ATTRIBUTION_ROYALTY` | System | Creator wallet | FLUID | Royalty payment through attribution DAG |
| `CONTENT_STAKE` | Player wallet | System | LOCK | Staking KRMA to publish content |

### 4.2 Reroll Cost Escalation Table

From the repository (KRMA_Costs_Table.md):

| Action | 1st Use | 2nd Use | 3rd Use |
|--------|---------|---------|---------|
| Death Save Reroll | 2 KRMA | 5 KRMA | 10 KRMA |
| Critical Failure Reroll | 1 KRMA | 2 KRMA | 4 KRMA |
| Important Check Reroll | Variable | Variable | Variable |

### 4.3 Skill Advancement Cost Table

From the repository (KRMA_Costs_Table.md):

| Skill Level | Cost |
|------------|------|
| Apprentice (d2) | 10 KRMA |
| Novice (d3) | 14 KRMA |
| Student (d4) | 19 KRMA |

### 4.4 Attribute Enhancement Cost Table

| Enhancement | Cost | Limit |
|-------------|------|-------|
| Any Attribute +1 | 25 KRMA | Multiple purchases |
| Any Attribute +2 | 50 KRMA | Once per attribute |

### 4.5 WTH Level Cost Table

From GROWTH-DESIGN-TRUTH.md §3:

| Level | KRMA Cost |
|-------|-----------|
| 1 | -30 KRMA (reduces TKV) |
| 2 | -20 KRMA |
| 3 | -10 KRMA |
| 4 | 0 (baseline) |
| 5 | 0 (baseline) |
| 6 | 10 KRMA |
| 7 | 20 KRMA |
| 8 | 30 KRMA |
| 9 | 40 KRMA |
| 10 | 50 KRMA |

**Note:** Levels below 4 have *negative* cost, meaning they reduce the character's TKV, effectively returning KRMA. This is a design choice: weaker characters are cheaper.

---

## 5. Security Model

### 5.1 Threat Model

| Threat | Actor | Impact | Mitigation |
|--------|-------|--------|------------|
| Unauthorized KRMA creation | Compromised admin | Inflation, devalued economy | Genesis is a one-time event; no "mint" endpoint exists post-genesis |
| Ledger tampering | DB admin, attacker | Corrupted history | Hash chain integrity, periodic full-chain verification |
| Double-spend | Race condition, retry | Phantom KRMA | Idempotency keys, serialized sequence numbers, DB transaction isolation |
| GM self-dealing | Malicious GM | Low risk — GMs can only move KRMA, not create it. Transferring to an alt only depletes their own pool. | GM wallet is the only constraint. KRMA rewards flow through Godhead-authored GRO.vines, not GM discretion. Natural self-limiting. |
| Balance manipulation | Direct DB write | Incorrect balances | Balances are materialized views; reconciliation job detects drift |
| Burn exploitation | Player collusion | Artificial scarcity | Exponential cost scaling, global burn cap enforcement |
| Cross-campaign KRMA laundering | Multi-campaign exploit | Balance inflation | All transfers trace through wallets; no direct campaign-to-campaign transfers |

### 5.2 Authorization Rules

| Action | Who Can Initiate | Approval Required |
|--------|-----------------|-------------------|
| Reserve → GM wallet | System (subscription trigger) | Automatic (subscription-gated) |
| GM wallet → Campaign | GM (wallet owner) | None (self-service) |
| Campaign → Character (creation) | GM | None (within campaign pool) |
| Campaign → Player (session reward) | GM | None (within campaign pool) |
| Player → Character (advancement) | Player | GM approval for some (divine favor, rare items) |
| Character → Campaign (death) | System | Automatic (death event trigger) |
| Character → Player (soul package) | System | Automatic (death event trigger) |
| Any → Burn Sink | Player (voluntary) | GM must witness; system validates burn cap |
| Reserve rebalancing | Godhead only | Requires explicit Godhead action + audit log |

### 5.3 Concurrency Control

All KRMA-mutating operations use **pessimistic locking** within a database transaction:

1. Acquire advisory lock on source wallet
2. Read current balance
3. Validate balance >= amount
4. Acquire advisory lock on destination wallet
5. Write transaction record with next sequence number
6. Update both wallet balances
7. Release locks
8. Commit

If any step fails, the entire transaction rolls back.

### 5.4 Rate Limiting

| Action | Limit | Window | Rationale |
|--------|-------|--------|-----------|
| Session rewards | 10 KRMA | Per session per character | Prevents runaway rewards |
| GM campaign funding | Campaign-specific cap | Per month | Prevents reserve drain |
| Burns | 1 per character per session | Per session | Prevents impulse regret |
| Wallet creation | 1 per user | Lifetime | Sybil prevention |

**Note:** Specific rate limits TBD. GM allocation follows a bell-curve over subscription lifetime (see Deferred Q3).

### 5.5 Integrity Verification

**Continuous:**
- Every transaction validates `balance >= amount` before execution
- Checksum chain is extended with each transaction

**Periodic (reconciliation job):**
- Recompute all wallet balances from transaction log
- Compare against materialized balances
- Verify global invariant: `SUM(balances) + SUM(burns) = 100B`
- Verify checksum chain integrity (recompute from genesis)
- Report discrepancies; halt transactions if critical

**On-demand (audit):**
- Full ledger export with checksum verification
- Balance-at-point-in-time reconstruction (replay log to sequence N)
- Per-wallet transaction history with running balance

---

## 6. Multi-Campaign Balance

### 6.1 The Cross-Campaign Problem

KRMA is universal, but campaigns are isolated narratives. The system must prevent:
- **Inflation:** A permissive GM flooding their campaign with cheap KRMA
- **Exploitation:** Players transferring overvalued characters between campaigns
- **Starvation:** New campaigns unable to compete with established ones

### 6.2 Campaign KRMA Pools

Each campaign operates with a dedicated Campaign wallet, funded by the GM's personal wallet:

```
Reserve (Terminal) → GM Wallet → Campaign Wallet → Character/Player Wallets
```

**Key constraint:** A GM can only invest KRMA they actually have. The GM's wallet balance limits their total campaign spending. This is the primary inflation control.

**Repository authority:**
> "KRMA limits GM power — GM's KRMA pool constrains character creation power. Prevents inflation across the network."
> — CLAUDE.md

### 6.3 GM KRMA Allocation

GMs receive KRMA through their subscription:

**Repository authority:**
> "Only GMs pay subscriptions; players earn through gameplay"
> "Subscription provides monthly KRMA increase"
> "Progressive scale:
>   Months 1-12: Building KRMA stake (customer phase)
>   Months 12-24: Break-even
>   Months 24+: Net earner"
> — Economic Model document

The allocation rate from Terminal reserve to GM wallets is subscription-driven and follows a **bell-curve distribution** over the subscription lifetime. Actual values TBD through testing. This is the system's primary faucet for new KRMA entering circulation.

### 6.4 Character Transfer Between Campaigns

Cross-campaign character movement is primarily handled through **Spirit Packages** (the death/reincarnation cycle):

1. Character dies in Campaign A → death split executes (§4.1 Death & Reincarnation)
2. Player receives Spirit Package KRMA in their **personal wallet** (this is now player-owned, not campaign-locked)
3. Player joins Campaign B → can spend personal KRMA to reincarnate, or start fresh
4. Campaign B's GM invests campaign KRMA into the new character as normal

**Key insight:** Death is the primary cross-campaign transfer mechanism. The player's personal wallet is the bridge — KRMA earned through death becomes truly portable because it is no longer locked in any campaign.

**Future consideration:** Live character transfer between tables may be supported later. This would require a stewardship transfer where the source GM releases the character and the destination GM accepts the KRMA liability from their own pool. Details TBD.

### 6.5 Global Balance Monitoring

System-level metrics to detect economic anomalies:

| Metric | Formula | Alert Threshold |
|--------|---------|----------------|
| Campaign KRMA velocity | KRMA moved per session / campaign age | > 3σ from global mean |
| GM hoarding index | GM wallet balance / total allocated to GM | > 0.9 (sitting on 90%+) |
| Player wealth inequality (per campaign) | Gini coefficient of player wallets | > 0.8 |
| Burn rate | Burns per month globally | Approaching exponential cost wall |
| Reserve depletion rate | Monthly reserve outflow | Projected exhaustion < 5 years |

---

## 7. Audit and Transparency

### 7.1 Audit Capabilities

The system must support three levels of audit:

#### Level 1: Real-Time Monitoring
- Dashboard showing global KRMA metrics (total circulation, burn total, reserve levels)
- Per-campaign economy health indicators
- Transaction stream (filterable by wallet, campaign, type)

#### Level 2: Historical Reconstruction
- Given any wallet ID and any point in time (sequence number or timestamp), reconstruct the exact balance
- Method: Replay all transactions from genesis to target sequence number
- This is computationally expensive but provides absolute certainty

#### Level 3: Full Chain Verification
- Recompute every checksum from genesis
- Verify every balance matches its transaction history
- Verify global supply invariant
- Produce a signed audit report with findings

### 7.2 Audit Log Schema

Separate from the transaction log, an audit log captures all *attempted* operations (including failures):

```
AuditEntry {
  id:          String
  timestamp:   DateTime
  actorId:     String     — Who attempted the action
  actorType:   Enum       — USER | SYSTEM | GM | GODHEAD
  action:      String     — What was attempted
  targetType:  String     — Wallet, Campaign, Character, etc.
  targetId:    String     — ID of the target
  outcome:     Enum       — SUCCESS | DENIED | FAILED | ERROR
  reason:      String     — Why it succeeded or failed
  metadata:    JSON       — Additional context
  ipAddress:   String?    — For user-initiated actions
}
```

### 7.3 Reversibility

KRMA transactions are **irreversible by design**. To "undo" a transaction, a new compensating transaction must be created:

- Original: Wallet A → Wallet B, 50 KRMA, reason: `SKILL_ADVANCE`
- Correction: Wallet B → Wallet A, 50 KRMA, reason: `CORRECTION`, metadata: `{ corrects: "original_tx_id" }`

This preserves the complete history while allowing corrections. The correction transaction is linked to the original via metadata.

**Godhead authority:** Correction transactions from reserve wallets require Godhead authorization. There are multiple Godheads organized within the three pillars at different ranks. Reserve operations (Mercy, Balance, Severity) are governed by the Godheads affiliated with those domains, primarily through GRO.vine mechanics. Multi-signature requirements will apply for large reserve transfers (threshold TBD).

### 7.4 AI Analysis Interface

Future AI systems (Oracle, Godhead AI) will need read access to KRMA data:

- **Read-only query interface** over the transaction log
- **Aggregate statistics** endpoint (campaign health, player progression curves)
- **Anomaly detection** feed (suspicious patterns flagged for human review)
- **No write access** — AI systems cannot initiate KRMA transactions directly

---

## 8. System Interfaces

### 8.1 Interface Map

The KRMA system interacts with the following subsystems. Each interface is defined by what it can request and what KRMA operations it triggers.

```
┌─────────────────────────────────────────────────────────┐
│                     KRMA LEDGER                         │
│  (append-only transaction log + materialized balances)  │
└──────────┬──────────┬──────────┬──────────┬─────────────┘
           │          │          │          │
     ┌─────▼──┐  ┌────▼───┐  ┌──▼────┐  ┌─▼──────────┐
     │Character│  │Campaign│  │Session│  │Attribution  │
     │Creation │  │Manager │  │Engine │  │Chain (S2+)  │
     └────┬────┘  └────┬───┘  └───┬───┘  └─────┬──────┘
          │            │          │              │
     ┌────▼────┐  ┌────▼───┐  ┌──▼─────┐  ┌────▼─────┐
     │Death &  │  │GRO.vine│  │Harvest │  │Content   │
     │Reincarn.│  │System  │  │System  │  │Publish   │
     └─────────┘  └────────┘  └────────┘  └──────────┘
```

### 8.2 Character Creation Interface

**Caller:** Campaign service (on GM approval of character)
**KRMA operations:**
1. Calculate TKV from character sheet (deterministic evaluator)
2. Validate campaign wallet has sufficient balance
3. Execute `CHARACTER_INVEST` transaction: Campaign wallet → Character wallet
4. Record KV breakdown in transaction metadata

**Inputs:** characterId, campaignId, characterSheet (for TKV calculation)
**Outputs:** transactionId, new campaign wallet balance, character TKV

### 8.3 Character Death Interface

**Caller:** Session engine (on confirmed character death)
**KRMA operations (atomic batch — component-level decomposition):**

1. **Body attributes** (Clout, Celerity, Constitution) — calculate KV per attribute → `DEATH_BODY_RETURN` 100% to campaign wallet
2. **Soul attributes** (Willpower, Wisdom, Wit) — calculate KV per attribute, halve each → `DEATH_SOUL_SPLIT` 50% to campaign, 50% to player
3. **Spirit attributes** (Flow, Focus) — calculate KV → `DEATH_SPIRIT_TO_PLAYER` 100% to player wallet
4. **Frequency** — calculate KV → `DEATH_FREQUENCY_SINK` 100% to Lady Death wallet
5. **Skills** — for each skill, determine governing attributes, calculate split ratio by pillar affiliation:
   - Purely Spirit-governed → 100% retained (player)
   - Purely Body-governed → 100% to campaign
   - Mixed (e.g., Clout + Flow) → halved (50% campaign, 50% player)
6. **Nectars & Thorns** — check death classification on each:
   - "Kept" → retained in Spirit Package (player)
   - "Destroyed" → KV returned to campaign wallet
7. **Aggregate** → `SOUL_PACKAGE_CREATE` bundles all player-retained components
8. **Zero out** character wallet — verify all KV accounted for

**Inputs:** characterId, campaignId, deathContext
**Outputs:** transactionIds[], spirit package manifest (itemized components), campaign wallet delta, Lady Death intake

### 8.4 Session Reward Interface

**Caller:** GM (via Watcher Console)
**KRMA operations:**
1. Validate campaign wallet has sufficient balance
2. Execute `SESSION_REWARD` transaction: Campaign wallet → Player wallet
3. Rate-limit validation (~3 KRMA per session default, max 10)

**Inputs:** playerId, campaignId, amount, reason description
**Outputs:** transactionId, new player wallet balance

### 8.5 Advancement Interface

**Caller:** Player (via Trailblazer Portal) with GM approval for some actions
**KRMA operations:**
1. Validate player wallet has sufficient balance
2. Validate advancement is legal (skill level prerequisites, attribute limits)
3. Execute appropriate transaction type (SKILL_ADVANCE, ATTRIBUTE_ENHANCE, etc.)
4. Recalculate character TKV

**Inputs:** characterId, advancementType, advancementDetails
**Outputs:** transactionId, new player wallet balance, new character TKV

### 8.6 GRO.vine Reward Interface

**Caller:** Session engine (on GRO.vine completion/failure)
**KRMA operations (for completion):**
- If player accepts Nectar: `GROVINE_NECTAR` (Campaign → Character, LOCK)
- If player declines Nectar: `GROVINE_NECTAR_DECLINE` (Campaign → Player, FLUID) minus `GROVINE_TAX`

**Inputs:** grovineId, characterId, campaignId, rewardChoice (nectar|krma)
**Outputs:** transactionId(s), nectar or KRMA amount

### 8.7 Burn Interface

**Caller:** Player (with GM witness)
**KRMA operations:**
1. Validate global burn cap not reached
2. Calculate cost with exponential scaling
3. Execute `KRMA_BURN`: Player wallet → Burn Sink
4. Record burn "scar" in metadata

**Inputs:** playerId, amount, narrativeDescription, gmWitnessId
**Outputs:** transactionId, global burn total, remaining burn capacity

### 8.8 Campaign Economy Interface

**Caller:** GM (campaign management)
**KRMA operations:**
- `CAMPAIGN_FUND`: GM wallet → Campaign wallet
- `CAMPAIGN_DEFUND`: Campaign wallet → GM wallet (unused portion only)
- Campaign balance queries
- Campaign transaction history

**Inputs:** campaignId, gmUserId, amount, direction (fund/defund)
**Outputs:** transactionId, new campaign balance, new GM wallet balance

### 8.9 Wallet Query Interface (Read-Only)

**Caller:** Any authenticated user (scoped to their access level)
**Available queries:**
- Own wallet balance
- Own transaction history (paginated, filterable)
- Campaign balance (GMs only, for their campaigns)
- Global metrics (Godhead only)
- Balance-at-time reconstruction (audit only)

---

## 9. Existing Infrastructure

### 9.1 What's Already Built

| Component | Location | Status |
|-----------|----------|--------|
| Wallet model | `prisma/schema.prisma:90-97` | Schema defined, migration applied |
| KrmaTransaction model | `prisma/schema.prisma:99-106` | Schema defined, migration applied |
| User→Wallet relation | `prisma/schema.prisma:19` | Schema defined |
| TKV on GrowthCharacter | `types/growth.ts:281` | Type defined, optional field |
| GrowthLevels (WTH) | `types/growth.ts:57-64` | Type defined with cost comments |
| GROvine reward type | `types/growth.ts:176` | `'nectar' | 'krma'` enum |
| HarvestCard krmaChange | `components/canvas/HarvestCard.tsx:11` | UI displays KRMA changes |
| CharacterSheet TKV display | `components/character/CharacterSheet.tsx:62` | UI renders TKV |
| CharacterBuilder WTH costs | `components/character/CharacterBuilder.tsx:245` | UI documents costs |
| KRMA Line (canvas) | `components/canvas/RelationsCanvas.tsx:1064-1248` | Visual element rendered |
| CSS variables | `app/globals.css:21,41` | `--krma-gold: #FFCC78` |
| PLAN.md Phase 4 | `PLAN.md:241-250` | Planned, not started |

### 9.2 Schema Changes Required

The current Prisma schema needs expansion to support this architecture:

**Wallet model changes:**
- Add `walletType` enum: `USER | RESERVE | CAMPAIGN | CHARACTER | BURN | LADY_DEATH`
- Add `campaignId` (optional, for campaign wallets)
- Add `characterId` (optional, for character wallets)
- Keep `@unique` constraint on `ownerId` (confirmed: one wallet per user). Campaign/character wallets use separate foreign keys.
- Add `frozen` boolean (for administrative holds)

**KrmaTransaction model changes:**
- Add `sequenceNumber` (BigInt, unique, auto-increment)
- Add `state` enum: `FLUID | LOCK | UNLOCK | BURN`
- Add `description` (String)
- Add `metadata` (JSON)
- Add `campaignId` (optional String)
- Add `actorId` (String)
- Add `actorType` enum: `USER | SYSTEM | GM | EVALUATOR | GODHEAD`
- Add `checksum` (String)
- Add `idempotencyKey` (String, unique)
- Add index on `fromWalletId`, `toWalletId`, `campaignId`, `createdAt`

**New models needed:**
- `BurnLedger` — singleton tracking global burn total and cap
- `LedgerSequence` — singleton for atomic sequence number generation
- `AuditEntry` — separate audit log table

### 9.3 New Service Layer

```
services/
  krma/
    ledger.ts          — Core ledger operations (create transaction, verify chain)
    wallet.ts          — Wallet CRUD, balance queries, reconciliation
    evaluator.ts       — TKV calculation (deterministic, versioned)
    burn.ts            — Burn operations with cap enforcement
    reconciliation.ts  — Periodic balance verification
    types.ts           — KRMA-specific types, transaction reason codes
```

### 9.4 New API Routes

```
api/
  krma/
    wallets/
      [id]/
        route.ts         — GET wallet balance + history
        transactions/
          route.ts       — GET paginated transaction history
    campaigns/
      [id]/
        fund/route.ts    — POST fund campaign from GM wallet
        balance/route.ts — GET campaign KRMA balance
    transactions/
      route.ts           — POST create transaction (internal use)
    burn/
      route.ts           — POST burn KRMA
      status/route.ts    — GET global burn status
    audit/
      verify/route.ts    — POST trigger chain verification (Godhead only)
      report/route.ts    — GET latest audit report (Godhead only)
    metrics/
      route.ts           — GET global KRMA metrics (Godhead only)
```

---

## 10. Required Clarification Questions

The following questions must be answered before implementation can begin. The repository and design truth documents do not provide sufficient guidance on these points.

### Supply & Distribution

### Resolved Questions

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Supply distribution | All 100B in four reserve wallets at genesis (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%). Godhead/GM distribution decided before live. |
| Q4 | Character transfer between campaigns | Primarily through Spirit Packages (death → player wallet → reincarnate elsewhere). Live character transfer may come later. |
| Q5 | Multiple wallets per user? | No. One personal wallet per user. Campaigns have separate wallets funded by GM's personal wallet. |
| Q6 | Death split formula | Component-level: Body 100% → GM. Soul halved (50% GM, 50% player). Spirit (Flow/Focus) 100% → player. Frequency → Lady Death. Skills split by governing attributes. Nectars/Thorns kept or destroyed per classification. |
| Q7 | Soul Package value | Includes all retained components: Spirit attributes, 50% Soul attributes, Spirit-governed skills (full), mixed-governed skills (halved), kept Nectars/Thorns. |
| Q8 | Nectar-to-KRMA tax rate | Determined by the Godhead who authored the Nectar. Set at creation time. |
| Q9 | Nectar KV determination | Determined by the presiding Godhead based on their personality/domain and GRO.vine resistance. Graded by God of Chaos and Balance. |
| Q12 | GM transfer between own campaigns | Yes — liquid (fluid) KRMA can be transferred between campaigns via GM personal wallet. |
| Q14 | GM-to-player collusion | Non-issue by design. GMs cannot create KRMA, only move it. KRMA rewards flow through Godhead-authored GRO.vines, not GM discretion. Moving KRMA to an alt only depletes the GM's own pool. |
| Q15 | Campaign-level KRMA caps | No campaign caps. GM's personal wallet balance is the only constraint. |
| Q16 | Reserve wallet authorization | Multiple Godheads exist, organized within three pillars at different ranks. Multi-signature required for large reserve operations (threshold TBD). |
| Q17 | Mercy/Balance/Severity reserve flow | Governed by Godheads affiliated with each domain. Flow is primarily determined through GRO.vine mechanics. |
| Q20 | Attribution chain in initial scope? | Not required initially. No architectural reason it can't be added later — the ledger's transaction type registry is extensible, and new reason codes + metadata fields can be added without schema changes to the core transaction model. |

### Deferred Questions (TBD Through Testing / Future Design)

| # | Question | Current Direction | Needed Before |
|---|----------|-------------------|---------------|
| Q2 | Burn cost scaling function | Exponential; exact formula TBD through testing | Burn feature implementation |
| Q3 | GM subscription KRMA allocation amounts | Bell-curve distribution over subscription lifetime; values TBD | Subscription system implementation |
| Q10 | Minimum campaign KRMA reserve | Most likely yes; amount TBD | Campaign wallet implementation |
| Q11 | Campaign end KRMA handling | Most KRMA returns to GM wallet (likely with a small meta-maintenance fee). Players retain their share. Possible live character transfer to unsteward from GM. | Campaign archival feature |
| Q13 | Subscription KRMA scaling formula | Bell-curve; actual monthly amounts TBD through testing | Subscription system implementation |
| Q18 | Deterministic KV values | Likely: 1 KV per attribute level, 1 KV per skill level, 2 KV per magic skill level. Subject to change. | Character creation KRMA costing |
| Q19 | Evaluator version migration | Deterministic track: probably solidified and permanent. Non-deterministic: re-grading may happen; TBD. | KV evaluator versioning system |

---

## Appendix A: Repository Source Files Referenced

| File | Content |
|------|---------|
| `GRO.WTH Repository/06_META_SYSTEMS/KRMA_System.md` | Core KRMA definition, earning rates, death mechanics |
| `GRO.WTH Repository/07_REFERENCE_TABLES/KRMA_Costs_Table.md` | Full cost tables (rerolls, skills, attributes, items, death) |
| `GRO.WTH Repository/X_ARCHIVE_ORIGINS/GRO.WTH Economic System & KRMA Attribution Model.md` | Hidden economic framework, incubator model, seasonal reveals |
| `GRO.WTH Repository/06_META_SYSTEMS/Soul_Package_System.md` | Soul Package persistence, reincarnation costs |
| `GRO.WTH Repository/06_META_SYSTEMS/Lady_Death_Protocols.md` | Death process, Frequency sink, succession mechanic |
| `GRO.WTH Repository/06_META_SYSTEMS/Godheads_System.md` | Godhead KRMA authority |
| `GRO.WTH Repository/01_CORE_RULES/Wealth_Level_System.md` | Wealth checks, KRMA-wealth integration |
| `GRO.WTH Repository/01_CORE_RULES/GROvine_System.md` | KV costs for resistance/opportunity |
| `GRO.WTH Repository/02_CHARACTER_CREATION/Nectars_and_Thorns_System.md` | Nectar conversion, tax mechanics |
| `GRO.WTH Repository/02_CHARACTER_CREATION/Harvests_System.md` | Downtime rewards |
| `GRO.WTH Repository/02_CHARACTER_CREATION/Character_Approval_Process.md` | TKV definition |
| `GRO.WTH Repository/08_APP_DEVELOPMENT/Attribution_Chain_Technical_Implementation.md` | Attribution DAG, royalty splits, anti-spam |
| `GROWTH-DESIGN-TRUTH.md` | Canonical design reference (§3, §5, §8, §13, §14, §15, §19) |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **KRMA** | Karma — the universal meta-currency of GRO.WTH |
| **KV** | Karma Value — system-calculated power rating of a creation |
| **TKV** | Total Karmic Value — sum of all KV components in a character |
| **Fluid KRMA** | Available for spending in a wallet |
| **Locked KRMA** | Bound into a creation (character, item, etc.) |
| **Burned KRMA** | Permanently destroyed, removed from supply |
| **Soul Package** | Persistent character essence that survives death, carrying KRMA ownership |
| **Frequency** | Character attribute representing pure potential energy / advancement currency |
| **Nectar** | Permanent positive ability from completing a GRO.vine |
| **Thorn** | Permanent negative effect from failed GRO.vine or death |
| **Blossom** | Temporary buff bestowed by Godheads during play |
| **GRO.vine** | Narrative thread with Goal/Resistance/Opportunity structure |
| **Godhead** | Divine authority in the game; also platform governance role |
| **Watcher** | Game Master (GM) |
| **Trailblazer** | Player character |
| **Lady Death** | System entity that collects Frequency from dead characters |
| **Attribution DAG** | Directed Acyclic Graph tracking creative influence for royalty distribution |
