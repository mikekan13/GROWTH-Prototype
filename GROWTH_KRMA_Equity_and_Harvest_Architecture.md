# GROWTH — KRMA, Equity & Harvest Architecture

**Status:** Canonical (money model) + flagged open decisions
**Authority:** Michael's vision is authoritative. Where this doc conflicts with older repo files, this doc wins and the repo should be corrected to match.
**Audience:** Claude Code (implementing agent), Michael, counsel.
**Not legal advice.** Anything touching real-world ownership, payouts, or "real value" requires a securities attorney before it ships or is marketed. Flags marked ⚖️ are hard stops for counsel.

> **⚠️ SUPERSEDED FRAME (updated):** The original architecture of this doc led with the *equity/ownership* model (KRMA → Harvest → real shares). After further work, the **primary operating model is now the BOOTH-RENTAL / GIG model** described in §0.1 below. Ownership/equity is **demoted to an advanced, opt-in, far-future graduation layer** — NOT the day-one mechanism. The equity sections (§1–§7) are preserved as the *advanced layer* spec; read §0.1 first, and treat everything about Harvest/Reg A+/securities as the *later* layer, not the foundation.

---

## 0.1 THE PRIMARY MODEL — Booth Rental / Gig (lead with this)

**GROWTH is the salon. The GM rents the chair.**

- The **GM rents the chair** = the monthly **subscription**. It buys *workspace*: the platform, the AI (his personal Jewel), the rules engine, the audience, the marketplace, the infrastructure. Not permission — *rent for a place to work.*
- The GM **runs his own book of business** inside that space: his table, his campaign, his created content (Nectars, items, mechanics, modules).
- **KRMA is the unified gauge of contribution** — the meter. GMs accrue it via subscription-exchange and via the **flow**: author something, it costs a little KRMA to create; when others *use* it, KRMA flows *to you.* Your balance = your share of all contribution to GROWTH.
- **Payout is gig-style:** a monthly amount based on your **current KRMA balance.** This is *pay-for-contribution,* not return-on-ownership — the **Lyft / Roblox / YouTube / booth-rental** model. That keeps it **out of securities law entirely**, because nobody's being sold a stake; they're being paid for what their chair earned.
- **The GM is the payee tier.** Trailblazers operate under their GM's **stewardship** (not GROWTH's direct payroll) until **soul-package events** (character death → permanent owned KRMA) change their standing. This keeps the payee population manageable and makes GROWTH look like a normal creator platform paying its creators — a solved legal/tax pattern.

**Why booth-rental specifically (not just "gig"):** booth renters are *unambiguously independent operators* — the salon rents space, it doesn't direct the work — so this sits on the **safe side of the worker-classification line** that Uber/Lyft are currently bleeding over. It also resolves the old "why do I pay AND generate value?" awkwardness: the subscription **is the chair rent.** Pay rent, run your business, keep your earnings. Graspable for marketing, recognizable to a lawyer, cheap to set up.

**Payout mechanism (simple):** each period, ask two numbers — *how much did GROWTH make?* and *where does the KRMA sit?* — and distribute across KRMA proportions. Your 15,000 KRMA is X% of all KRMA → X% of the distributable pool → cashes out to $Y.

**The real legal question shifts** from "is this securities?" (booth-rental routes around it) to **"are my GMs contractors, and how do I write the terms so they clearly are?"** ⚖️ Known question, known answers — but a lawyer must set the contractor structure up cleanly *from the start* (fixing later is expensive).

**One ledger, two kinds of payout (the law splits at the cash-out, not at the gauge):**
1. **Usage/contribution payout** (KRMA earned because your creation was used, or you ran your table) → *income.* Free, continuous, day-one. Booth-rental/gig. **No securities.**
2. **Profit-share-by-stake payout** (KRMA paying you a slice of total company profit *because you hold KRMA as ownership*) → *security.* This is the advanced equity layer (§1–§7), Harvest-gated, counsel-required. **Demoted to far-future opt-in.**

> **Bottom line:** Run the booth-rental/gig economy as the operating heart **now** (legal, simple, live). Treat ownership/equity as the **advanced graduation layer** for later — ownership is the deep end, not the front door. (Which is on-thesis: you earn up the stewardship tiers; ownership is the graduation, not the entry.)

---

## 1. [ADVANCED LAYER] The Equity Split (far-future ownership, counsel-gated)

*Everything from here down (§1–§7) is the ADVANCED ownership layer — not the day-one model. Build §0.1 first.*

