# GRO.WTH Roadmap

Last updated: 2026-07-10

## Status (2026-07-10) — BUILD PHASE (GROWTH_BUILD_PLAN.md is the active task list)

The build phase runs off **GROWTH_BUILD_PLAN.md** (Part D: 42 ordered tasks;
Fable builds 11 tagged tasks, executor model builds 31). Completed so far:

- **T08** — DB reset verified + idempotent `npm run seed:all` (15 steps,
  `__PRIME__` always rebuilt, reserves reconcile to exactly 100B via
  `fullAudit()`; the audit step caught and fixed a 600k KRMA mint bug in
  test-data seeding).
- **T10** — fork portrait port verified complete (phase4 merge commits);
  prod build repaired (`next build --webpack`).
- **T11** — IdentityLockWizard split: 2,826-line monolith → 382-line main +
  12 modules under `identity-lock/`, byte-identical moves, click-through
  verified. **Character-creator fork RETIRED**; branch merged; remote
  `master` fast-forwarded to mainline (stale local master quarantined —
  contained a leaked API key, never pushed; see NEEDS-MIKE.md).
- **T13** — Contract system (INV-115): predicate DSL, post-ledger evaluator,
  human-gated penalty pipeline, immutable tier, Tara's 20% cap + Death
  succession seeded, ADMIN ContractsDock on the Prime canvas.
  `scripts/test-contracts.ts` = 12/12 PASS.

**Next (Fable):** T12 (H100 smoke — awaiting Mike's pod window) → T17 (JEWL
GodHead row + wallet) → T18 (JEWL behavioral-laws prompt) → T26 (paperdoll) →
T27 (death e2e) → T29 (wizard D/E) → T32 (M4 golden path) → T35 (architecture
memo + hosting discussion).

## Earlier status (2026-06-10)

Canvas-as-OS arc is live: Locations are recursive folders with drill-down +
ancestor-collapse visibility, the ONE JEWL dialog covers create AND edit
(multimodal), and the **Time System Phase 1 shipped** — campaign clocks in
meta cycles, fully customizable calendars (months/weeks/holidays, GM editor),
clock chip + advance controls on the canvas header, per-object perspective
history (r-2026-06-09-07), birthCycle stamping. Nine new canon rulings landed
2026-06-09 (rulebook/rulings.md r-2026-06-09-01..09): fated-age death (FD
only + escalating age-Thorns), 3/1/3 damage map, multi-attacks via Nectars,
decline tax 10%, harvest budget = floor, active≠draft deletion, JEWL as live
session engine. An app audit fixed: status-casing data bug (16 chars),
canvas hydration error, fatedAge duplication, stacked coordinate-less
folders, unbounded location KRMA reserves.

