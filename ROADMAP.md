# GRO.WTH Roadmap

Last updated: 2026-05-02

## Status (2026-05-02)

Project is mid-Phase 5 (Entity Creation + Forge Authoring). Core Character Sheet, Campaign Flow, Canvas, KRMA ledger, dice engine, and God-Head Phase 1 (3 seeded agents + Goal CRUD) are landed. Active critical path is the Entity Creation Wizard (Sessions A-G) backed by Kai blueprint authoring; portrait pipeline has pivoted to cloud-only on H100 + FLUX.2 Dev FP16.

## Beta Scope (placeholder)

> Beta scope to be locked in Phase 5 with Mike. Until then, this roadmap describes the full forward backlog; treat the sequencing as best-current-guess, not committed scope.

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

### Fear System
- Data structure `{name, resistanceLevel 1-10, status, hiddenPower?}`.
- `fearCheck` (FD + attribute vs Resistance × 2). DiceService.fearCheck() exists.
- Confrontation tracking, GM assignment UI, `/fear` terminal command.
- UI/data not yet wired beyond the dice helper.

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
