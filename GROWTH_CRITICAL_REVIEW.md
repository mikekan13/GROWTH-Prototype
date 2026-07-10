# GROWTH — Critical Review (Full-Picture Analysis)

**Date:** 2026-07-10 · **By:** Fable, at Mike's request: "analyze it and be critical... economy, technical, rules... anything I may have not considered."
**Scope:** Everything in context — 112 extracted invariants, all doctrine docs, rules digests (70 repo files), current-state audit, narrative map, NEEDS-MIKE ledger.
**Note:** Mike has flagged that most numbers are guesstimates pending balancing. Findings below therefore focus on *structural* issues — places where a mechanism is missing, contradicts another mechanism, or produces a bad equilibrium regardless of tuning — plus technical and legal exposure. Severity: 🔴 structural / launch-blocking · 🟡 needs a ruling or design pass · 🟢 note/observation.

---

## A. ECONOMY — Structural

### A1. 🔴 The self-balancing-toward-newcomers property has no mechanism
`GROWTH_Economy_Closeout` declares as canon: *"The system flows MORE KRMA toward newcomers/deficits to catch them up"* and derives the 10-year dispersal endgame from it. But no rule anywhere implements it. The drip is **fixed per GM** (same 15k lump + curve for everyone), and the payout is **proportional to KRMA balance** — which is the *opposite* mechanism: early accumulators compound. As written, the economy trends toward concentration, and the canonical endgame (100B dispersed roughly equally) will not emerge from the mechanics that exist.
**Possible resolution (see A2):** Lady Death's wallet is the natural funding source for a newcomer-subsidy flow — solving A1 and A2 with one mechanism.

### A2. 🔴 Lady Death has inflow rules but no outflow rules — she is a de-facto sink
Canon says she is a *"circulation node (receives → returns → distributes), a heart-valve, not a drain"* and that KRMA *"always flows"* (Economy Closeout, correcting the old sink framing). Inflows are fully specified (max-Frequency KRMA + half-Soul KRMA on every death; INV-36/37). **Outflows are specified nowhere.** Without a distribution mechanic, her wallet monotonically absorbs supply and the "~25%+ of total supply" she holds becomes a slow-motion freeze of the economy — exactly the sink behavior the canon correction rejected.
**Needs:** a ruling on what Lady Death's wallet *funds* (resurrection costs? harvest subsidies? newcomer catch-up flow per A1? Spirit-economy income for ghosts?).

### A3. 🟡 Payout-on-balance vs. spend-to-play — the incentive fight
The booth-rental payout is *"a monthly amount based on your current KRMA balance"* (KRMA_Equity §0.1). If "balance" means liquid KRMA, then every in-game act that moves KRMA (investing in characters, granting harvests, burning) reduces the GM's real-world income — the rational GM hoards, while the entire design philosophy punishes hoarding. If "balance" means liquid+locked (wallet-as-capacity, INV-16), the tension mostly dissolves.
**Needs one explicit ruling:** payout basis = liquid only, or liquid + crystallized/locked? (Recommend liquid+locked; it aligns income with total contribution rather than with restraint.)

### A4. 🟡 Death is economically farmable by players
Death = graduation: the player *keeps* the Spirit Package KRMA outright, forever (Economy Closeout). The GM's original investment partially flows to the player on death (Spirit + half Soul). Mechanically that creates a strategy: make cheap characters, die efficiently, accumulate permanently-owned KRMA — a slow siphon from GM wallets to player wallets, optimized by dying *young* (before fated-age Thorns and decline tax erode value). GM fiat and Lady Death's cut damp this, but the incentive gradient exists and should be checked in a balance sim before real money attaches to it.
**Also related:** ghosts have 0 max Frequency with no rebuild path (already in NEEDS-MIKE as future) and resurrection mechanics (cost, payer, body re-funding) are unspecified — both are holes the farm loop or its fix will run through.

### A5. 🟡 Burn's two limiters are redundant — one will never fire
Burn cost scales as `base × (1 + burnSinkBalance/50,000)` AND there's a global 5B burn cap. With that scaling, cost hits ~100,000× base long before 5B is burned; the cap is asymptotically unreachable. Either the divisor is meant to be much larger (so the cap is reachable) or the cap is decorative. Pure balancing math, but worth deciding which limiter is the *real* one.

