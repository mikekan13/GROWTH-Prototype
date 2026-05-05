# GRO.WTH Roadmap

Last updated: 2026-05-02

## Status (2026-05-02)

Project is mid-Phase 5 (Entity Creation + Forge Authoring). Core Character Sheet, Campaign Flow, Canvas, KRMA ledger, dice engine, and God-Head Phase 1 (3 seeded agents + Goal CRUD) are landed. Active critical path is the Entity Creation Wizard (Sessions A-G) backed by Kai blueprint authoring; portrait pipeline has pivoted to cloud-only on H100 + FLUX.2 Dev FP16.

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
| **M8** | **Beta launch** — onboard first paying GMs | 🔴 todo | M1, M2, M3, M4, M5, M6, M7 |

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

## M2 — Combat Resolution Loop Closed _(stub — to be expanded next)_

5ft grid combat per DESIGN-TRUTH §7.5. Time Stack ordering, ActionMod, attack/defense/damage, death triggers fire correctly. Encounter cards on canvas.

## M3 — GROvine System Live _(stub)_

Goals + Resistance + Opportunity UI complete. Nectars/Thorns/Blossoms apply mechanical effects.

## M4 — GodHead AI Agents Operational _(stub)_

Sessions 2-9 from the existing God-Head plan in "Active Critical Path" below.

## M5 — KRMA Flowing Through Subscription _(stub)_

Stripe subscription → Watcher wallet allocation → character investment on approval → session rewards → death-split UI. Burn system (exponential cost formula `[NEEDS MIKE]`).

## M6 — Production Infrastructure _(stub — runs parallel)_

Stripe billing + recurring + cancellation. PostgreSQL migration off SQLite. Hosting (Vercel / Fly / Railway — TBD). Email verification + password reset. Sentry monitoring. Backups.

## M7 — Legal + Support _(stub — runs parallel)_

Terms of Service. Privacy Policy. Refund policy. Support contact. Basic onboarding docs.

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