**Next up:** Time Phase 2 (JEWL narration inference, combat→clock, harvest
dialog — needs the session-engine umbrella per r-2026-06-09-08), per-Location
timescale override UI, dual-age render on cards, multi-entity generation
(#28), crystallize-time KRMA debit, then back to the M1 live-sheet gate
(Frequency three-op UI, paperdoll-on-anatomy-tree, damage auto-conditions,
trait effects).

Earlier status (2026-05-02): mid-Phase 5 (Entity Creation + Forge Authoring). Core Character Sheet, Campaign Flow, Canvas, KRMA ledger, dice engine, and God-Head Phase 1 (3 seeded agents + Goal CRUD) landed. Entity Creation Wizard (Sessions A-G) backed by Kai blueprint authoring; portrait pipeline cloud-only on H100 + FLUX.2 Dev FP16.

## Beta Scope (locked 2026-05-04)

**Beta = Production.** No "preview tier." Real money, real users, real consequences. Specifically:

- **Subscribing GMs** can pay for an account, get a 5-seat campaign, invite players, and run a full campaign end-to-end (character creation → play → death/retirement).
- **Players** can join a campaign (invite or public listing), build a character with their GM, and play through sessions.
- **Timeline:** ASAP — no fixed launch date, but every milestone treated as on-deck.
- **Quality bar:** every shipped feature behaves correctly, has error handling, and is observable in production.

### Milestones (ordered by dependency, not by date)

Sequencing rule: each game-side milestone after **M1** depends on the character sheet being feature-complete. **M6** (production infra) runs in parallel with the game-side work. **M7** (legal/support) also runs in parallel and is unblocked from day one.

| # | Milestone | Status | Gated By |
|---|---|---|---|
| **M1** | **Character feature-complete** (gate) | 🟡 in progress | — |
| M2 | Combat resolution loop closed | 🔴 todo | M1 |
| M3 | GROvine system live | 🟡 partial | M1 |
| M4 | GodHead AI agents operational | 🟡 Phase 1 done, 2-9 todo | M1 (uses character data) |
| M5 | KRMA flowing through subscription | 🟡 ledger done, billing-side todo | M6 (Stripe) |
| M6 | Production infrastructure | 🔴 todo | — (parallel) |
| M7 | Legal + support surface | 🔴 todo | — (parallel) |
| M9 | Content library seeded (Seeds, Roots, Branches, Nectars, Thorns, Materials, Items) — Mike + AI co-authored, balanced via Forge chain. CSV from paper version is reference only. | 🔴 todo | — (parallel; uses Forge chain) |
| **M8** | **Beta launch** — onboard first paying GMs | 🔴 todo | M1, M2, M3, M4, M5, M6, M7, M9 |

---

## M1 — Character Feature-Complete (the gate)

This is the load-bearing milestone. Without a sheet a player can fill, edit, and use during play, none of the game-side work matters. Four parallel sub-streams:

### 1a — Creation Flow (player onboarding → wizard → crystallization)

The Sessions A-G plan in "Active Critical Path" below IS this sub-stream. Restating in milestone terms:

- ✅ A (partial): seed-catalog (48 seeds), EntitiesPanel, Tapestry Entities sub-tab, in-canvas selection (just landed)
- 🟡 B: Wizard steps 1-3 (Identity + Seed + Root) — IdentityLockWizard merged from fork; Root step wired to forge
- 🟡 C: Wizard step 4 (Attributes — WTH cut, no longer applies) — deterministic KV calc owed
- 🟡 D: Wizard steps 5-6 (Skills + Traits) + Kai blueprint eval + Blueprint Tagger
- 🔴 E: Wizard steps 7-8 (Goals + Review/Crystallize) + Council Router — full crystallization
- 🔴 F: AI-assisted NPC speed creation (quick mode)
- 🔴 G: Canvas "Place Entity" + PC application → creation bridge + retirement flow
- 🔴 Player onboarding flow: Interest → Backstory → Wizard handoff (currently breaks at the handoff)

### 1b — Live Sheet (what players use during play)

The sheet is what's consulted/edited every session. Must work without GM intervention.

- ✅ Identity / portrait / vitals display
- ✅ Attribute display (9 attributes with level + current)
- ✅ KRMA bar + crystallization line on canvas
- 🟡 Skills CRUD inside SkillsCard (read-only currently)
- 🟡 Skill check flow UX from sub-panel (server-side roll works; UX flow incomplete)
- 🔴 Frequency three-operations UI (Spend / Deplete / Burn — Burn formula `[NEEDS MIKE]`)
- 🔴 Inventory paperdoll (3-tier: Equipped / Carried / Possessions, per-Seed regions)
- 🔴 Body parts + vitals tracking (HUMANOID_BODY default + condition application)
- 🔴 Damage tracking with auto-conditions (depletion table effects auto-apply)
- 🔴 Trait list (Nectars / Thorns / Blossoms) visible and editable
- 🔴 Goals + Resistance display (read-only on sheet; editing in 1c/M3 panel)

### 1c — Portrait Pipeline End-to-End

Cloud H100 + FLUX.2 Dev FP16 + PuLID-Flux. Just merged from fork.

- ✅ Stage 1 face-lock (front)
- 🟡 5-angle face lock (Kai mission plateau at 7/10 identity per memory)
- 🔴 Body lock (full character with body type + age)
- 🔴 Equipment overlay (visible gear)
- 🔴 State-diff auto-regenerate (equipment / wound / age / narrative changes queue regen)
- 🔴 Pod smoke test post-merge (blocked: no available H100s today; Mike trying tonight)

### 1d — Mechanical Effects Wiring

Things on the sheet that actually DO things in play.

- ✅ Dice rolls server-side, KRMA ledger
- 🟡 Skill check uses Skill Die + FD + Effort (server logic done; UI flow open)
- 🔴 Nectars / Thorns apply roll modifiers (currently visible only)
- 🔴 Blossoms (temporary buffs from Godheads during play)
- 🔴 Death triggers: Frequency=0 in combat → Lady Death roll; Fated Age → Lady Death roll (different formulas, both use bodyResist + Fate Die per WTH-removal canon)
- 🔴 Spirit Package on death (composition `[NEEDS MIKE]`)
- 🔴 Goal completion → Nectar bestowed (custodian Godhead chooses); failure → Thorn

### M1 exit criteria

A new player can: join a campaign → fill backstory → go through the wizard with their GM → end with a crystallized character that has portrait, attributes, skills, traits, goals, and inventory all functional. They can then sit at the canvas and the sheet supports a play session (rolls, damage, depletion, KRMA spend) without breaking.

---

## M2 — Combat Resolution Loop Closed _(was stub)_

A GM can drop an encounter card on the canvas, place combatants on a 5ft grid, run the Time Stack from initiative through resolution, apply attack/defense/damage with the correct cross-pillar rules, and have death triggers (combat Frequency=0 → Lady Death) fire automatically with no manual bookkeeping. Per DESIGN-TRUTH §7.5 (Combat Action Economy) and §6.5 (Skill System).

### 2a — Time Stack + Action Economy

Initiative ordering and the per-turn ActionMod budget that gates everything else.

- 🟡 EncounterTracker component exists (skeleton)
- 🔴 Time Stack ordering algorithm (replace explicit PLACEHOLDER in `types/encounter.ts`)
- 🔴 ActionMod=0 base, +/- from skills/traits/conditions
- 🔴 Cross-pillar action cost rules (Body/Spirit/Soul mixing)
- 🔴 Turn UI on canvas: whose turn, remaining ActionMod, end-turn

### 2b — Attack / Defense / Damage Flow

The actual combat math, end-to-end on the canvas with server-side dice.

- ✅ Skill check engine server-side (rolls, FD, Effort)
- 🔴 Attack action (skill check vs defense)
- 🔴 Defense reaction (consumes ActionMod, may trigger reflexive skill)
- 🔴 Damage roll → body part hit → vitals/condition application
- 🔴 Environmental effects (replace explicit PLACEHOLDER in `types/encounter.ts`)
- 🔴 Range/movement rules on the 5ft grid

### 2c — Death Triggers (Combat path)

Pairs with M1d's death wiring; M2c is the in-encounter trigger that fires it.

- 🔴 Frequency=0 in combat → Lady Death roll (bodyResist + Fate Die)
- 🔴 Death-save UI inline in encounter
- 🔴 Auto-route resulting Spirit Package event to Lady Death godhead (M4 dependency)

### 2d — Encounter Cards on Canvas

Combat as a first-class canvas object, not a separate screen.

- 🟡 Encounter model + create button (skeleton landed Phase 3)
- 🔴 Encounter card expansion (grid view, combatant tokens)
- 🔴 Drag combatants onto encounter card → bind to grid
- 🔴 Encounter end → cleanup, log to session, KRMA flow

### M2 exit criteria

Two players + GM can run a 3-round combat encounter on the canvas: initiative resolves, ActionMod constrains options, an attack lands, damage applies a condition, a combatant drops to Frequency=0, the death save fires, and the encounter ends with a session log entry — without the GM hand-resolving any math.

---

## M3 — GROvine System Live _(was stub)_

The G/R/O loop runs end-to-end inside a campaign: a player adopts a Goal, the GM (or a godhead) assigns Resistance entities, Opportunity surfaces, and on resolution a Nectar or Thorn drops with mechanical effect on the sheet. Per DESIGN-TRUTH §3 (GROWTH acronym) + §8 (KRMA flow). Goal model exists; Resistance + Opportunity UI not complete per audit.

### 3a — Goals (mostly built)

The G of GROWTH — desired outcomes the player is moving toward.

- ✅ Goal model + GoalCRUD
- ✅ GoalCard component
- ✅ Goal context service for godheads
- 🟡 Goal panel on character sheet (read-only currently)
- 🔴 Goal lifecycle states (Active / Dormant / Completed / Failed) wired through UI
- 🔴 Custodian godhead assignment per goal

### 3b — Resistance (entities-as-resistance)

The R — opposing forces are not abstract "obstacles," they are concrete entities pointed at the goal.

- 🟡 EntityRelationship model exists
- 🔴 Resistance assignment UI (GM picks entities → links to goal)
- 🔴 Resistance display on goal card (which entities push back, how hard)
- 🔴 GM resistance view in Tapestry (Session 9 of God-Head plan)

### 3c — Opportunity

The O — moments of leverage where progress accelerates or derails.

- 🔴 Opportunity panel UI on character card
- 🔴 GM-triggered opportunity events (manual first, godhead-triggered later)
- 🔴 Opportunity → skill check or KRMA spend resolution

### 3d — Nectar / Thorn / Blossom Mechanical Effects

Goal completion drops a Nectar; failure drops a Thorn; godhead grants Blossoms in play. All three must DO something on the sheet, not just display.

- 🟡 Trait list visible on sheet (read-only)
- 🔴 Nectar bestowal on goal completion (custodian godhead chooses)
- 🔴 Thorn bestowal on goal failure
- 🔴 Blossom (temporary buff) grant flow from godhead during play
- 🔴 Roll modifier application: traits inject into skill checks
- 🔴 Nectar/Thorn cap = Fate Die value; Decline → raw KRMA conversion

### M3 exit criteria

A player adopts a goal, the GM links two entities as Resistance, the player closes the goal during a session, the assigned custodian godhead bestows a Nectar, and the next skill check that benefits from that Nectar shows the modifier applied automatically — all visible in the canvas without GM math.

---

## M4 — GodHead AI Agents Operational _(was stub)_

The three seeded godheads (Kai, Lady Death, Eth'erling) act on their own behalf inside the campaign: they read state via tools, take authored actions via tools, are woken by triggers, and can talk to each other and to the GM. Phase 1 (seeded entities + context services) is done; Phases 2-9 from the existing God-Head plan below are the scope here. Schema gaps still owed: `GodHeadMemory`, `GodHeadInvocation`, `GodHeadActionLog`, `GodHeadConversation`. Runtime gap: agent loop + tool registry + trigger dispatcher.

### 4a — Tool Library (read + write)

Sessions 2 and 3 of the God-Head plan. Without tools, godheads can only narrate — they can't act.

- 🔴 Read tools: `read_wallet`, `query_relationships`, `list_goals`, `read_goal`, `search_blueprints`, `read_blueprint`, `read_my_memory`
- 🔴 Write tools: `write_my_memory`, `adopt_goal`, `release_goal`, `propose_resistance`, `draft_blueprint`, `send_message_to_gm` (+ `GodHeadMessage` model), `transfer_krma` (with safety constraints)
- 🔴 Tool registry + invocation dispatch
- 🔴 `GodHeadActionLog` schema for audit

### 4b — Trigger System

Session 4. Godheads need to wake up on game events, not just on manual GM invocation.

- 🔴 Triggers service + GodHeadDispatcher
- 🔴 Routing table (event → godhead handler)
- 🔴 Wire existing services to emit events (entity.died, blueprint.unused_for_90d, goal.completed, etc.)
- 🔴 `GodHeadInvocation` schema for queue + retry

### 4c — Specialized Behavior

Sessions 5-7. Per-godhead specialization on top of the generic loop.

- 🔴 Kai: `evaluate_blueprint(blueprint)` → score + KRMA price + modification loop
- 🔴 Lady Death (Tara Almswood): `process_death(characterId)`, `decay_blueprint(forgeItemId, status)` ACTIVE → FLAGGED → DISSOLVING → DISSOLVED, "gentle hand" Fated Age memo pattern
- 🔴 Eth'erling: `route_to_godhead(name, request)` orchestrator + sub-invocation + synthesis back via `send_message_to_gm`

### 4d — Multi-Agent Conversation

Session 8. Council orchestration where multiple godheads deliberate.

- 🔴 `GodHeadConversation` model
- 🔴 Multi-turn orchestration loop (turn-taking, termination, summarization)
- 🔴 GM-visible conversation log

### M4 exit criteria

A player closes a goal in-session, the trigger dispatcher fires `goal.completed`, Eth'erling routes to Kai for Nectar pricing, Kai prices and proposes, the result returns to the GM as a single coherent message, and the godhead-authored Nectar lands on the player's sheet — with every action logged to `GodHeadActionLog`.

---

## M5 — KRMA Flowing Through Subscription _(was stub)_

KRMA moves through the full economic loop: a paying GM's subscription allocates KRMA into their Watcher wallet on a recurring basis, KRMA is invested into characters at approval, sessions reward KRMA, deaths split KRMA, and the burn system collapses unused crystallized KRMA back to raw on a definable formula. The core ledger is COMPLETE per audit (reserves seeded, append-only chain, evaluator, death-split engine, full audit/reconcile). Missing pieces are the wiring on top.

### 5a — Subscription Billing → Wallet (depends on M6 Stripe)

Pull from Stripe → push to KRMA wallet on a schedule.

- 🔴 Subscription → Watcher wallet allocation hook (on payment success)
- 🔴 Bell-curve allocation values `[NEEDS MIKE]`
- 🔴 GM lump sum on first payment + monthly drip thereafter
- 🔴 Failed payment / cancellation → wallet status change
- 🔴 Refund handling → KRMA reversal

### 5b — Character Investment on Approval

When the GM approves a character at crystallization, KRMA leaves the GM wallet and locks into the character.

- ✅ Crystallization line + drag-to-crystallize on canvas
- 🔴 Character investment transaction on approval (GM wallet → character)
- 🔴 KRMA cap enforcement at crystallization time
- 🔴 Refund on character retirement (partial, per Lady Death rules)

### 5c — Session Rewards

Per-session KRMA flow back to player characters and GM wallet.

- 🔴 Session reward API
- 🔴 Per-action reward triggers (goal closed, blueprint authored, etc.)
- 🔴 Reward review UI for GM (approve/adjust before commit)

### 5d — Death-Split UI

Engine exists; the surface for it doesn't.

- ✅ Death-split engine (Phase 4)
- 🔴 Death-split confirmation UI on character death
- 🔴 Spirit Package composition `[NEEDS MIKE]` rendered in UI
- 🔴 Recipient routing (other characters? Lady Death? campaign reserve?)

### 5e — Burn System

The economic pressure release: exponential cost to convert raw KRMA into crystallized KRMA prevents inflation.

- 🔴 Burn formula (exponential cost) `[NEEDS MIKE]`
- 🔴 Burn UI on character sheet (Spend / Deplete / Burn three-op picker — pairs with M1b)
- 🔴 Burn transaction logging + reconciliation

### 5f — Transaction History UI

Read-only at first; the data is already there.

- 🔴 Per-wallet transaction history view
- 🔴 Per-character KRMA timeline
- 🔴 Global metrics dashboard (admin Terminal)

### M5 exit criteria

A new GM subscribes via Stripe, their Watcher wallet receives the lump sum, they approve a character which deducts the investment, the player closes a goal during a session and KRMA flows back, the character later dies and the death-split UI lets the GM confirm the Spirit Package routing — all visible in transaction history and reconcile clean.

---

## M6 — Production Infrastructure _(was stub — runs parallel)_

The app runs on real production infrastructure with paying customers: Stripe handles money, PostgreSQL replaces SQLite, the app is hosted somewhere with uptime guarantees, auth supports password recovery, and we know when things break before customers tell us. RunPod stays as the GPU-only pod for portrait generation, NOT app hosting.

### 6a — Stripe Billing

The money plumbing. M5 depends on this being live.

- 🔴 Stripe account + product/price configuration
- 🔴 Recurring subscription checkout flow
- 🔴 Cancellation + downgrade flows
- 🔴 Refund flow
- 🔴 Stripe webhooks → app event bus
- 🔴 Failed payment retry + dunning

### 6b — Database Migration

SQLite is fine for beta-as-dev; production needs Postgres.

- ✅ Prisma schema is provider-agnostic
- 🔴 PostgreSQL migration plan (data migration script for any retained dev data)
- 🔴 Connection pooling config (PgBouncer or equivalent)
- 🔴 Migration testing on a production-mirror dataset

### 6c — Hosting

Where the app actually runs.

- 🔴 Hosting platform decision (Vercel / Fly / Railway) `[NEEDS MIKE]`
- 🔴 Production deploy pipeline (CI → preview → prod)
- 🔴 Environment variable management (secrets in platform vault)
- 🔴 Custom domain + TLS
- 🔴 RunPod portrait pod stays separate; app calls it via API

### 6d — Auth

Password-only auth needs the standard surface area.

- ✅ bcrypt + session tokens (no OAuth per CLAUDE.md)
- 🔴 Email verification on registration
- 🔴 Password reset flow (email token)
- 🔴 Rate limiting on login + reset endpoints
- 🔴 Email transactional provider (Resend / Postmark / SES)

### 6e — Monitoring + Backups

When prod breaks, we need to know first.

- 🔴 Sentry (or equivalent) for error tracking
- 🔴 Uptime monitoring (Better Stack / UptimeRobot)
- 🔴 Scheduled PostgreSQL backups (daily + restore-tested)
- 🔴 Application logs to durable storage
- 🔴 Basic admin dashboard for ops health

### M6 exit criteria

A new user can register, verify their email, subscribe via Stripe, log in from a fresh browser, and use the app on a custom domain — and if any of that fails, an alert fires within 5 minutes and a backup from the last 24 hours is restorable.

---

## M7 — Legal + Support _(was stub — runs parallel)_

The non-engineering surface required to take real money: legal documents that hold up, a refund policy, a way for customers to get help, and onboarding docs that get a brand-new GM and player from signup to first session without 1:1 hand-holding.

### 7a — Legal Documents

Customer-facing legal. Mike likely needs a lawyer for any of this that touches paid users.

- 🔴 Terms of Service `[NEEDS LAWYER]`
- 🔴 Privacy Policy `[NEEDS LAWYER]`
- 🔴 Refund policy (drafted by Mike, reviewed by lawyer) `[NEEDS LAWYER]`
- 🔴 Cookie/tracking notice (if analytics added)
- 🔴 Acceptable use policy (content guidelines for player-authored material)

### 7b — Support Surface

How a stuck customer gets help.

- 🔴 Support contact channel (email at minimum; ticket system later) `[NEEDS MIKE]`
- 🔴 Support inbox monitoring + response SLA expectation
- 🔴 Bug-report path inside the app (link to email or form)
- 🔴 Status page for outages (can be a simple static page)

### 7c — Onboarding Docs

The minimum viable docs to launch.

- 🔴 GM quickstart (subscribe → first campaign → invite players → first session)
- 🔴 Player guide (join campaign → backstory → wizard → first roll)
- 🔴 KRMA explainer (what it is, why it matters, what subscription buys)
- 🔴 FAQ covering refund, cancellation, account deletion, data export

### M7 exit criteria

A new GM lands on the marketing page, can read the ToS and Privacy Policy, subscribes, follows the GM quickstart to first session without contacting support — and if they do hit a wall, they know exactly where to send the email and what to expect for a response.

---

## M9 — Content Library Seeded _(was stub — runs parallel)_

Beta launches with enough authored, balanced content for a new GM to run a campaign without writing everything from scratch. Workflow: Mike + AI co-author exemplars → run them through the Forge 3-stage chain (Selva → Creator → Kai → Et'herling, already shipped) → Mike approves/modifies. The 48 CSV seeds are from the PAPER VERSION OF GROWTH and are NOT BALANCED for current digital canon — they are inspiration only, not import targets.

### 9a — Seeds

The character archetypes. Currently only Human + Altered Human exist as digital-balanced.

- ✅ Human (count: 1)
- ✅ Altered Human (count: 1)
- 🔴 Author 12-15 seeds for beta (current: 2)
- 🔴 Each seed runs through Forge chain end-to-end before publish

### 9b — Roots

Subdivisions / lineages within Seeds.

- 🟡 Forge Authoring Pipeline lands Roots from GM narrative (engine done)
- 🔴 Author target count `[NEEDS MIKE]` (suggest 3-5 per Seed for beta)
- 🔴 Wizard Root step pulls from published forge roots (already wired)

### 9c — Branches

Specializations on top of Roots.

- 🔴 Author target count `[NEEDS MIKE]` (suggest 2-3 per Root for beta)
- 🔴 Branches selector wired to forge in wizard

### 9d — Nectars + Thorns

The trait library. Mechanical effects depend on M3d wiring.

- 🔴 Author target count `[NEEDS MIKE]` (suggest 20-30 each for beta starter library)
- 🔴 Each authored trait specifies its mechanical hook (roll mod, condition, etc.)
- 🔴 Forge chain validates mechanical effect is implementable

### 9e — Materials + Items

Crafting + inventory content. Material catalog (25+) already exists; items library is the gap.

- ✅ Material catalog (25+ materials, combineMaterials, weapon properties, armor coverage)
- 🔴 Author target count for items `[NEEDS MIKE]` (suggest 30-50 starter items: weapons, armor, gear)
- 🔴 Prima materia exemplars
- 🔴 Forge full item builder used for authoring (already shipped)

### 9f — Magic Spells

The spell library.

- 🔴 Magic system mechanics confirmed against current canon `[NEEDS MIKE]`
- 🔴 Author target count `[NEEDS MIKE]` (suggest 20-30 spells across schools for beta)
- 🔴 Each spell runs through Forge chain

### M9 exit criteria

A new GM, with no prior content authoring, can open a campaign and pull from a published library of 12+ Seeds, 30+ Roots/Branches combined, 40+ Nectars/Thorns combined, 30+ Items, and 20+ Spells — all balanced through the Forge chain and approved by Mike — and build a full session's worth of content without leaving the app.

---

## M8 — Beta Launch

Onboard first paying GMs. Monitor + iterate.

---

## Phase History (preserved progress log)

### Decisions Made (Mike confirmed 2026-03-06)
- **Clean rebuild** in the gro.wth folder (fresh project, not patching the beta)
- **Google Sheets is DEAD** — cut entirely, no fallback, no googleapis
- **No active campaigns** — will simulate with AI for testing
- **Relations Canvas IS the vision** — spatial web of floating/dockable panels for GM interface
- **3-month timeline** — workable product for investors/Kickstarter demo
- **Desktop-first** — GM at a computer is the primary use case
- **Keep from beta**: TypeScript types (`src/types/growth.ts`), character card visual DNA, Prisma entity design

### Phase 0: Clean Slate Setup — COMPLETE
- Next.js 16 + Prisma 7 + SQLite, bcrypt+session auth, role-based middleware, three route groups (`/trailblazer`, `/watcher`, `/terminal`), GODHEAD promote script.

### Phase 1: The Character Sheet — COMPLETE (portrait + JSON validation deferred)
- CharacterSheet, AttributeBlock, Skills, Magic, Inventory, Vitals, GM 4-step builder, campaign creator, demo "Kael Ashenmire". Portrait upload UI deferred.

### Phase 2: Campaign Flow — COMPLETE through invite/backstory loop
- Campaign CRUD + invite codes + seat limits, CampaignMember model, structured 8-prompt backstory + custom GM prompts, Trailblazer Portal, GM review UI, ChangeLog with revert + conflict detection. Outstanding: campaign settings/edit page, full collaborative character creation hand-off after backstory approval.

### Phase 3: Session Tools — IN PROGRESS
- **Built:** Campaign Terminal, Game Sessions, dice roller server-side (crypto RNG, DiceService, event bus, Godhead injection, 3D Three.js + Cannon-es overlay), `/check`, `/deathsave`, `/spend`, `/restore`, `/session`, `/inject`, `/rest`, chat, Forge bones (ForgeItem + PlayerRequest, GM templates, player requests), Skill freeform redesign, Rest & Recovery (short/long, RestPanel), Card Folders / Party Group with KRMA-line lock, AI co-pilot (Tapestry beta).
- **Skeleton systems landed (2026-03-09):** Location, World Item, Encounter, GROvine panel, Essence/Encounters tabs, Canvas create buttons, expandable Location/Item nodes.
- **Outstanding in Phase 3:** Editable skills CRUD in SkillsCard, Skill check flow UX from sub-panel, Traits (Blossoms/Thorns/Nectars wired to roll mods), damage tracking with auto-conditions.

### Phase 4: KRMA Economy — CORE LEDGER COMPLETE
- Reserve wallets seeded (Terminal 75B, Balance 12.5B, Mercy 6.25B, Severity 6.25B), append-only SHA-256 chain, idempotent batch txns, deterministic TKV evaluator, death-split engine, campaign fund/defund, transaction history + global metrics APIs, full audit/reconcile system, KRMA UI on all 3 interfaces (canvas header, watcher, terminal admin), crystallization line + guitar-string deformation effect, drag-to-crystallize/dissolve.
- **Outstanding:** GM KRMA subscription allocation (bell-curve, values TBD), session reward API, character investment on approval, burn system (exponential cost formula TBD), transaction history UI.

### Phase 5: Relations Canvas — LARGELY COMPLETE
- Draggable/resizable panels, Character/Location/WorldItem cards as spatial nodes, relationship lines, KRMA line + sub-panel constraints, dynamic viewBox via ResizeObserver, refactored zoom (camera+zoom source of truth, viewBox derived).
- **Outstanding:** NPC card expansion (currently circles), campaign overview panel, session notes panel.

### Other landed work
- **Login + GROWTH logo component** (pixel-matched to source PNG, gold `<n>`).
- **EŶ∃tehrNET social backbone** — profiles, hub, listing, applications.
- **Forge full item builder** — material catalog (25+), combineMaterials, weapon properties, armor coverage, prima materia, Place-on-Canvas.
- **Tapestry tab** — Trailblazers, Entities, GROvines (replacing old application prompt system).
- **Forge Authoring Pipeline (2026-04-05)** — Kai authors mechanical stats from GM narrative for seed/root/branch; KaiReviewPanel; Entity Wizard Root step wired to published forge roots.
- **God-Head Architecture Phase 1 (2026-04-04)** — entityType + GoalCRUD + EntityRelationship + GodHead model, Claude provider for godhead reasoning, 3 seeded godheads (Lady Death, Kai, Eth'erling), GoalCard component, context services (entity-context, goal-context).
- **Portrait Pipeline Phase A (2026-03-15)** — full service layer (types, style-config, prompt-builder, character-adapter, state-diff, portrait-service), local + cloud + factory providers, PortraitGeneration + PersonaLock models, 6 API routes, ComfyUI setup script. Local 4060 path subsequently retired in favor of cloud H100 — see Portrait Pipeline (Cloud Forward) below.

---

## Active Critical Path

### Entity Creation Wizard — Sessions A–G

| Session | Scope | KRMA Wiring | AI |
|---|---|---|---|
| A (DONE 2026-04-04/05, partial) | seed-catalog.ts (48 seeds from CSV), EntitiesPanel.tsx, Tapestry Entities sub-tab | None | No |
| B | EntityCreationWizard steps 1-3 (Identity + Seed + Root) | Seed KV display | Claude (suggestions) |
| C | Wizard steps 4-5 (Attributes + WTH) | Deterministic KV calc | No |
| D | Wizard steps 6-7 (Skills + Traits), Kai blueprint eval, Blueprint Tagger | Kai evaluates skills/traits | Claude (Kai + suggestions) |
| E | Wizard steps 8-9 (Goals + Review/Crystallize), Council Router | Full crystallization | Claude (custodian assignment) |
| F | AI-assisted NPC speed creation (quick mode) | Same as manual | Claude (full entity generation) |
| G | Canvas "Place Entity", PC application → creation bridge, Lady Death entity retirement | Same | No |

This plan replaces standalone Goal CRUD + Custodian sessions of the original God-Head plan (those are folded INTO the wizard). Remaining specialized God-Head behavior (Kai/Lady Death/Eth'erling) folds into wizard sessions D-G as needed.

Immediate next steps once ANTHROPIC_API_KEY is set: end-to-end test (Forge → Kai authors root → accept → wizard pulls), wire branches/skills/traits selectors to forge, global catalog browser modal, forge item detail/edit panel.

### God-Head Architecture — Sessions 2–9

```
Session 2: Phase 2 (Tool Library — read tools)
           read_wallet, query_relationships, list_goals, read_goal,
           search_blueprints, read_blueprint, read_my_memory

Session 3: Phase 2 (Tool Library — write tools)
           write_my_memory, adopt_goal, release_goal, propose_resistance,
           draft_blueprint, send_message_to_gm (+ GodHeadMessage model),
           transfer_krma (with safety constraints)

Session 4: Phase 3 (Trigger System)
           Triggers service, GodHeadDispatcher, routing table,
           wire existing services to emit events

Session 5: Phase 4A (Kai specialization)
           evaluate_blueprint tool, scoring prompt, modification loop

Session 6: Phase 4B (Tara Almswood specialization)
           process_death + decay_blueprint tools, Fated Age memory pattern

Session 7: Phase 4C (Eth'erling specialization)
           route_to_godhead tool, council orchestration pattern

Session 8: Phase 5 (Multi-Agent Conversation)
           GodHeadConversation model, multi-turn orchestration

Session 9: Phase 6 (Goals & Resistance UI)
           Goal panel on character cards, GM resistance view in Tapestry
```

Schema gaps still owed: `GodHeadMemory`, `GodHeadInvocation`, `GodHeadActionLog`, `GodHeadConversation`. Runtime gap: agent loop + tool registry + trigger dispatcher.

---

## Phase 3 Character Subsystem Work

### GROvine UI (simple G/R/O)
- UI panel with G/R/O aspects, Active/Dormant/Completed/Failed states.
- Nectar/Thorn cap = Fate Die value; Decline → raw KRMA conversion.
- Godhead assignment per vine for Blossom generation.
- Goal model exists; Resistance + Opportunity UI not complete.

---

## Portrait Pipeline (Cloud Forward)

The original RTX 4060 8GB local path is retired. Current path: **H100 cloud + FLUX.2 Dev FP16 + PuLID-Flux**, Mike accepts BFL commercial license debt to be paid at release.

- **State diff → auto-regenerate**: `state-diff.ts` already detects equipment/wound/age/narrative changes; full hook-up to queue regen still owed.
- **Phase B (Identity Consistency)** — PuLID identity lock; reference face stored on first generation; "Regenerate" preserves face. PuLID primary refs are uploaded multi-ref ONLY (never generated images fed back).
- **Phase C / D** — state-driven regen, narrative-aware prompt evolution, batch updates between sessions; rebuild on top of the cloud stack.
- **Roadmap of record:** `standalone/docs/character-pipeline-roadmap.md` (the 11-rung ladder). Active critical rung is the 5-angle face lock.
- **Drop from old doc:** GGUF Q4 / Nunchaku / `--lowvram` / 8GB ComfyUI flags / FLUX.1 Dev framing — all superseded.

---

## Specialized God-Head Behavior (Phase 4)

Detail owed beyond Phase 1 seeded entities:

- **Kai (Chaos & Balance)** — `evaluate_blueprint(blueprint)` returns score + KRMA price. Modification loop until accept.
- **Tara Almswood (Lady Death)** — triggers `entity.died`, `blueprint.unused_for_90d`; `process_death(characterId)`, `decay_blueprint(forgeItemId, status)` ACTIVE → FLAGGED → DISSOLVING → DISSOLVED; "gentle hand" Fated Age memo pattern.
- **Eth'erling (Justice)** — orchestrator; `route_to_godhead(name, request)` creates sub-invocation, awaits, synthesizes back via `send_message_to_gm`.

---

## Future / Post-Beta

- **Phase 6: Oracle Foundation** — AI co-GM as separate service connecting via API. Voice Activity Detection → ASR → Speaker Diarization → in/out-of-character classification → real-time game state derivation. Too complex for beta.
- **KRMA Subscription tuning** — diminishing returns curve, GM lump sum + monthly drip, social/creative contributions as primary source over time. Draft targets only; not canon yet.
- **Reversible book** — Flow front-to-back lore, Focus back-to-front mechanics, Balance synthesizes in middle. AI-assisted page creation eventually. App comes first.
- **KRMA → ledger crypto** — long-term: built on a ledger-based cryptocurrency so KRMA maps to actual company shares; players become co-owners. Depends on legality + working product first.