### A6. 🟡 GM wallet ceiling doesn't currently bind
15k lump + up to 10k/mo vs. starting-character TKV ≈ 180–200 KRMA: a new GM can afford ~75 starting characters immediately. If the wallet is meant to *constrain GM power* (INV-16's purpose, "KRMA limits GM power" in CLAUDE.md), current numbers make the constraint non-binding for any normal table. Guesstimate territory — but flagging because the *constraint story* is core to the anti-inflation design.

### A7. 🟡 Harvest floor + timescale override = forced-cost interaction
Harvest minimum = years-aged × age-KV rate (INV-11), and Locations/campaigns can override timescales (INV-64). A narrative 100-year time-skip *obligates* the GM to a large minimum reward spend from their own wallet. Self-limiting (it's the GM's money) but it punishes a legitimate narrative move and may surprise GMs. Consider: floor computed on *played* time vs *narrated* time, or an explicit time-skip carve-out.

### A8. 🟢 GM cancellation / abandonment is unhandled
CANCELED preserves the wallet (INV-17) — but nothing specifies what happens to a live campaign, its invested characters, and players' pending Spirit Packages when a GM quits or lapses. Needs a custody/wind-down rule before real users hit it.

---

## B. RULES — Gaps & Contradictions

### B1. 🔴 Advancement spends max Frequency toward the death trigger — confirm the loop closes
Spend = *permanent Max reduction*, and Spend is the advancement currency (INV-43); Frequency=0 fires Lady Death. So growth literally spends life-force — clearly intentional theology (death-as-graduation). But I cannot find the *replenishment* rule: does anything restore **max** Frequency capacity (session rewards? harvest packages? KRMA→capacity conversion at 1:1 per INV-22)? If yes, the loop closes and advancement is a flow decision. If no, every character is on a fixed fuse measured in advancement, which changes the entire pacing math.
**This is my one true rules question for you: can max Frequency capacity be rebuilt in life, and at what rate?**

### B2. 🟡 The 48-seed CSV catalog is live in the wizard but is non-canon content
`seed-catalog.ts` was built from the 48 paper-version CSV seeds (wizard Session A). M9 canon: the CSV seeds are *"NOT BALANCED for current digital canon — inspiration only, not import targets."* Today the wizard can serve unbalanced paper seeds as if they were content. Refactor: the catalog must serve only Forge-published seeds (currently Human + Altered Human).

### B3. 🟡 Repository rules corpus is ~65/70 stale against settled canon
The rules sweep flagged pre-swap Soul/Spirit labels across Branches/Seeds/Roots/Starting-Skills/magic-school files, stale KRMA_Costs_Table (old 4/8-KRMA attribute rates vs. locked 1:1), and stale Weapon_Examples_Table — **do not seed the DB from these files.** The uncommitted working-tree audit fixes part of this; the remainder needs the systematic rewrite pass that CLEANUP-AUDIT started. Also C-17 (stale pre-swap color parentheticals in CLAUDE.md + CANON_CORE §1) is still unfixed.

### B4. 🟡 Blossom mechanics are one line of canon
Blossoms (temporary Godhead-granted buffs) have no KV treatment, no duration model, no cap interaction with the Fate-Die trait cap (INV-07). Small, but M3d builds them — needs a paragraph of design before that task.

### B5. 🟢 Mistake-bounty adjudication is unspecified
The mutual-stewardship loop (GM proves JEWL error → KRMA from JEWL's wallet) is canon and load-bearing (Thesis capstone). "Proves" is undefined — who adjudicates a disputed claim, and what stops bounty farming? Natural answer inside your own architecture: route disputed claims to a Godhead (Kai grades; Et'herling audits), log to the mistake corpus either way. Needs one ruling.

### B6. 🟢 JEWL register calibration has no data source yet
Law 8 calibrates JEWL's register by *verified account age* and a *campaign adult-tone flag*. Neither field exists in the schema (auth is username/password; campaigns have no tone flag). Small build item, but without it JEWL's edge cannot legally/safely deploy at all — it silently gates the whole voice.

---

## C. TECHNICAL — Beta-Blocking

### C1. 🔴 The always-on audio loop is currently dev-machine-only
The JEWL pipeline assumes a **localhost faster-whisper server** (started by /boot on your box). A beta GM on their own machine has no STT. Either package a local STT component GMs install (aligns with the local-first membrane doctrine + hardware-floor stance) or stand up a cloud STT path (conflicts with the membrane doctrine, faster to ship). This is a product decision with doctrine weight, and it gates M8 — currently unowned in any roadmap line.

### C2. 🔴 Zero automated tests under a real-money ledger
129 routes, 48 services, no test framework — including the append-only SHA-256 ledger, death-split, burn, and drip services that real money will flow through. Before Stripe goes live, the economy services minimally need a unit-test harness (the trust story of the whole platform is "the ledger is correct").

### C3. 🔴 Hosting: the app's realtime shape doesn't fit serverless
SSE streams + always-on audio chunk POSTs + long-lived JEWL sessions fit a persistent Node server (Fly.io / Railway / VPS), not Vercel's function model, despite Next.js defaulting there. Recommendation: Fly or Railway + managed Postgres (Neon/Supabase-postgres), RunPod stays GPU-only. This resolves your open hosting decision with a technical constraint rather than a preference.

### C4. 🟡 Schema-drift migration is a now-or-never window
NEEDS-MIKE production item: pre-existing Prisma migrations need `migrate dev` (wipes dev.db). Every week of new schema work compounds the drift. Do it at the start of the build plan (re-seed via existing scripts) rather than mid-way.

### C5. 🟡 Prime/founder content isolation
`__PRIME__` (ADMIN-only) will carry the most sensitive prompt material (build-state preamble; eventually Connections-Ledger-tier lore in JEWL's context). If founder-only prompt content lives in ordinary DB rows, one permission bug leaks it to customers. Keep founder-only prompt layers in server-side files/env, loaded only on ADMIN-authenticated Prime requests — never in tables reachable by campaign-scoped queries. (Same wall as INV-96/FOUNDATIONS.)

### C6. 🟢 Migration must preserve the hash chain
SQLite→Postgres migration must move ledger rows byte-identically (hash-chain verification step in the migration script), or the audit trail breaks silently.

### C7. 🟢 IdentityLockWizard.tsx is 2,826 lines
Already the riskiest file in the fork merge; split it during the merge rather than after.

---

## D. LEGAL / PRIVACY — Counsel Territory (⚖️)

### D1. 🔴 Always-on audio records players who never consented
The GM consents (their mic, their mute lever) — but the *table* is being recorded and transcribed, and chunks currently go to a cloud classifier. Two-party/all-party consent states (CA, IL, WA...) make this criminal-statute territory, not just policy. Needs: player-facing consent at campaign join, in-session recording indicator, and a documented data-flow (what leaves the room, what's retained). The local-Whisper design helps a lot (raw audio can stay local); the transcript-to-cloud hop is the exposure.

### D2. 🔴 Minors: COPPA + voice data + payouts
Voice recording of under-13s = COPPA's highest-risk category. And death-graduation makes *players* (including minors) KRMA-earners → payees ("soul-package events change their standing," KRMA_Equity). Paying minors as contractors is its own thicket. Cleanest posture for beta: 18+ accounts only (or 13+ with no-payout + verified-parental-consent tier), enforced at registration — which also unblocks B6.
**Note:** the wounded-healer/education thesis eventually wants young players; that's a post-counsel expansion, not a beta default.

### D3. 🟡 Right-to-erasure vs. append-only ledger + "earning forever"
GDPR/CCPA deletion requests collide with an immutable hash-chained ledger and an Attribution DAG whose whole point is permanent attribution. Standard resolution is pseudonymization (ledger keeps opaque IDs; PII table is deletable) — but that has to be designed in *before* Postgres migration, not retrofitted.

### D4. 🟢 The subscription "includes" KRMA
Booth-rental cleanly frames the *payout* side. On the *acquisition* side, the sub delivering a KRMA drip that later pays out looks adjacent to "buying the earning instrument." Your counsel flags already cover the payout side; make sure the intake side is in the same conversation.

### D5. 🟢 JEWL going dark (Law 13) is an AI-triggered service suspension of a paying customer
Right instinct, needs guardrails: log every dark event, human review path, narrow triggers. An AI judgment call that suspends paid service is a refund/dispute magnet if it misfires.

---

## E. CANON / DOC HYGIENE

- **E1 🟡** INV-17 (drip curve as locked constants) is superseded by Economy Closeout ("emergent — do not hard-code"). Resolution already adopted in the build plan: current numbers become *configurable defaults*.
- **E2 🟡** C-17 doc bug still live: CLAUDE.md + CANON_CORE §1 carry pre-swap color parentheticals contradicting their own §2.
- **E3 🟢** `GROWTH_Continuation_Prompt_Next_Chat.md` says the app is "Next.js/TS/**Supabase**" — it's Prisma/SQLite→Postgres. Harmless, but that doc gets handed to fresh chats as ground truth; fix the line.
- **E4 🟢** ~42 uncommitted files including 30+ Repository rules audit fixes — the audited working tree is better than what's committed/pushed; it should land.
- **E5 🟢** docs/ (database_schema, module_registry, system_map) lag the code by ~1 month; the build plan's executor tasks depend on these being trustworthy.

---

## ADDENDUM 2026-07-10 — Re-sort under the same-mechanics principle

Mike's ruling: *the meta/management layer runs on the SAME mechanics as table play. Godheads are fully-motivated agents playing with the standard toolset, within Terminal-enforced contracts (modifiable by vote, Triu-verified, except immutable hard-coded ones). Much of what looks like a missing rule is content authored live in the Prime Campaign.*

Every open item above re-sorted into (A) dissolved, (B) content-authored-in-play, (C) structural:

### (A) DISSOLVED / self-resolved
- **A1 newcomer flow** → not a platform rule; a *redistribution contract* authored in Prime play (rides on the contract system, see C2). Godheads execute it with standard KRMA tools.
- **A2 Lady Death outflow** → she's a motivated agent; her wallet flows out through her play (resurrections, gifts, subsidies). No hard-coded outflow.
- **A4 death farming** → every death is officiated by a live motivated agent (Lady Death) + GM approval gates creation; farming is a play-visible pattern the meta punishes in play. Balance sim stays as ordinary tuning.
- **A5 burn limiters** → keep both as built (harmless redundancy); revisit in the balancing pass.
- **A6 wallet ceiling** → numbers are placeholders by Mike's own note; balancing pass.
- **A7 harvest floor × time-skip** → rule exists (r-2026-06-09-05); UX shows the floor cost before the GM commits a time advance; rate tuning later.
- **B2 CSV seeds** → refactor task: wizard serves Forge-published seeds only.
- **B3 stale repo rules** → work item (commit audit pass + continue rewrite), not a question.
- **B4 Blossoms** → derivable: temporary trait granted in play, outside the Fate-Die N/T cap (INV-07 names only Nectars/Thorns; Blossoms are "lighter" per memory), duration set by the granting Godhead, KV via Kai grading like everything else. Granting behavior itself = content.
- **B5 mistake-bounty adjudication** → disputed claims are contract territory: route to Et'herling (audit role) via the standard invocation path; her ruling executes the transfer; every claim logged to the corpus either way.
- **C2 tests** → my call: vitest harness over economy services goes in the plan.
- **C5 Prime isolation** → my call: founder-only prompt layers live in server-side files loaded only on ADMIN-authenticated Prime requests, never in campaign-queryable tables.
- **C6 hash-chain migration** / **C7 wizard split** → plan task details.
- **D3 erasure vs ledger** → design principle adopted: ledger keeps opaque IDs, PII in a deletable table; in place before Postgres. Counsel confirms later.
- **D4 sub-includes-KRMA optics** → goes in the counsel packet; changes nothing we build now.
- **D5 JEWL go-dark** → it's JEWL playing his role under contract; platform logs every dark event + ADMIN review surface; thresholds live in his prompt/contract and are authored in play.
- **E1–E5** → work items, already in the plan.

### (B) CONTENT — authored in play (named, deferred, not blocking)
Lady Death's specific spending/economic personality · each Godhead's behavior and contract portfolio · the newcomer-redistribution contract's actual terms · resurrection pricing and ritual · cross-campaign Spirit-Package appearances · ghost income paths · Blossom granting styles/durations · JEWL dark-mode thresholds · the moment-to-moment Tuesday-night loop (Mike's flagged conversation) · company/underworld campaign content · founder-exit severance mechanics (also ⚖️) · individual mistake-bounty rulings.

### (C) STRUCTURAL — the genuine build decisions (see chat for the decision list)
C-1 max-Frequency rebuild rule · C-2 contract-system scope & enforcement model for beta · C-3 payout basis (liquid vs liquid+locked) · C-4 STT delivery for beta GMs · C-5 beta account age policy · C-6 audio consent surface · C-7 hosting confirm + Stripe/support actions · C-8 dev-DB reset go-ahead · C-9 GM-cancellation default.