The architectural decision for the ownership layer: **KRMA the game resource and KRMA the security are two layers that look like one.**

### Layer 1 — KRMA: the game ledger (live, no legal weight)
- Pure in-game resource. Flows in real time. Infinitely tunable for balance.
- Carries **zero** securities-law weight on its own.
- Is the authoritative record of *creative contribution* — who made what, who influenced whom (the Attribution DAG), who played and enhanced the system.
- Existing canon states (keep): KRMA is **influence mass bound into creations**, not currency spent. KV ("Karmic Value") is *footprint / consequence*, the universal power/value metric — distinct from KRMA the resource.
- KRMA states remain as written: **Fluid** (available to create), **Locked** (bound into creations), **Soul Package** (permanent player ownership after character death).

### Layer 2 — Equity: the real ownership (settled periodically, fully compliant)
- A real security. Represents a slice of the actual company.
- Issued **only** through a compliant vehicle (see §4), only at a Harvest, only to people who clear the required checks.
- Allocation is **driven by** the Layer 1 ledger but is not the same object as in-game KRMA.

### The Bridge (the part you "turn on later")
- The link "your KRMA standing → your equity allocation" is a switch, not an always-on wire.
- It can stay dormant at launch (the model was always meant to be discovered, not announced) and activate when the company chooses and counsel clears it.
- **Why live real-time ownership is impossible:** every transfer of a security is a regulated transaction. Live KRMA-as-ownership would mean continuous public trading of equity among unverified players — legally an unregistered securities exchange *plus* a fresh issuance on every tick. No company can carry that. The Harvest exists precisely to make the live *feel* legal.

---

## 2. The Two Gears: Stake vs Payout

Keep these named separately. Same drivetrain, two gears.

1. **The Stake** — at Harvest, KRMA standing converts to an **ownership %** of the company. (How much of GROWTH is yours.)
2. **The Payout** — that ownership then entitles you to a **share of distributed profit**. (What that ownership pays you.)

`KRMA  →  (Harvest)  →  Stake (% ownership)  →  Payout (profit share from the river)`

⚖️ Profit flowing to people *because they hold a stake* is the single fact that most firmly makes the stake a real security. This is not a problem — it **confirms** the Harvest architecture. Instinct and law point the same way.

---

## 3. Where the Money Comes From (the river)

**Subscriptions = survival, not the play.**
- Only **GMs (Watchers)** pay subscriptions. Players play free. (Existing canon — keep.)
- Subscriptions cover AI + server costs + small margin. This keeps the lights on; it is **not** the thing distributed.

**The river = everything around the game.**
- The D&D truth: the box of dice is the least of the money. The real revenue is licensing, merch, media/IP, ads, the creator economy, and the session-to-media pipeline already described in the economic origin docs.
- **The move:** the river does not pool at the top. It flows back through the company to wherever KRMA sits, paid out at Harvest in proportion to stake. Every holder gets a cut of what the whole machine earns.
- This is the line that makes it new: **you are not a customer, you are an owner/contributor, and you are paid for building the thing.**

---

## 4. Legal Vehicles (US, current as of Jan 2026 — confirm with counsel)

⚖️ Format does not matter. The SEC's Jan 2026 guidance is explicit: tokenizing a security changes the plumbing, not the law. A token representing company ownership is an equity security, period. There is no blockchain loophole.

**Vehicles that fit "the masses":**

| Vehicle | Cap (12 mo) | Who can hold | Burden | Role in GROWTH |
|---|---|---|---|---|
| **Reg CF** | ~$5M | Public (accredited + non-accredited) | Registered funding portal, Form C, annual reports | Smaller **early door** |
| **Reg A+ Tier 2** | ~$75M (SEC weighing a raise toward $100M) | Public, **no income/net-worth gates** | SEC qualification (Form 1-A), audited financials, ongoing reporting | **Scales to a real player-ownership program** |
| Reg D | n/a | Accredited only | Light | ❌ Does not fit the masses — skip |

**Likely shape:** live KRMA ledger → periodic Harvest → equity via **Reg A+** once there's enough value to justify the compliance cost, with **Reg CF** as the smaller early on-ramp.

⚖️ **The "give vs sell" catch.** These exemptions are built for *selling* equity (raising money). *Giving* equity to people for "being creative" is a **distribution / compensation event** — it triggers an exemption requirement **and** a tax bill for whoever receives it. "Free shares for playing" is neither free nor simple. The structure (purchase right? earned allocation? airdrop?) must be designed by counsel, and the marketing wording matters because regulators read "you're already earning" literally.

**Tailwind:** the regulatory weather is moving toward GROWTH, not away — the SEC is preparing an "innovation exemption" and major exchanges are switching on tokenized-equity rails through 2026. Strategy: **build the ledger now; wrap it in compliant equity when the rails mature.**

---

## 5. The Harvest (settlement + lore are the same event)

The periodic settlement *is* a **Harvest** — and "Harvest" is already a canon term in the GROvine system (goals may be abandoned during Harvests). Proposal: these are the **same beat**. Crops (KRMA, goals, contribution) grow live all season; the season turns; you reap.

At a Harvest:
- Goal/GROvine resolution and abandonment (existing canon).
- Ledger read → Stake allocation (new — the equity gear).
- **Etherling** grades the season's karma → she is the natural owner of the Harvest audit/compliance step.

**Cadence is a feel-vs-cost tradeoff** (see Open Decisions):
- Annual = cheapest, one compliance event/year.
- Seasonal/quarterly = more alive, ~4× overhead.
- More frequent = more "live," more expensive.

---

## 6. The Pantheon *is* the Org Chart

The Godheads are not just lore; they map 1:1 to company functions. Incorporate this — it's already built.

| Godhead | Company function |
|---|---|
| **Val** (god of progress) | R&D / product |
| **Jewel** (interface AI) | Marketing / interface / recruitment |
| **Etherling** (grades all karma) | Accounting & compliance — runs the Harvest audit |
| **Tara / Lady Death** (handles deaths) | Exits / liquidity — death → KRMA transfer = a stake leaving the cap table |
| **Selva** (custodian of the Terminal) | Operations / custody |

The company you must legally incorporate and the cosmology already written are one structure.

---

## 7. Character Death = Equity Graduation (existing canon, carry forward)

Death splits KRMA (from the economic origin doc — keep, but see discrepancy D3):
- **Body KRMA** → returns to GM (loan repaid).
- **Spirit KRMA** → 50% GM / 50% Soul Package.
- **Soul Package** → player's **first TRUE ownership** (the first KRMA a player really owns).
- **Frequency Pool** → Lady Death / Tara.

"Death is not failure — it's equity graduation." Soul Packages are persistent IP that can earn royalties via the Attribution DAG.

---

## 8. Open Decisions (NEEDS-MIKE / NEEDS-COUNSEL)

- **OPEN — Harvest cadence:** annual vs seasonal/quarterly vs as-frequent-as-feasible. *(Michael to pick; counsel to confirm feasibility.)*
- **OPEN ⚖️ — Equity vehicle:** Reg CF early vs straight to Reg A+. Counsel decides based on scale/budget.
- **OPEN ⚖️ — Give-vs-sell structure:** how a holder legally *acquires* the stake (earned allocation, purchase right, airdrop). Counsel.
- **OPEN — Bridge activation timing:** when the KRMA→equity switch turns on, and how/whether it's revealed (ties to the existing Seasonal Reveal structure).

## 9. Discrepancies Flagged Against Existing Repo Files

- **D1 — "Harvest" term overlap:** GROvine docs use Harvest for goal abandonment. This doc proposes Harvest = the unified settlement beat (goals + equity). **Confirm merge** before correcting repo.
- **D2 — Subscription curve:** Economic origin doc says months 1–12 build / 12–24 break-even / 24+ net earner. Other notes describe a bell curve peaking ~month 12, steady state from ~month 36. **These differ — reconcile to one beta curve.**
- **D3 — Lady Death: sink vs transfer:** Archive calls the Frequency Pool a "system sink (prevents inflation)" — i.e. burn-like. Michael's current canon: Tara **receives a transfer, not a burn**; BURN is a separate deflationary token-removal mechanic. **Current canon (transfer) wins; repo to be corrected.**
- **D4 — Lady Death = founder / regicide endgame:** Archive frames Lady Death as the founder's bound exit, with a community "kill Lady Death to inherit the platform" succession puzzle. **Status of this as live canon is OPEN** — do not assert until Michael confirms.

---

## 10. One-Line Summary for Implementing Agents

Build **two layers**: (1) a live, tunable KRMA/KV game ledger with full Attribution DAG, carrying no legal weight; (2) a dormant equity-settlement layer ("Harvest") that reads the ledger and, once switched on and cleared by counsel, allocates real ownership via Reg CF/Reg A+ and distributes profit by stake. Do not wire real ownership into live KRMA flow. Keep the bridge a switch.
