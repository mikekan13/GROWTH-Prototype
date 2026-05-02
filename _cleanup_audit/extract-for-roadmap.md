# Extract for ROADMAP.md

Audit date: 2026-05-02. Source for absorption into the surviving `PLAN.md` -> `ROADMAP.md`.

Each entry is tagged with `[source: <file>]` and a `still relevant?` note. Anything PLAN.md already covers is omitted unless the killed doc adds material detail.

---

## 1. Spine to preserve verbatim from PLAN.md

PLAN.md is the spine. Keep its phase ordering and Progress Log verbatim. Highlights that must survive the rename:

- **Phase 0** (Auth + skeleton) — DONE.
- **Phase 1** (Character Sheet) — DONE; portrait + JSON validation deferred.
- **Phase 2** (Campaign flow, structured backstory, access codes) — DONE.
- **Phase 3** (KRMA, Canvas, dice server-side, folders, AI co-pilot beta, Tapestry) — partially landed; track per session log.
- **Portrait Pipeline Phase A** (service layer, providers, persona lock) — DONE; Phase B onward replaced by the cloud H100 / FLUX.2 Dev path (see §4).
- **God-Head Architecture Phase 1** (runtime skeleton, schema, Claude provider, 3 seeded god-heads, GoalCard) — DONE.
- **Entity Creation Pivot** — Sessions A-G become the active backbone for character/NPC authoring + KRMA evaluation.

PLAN.md's "Progress Log" timestamps are historical; preserve the entries dated 2026-03-06 onward. Drop "Open Questions" section (already resolved, see DESIGN-TRUTH extract).

---

## 2. Forward-looking phases NOT already in PLAN.md

### 2A. God-Head Architecture — remaining sessions
[source: GODHEAD-ARCHITECTURE-PLAN.md] — still relevant: YES, this is the active roadmap for the AI agent layer. PLAN.md only logs Phase 1; Phases 2-6 below are not yet absorbed.

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

Schema gaps still owed: `GodHeadMemory`, `GodHeadInvocation`, `GodHeadActionLog`, `GodHeadConversation`. Runtime gap: agent loop + tool registry + trigger dispatcher. [source: GODHEAD-ARCHITECTURE-PLAN.md "What's Missing (Gaps)"]

### 2B. Entity Creation Wizard — Sessions A-G
[source: ENTITY-CREATION-PLAN.md] — still relevant: YES, this is the current critical path; PLAN.md only mentions Session A pivot.

| Session | Scope | KRMA Wiring | AI |
|---|---|---|---|
| A | seed-catalog.ts (48 seeds from CSV), EntitiesPanel.tsx, Tapestry Entities sub-tab | None | No |
| B | EntityCreationWizard steps 1-3 (Identity + Seed + Root) | Seed KV display | Claude (suggestions) |
| C | Wizard steps 4-5 (Attributes + WTH) | Deterministic KV calc | No |
| D | Wizard steps 6-7 (Skills + Traits), Kai blueprint eval, Blueprint Tagger | Kai evaluates skills/traits | Claude (Kai + suggestions) |
| E | Wizard steps 8-9 (Goals + Review/Crystallize), Council Router | Full crystallization | Claude (custodian assignment) |
| F | AI-assisted NPC speed creation (quick mode) | Same as manual | Claude (full entity generation) |
| G | Canvas "Place Entity", PC application -> creation bridge, Lady Death entity retirement | Same | No |

Note: This plan replaces Sessions 3-4 of the original God-Head plan (Goal CRUD + Custodian + Opportunity built INTO the wizard). The remaining God-Head sessions (Kai/Lady Death/Eth'erling) are folded into wizard sessions D-G as needed.

### 2C. Specialized God-Head behavior detail (still owed beyond Phase 1)
[source: GODHEAD-ARCHITECTURE-PLAN.md Phase 4] — still relevant: YES.
- **Kai (Chaos & Balance)** — `evaluate_blueprint(blueprint)` returns score + KRMA price. Modification loop until accept.
- **Tara Almswood (Lady Death)** — triggers `entity.died`, `blueprint.unused_for_90d`; `process_death(characterId)`, `decay_blueprint(forgeItemId, status)` ACTIVE -> FLAGGED -> DISSOLVING -> DISSOLVED; "gentle hand" Fated Age memo pattern.
- **Eth'erling (Justice)** — orchestrator; `route_to_godhead(name, request)` creates sub-invocation, awaits, synthesizes back via `send_message_to_gm`.

---

## 3. Phase 3 character subsystem work items
[source: COMPREHENSIVE-BUILD-PLAN.md "Phase 3E"] — still relevant: PARTIAL (some built, some not).

- **Fear System** — data structure `{name, resistanceLevel 1-10, status, hiddenPower?}`, fearCheck (FD + attribute vs Resistance x2), confrontation tracking, GM assignment UI, `/fear` terminal command. DiceService.fearCheck() exists; UI/data not yet wired.
- **GROvine System (simple G/R/O)** — UI panel with G/R/O aspects, Active/Dormant/Completed/Failed states, Nectar/Thorn cap = Fate Die value, Decline -> raw KRMA conversion, Godhead assignment per vine for Blossom generation. (Goal model exists; Resistance + Opportunity UI not complete.)

---

## 4. Portrait Pipeline forward work (cloud-only)

The killed root `PORTRAIT-PIPELINE.md` assumed RTX 4060 8GB local — that path is **dead** per memory `flux2-dev-decision.md` (Mike green-lit FLUX.2 Dev FP16 on H100, accepts BFL commercial license debt). Cloud-compatible items still relevant:

- **State diff -> auto-regenerate**: portrait service detects equipment / wound / age / narrative changes and queues regen. [source: PORTRAIT-PIPELINE.md "When portraits regenerate"] — still relevant: YES. Already partly built in `state-diff.ts`; full hook-up remaining.
- **Phase B (Identity Consistency)** — PuLID identity lock, reference face stored on first generation, "Regenerate" preserves face. [source: PORTRAIT-PIPELINE.md "Phase B"] — still relevant: YES (now via H100 PuLID-Flux + uploaded multi-ref, NOT generated images per memory `pulid-uploads-only-rule.md`).
- **Phase C / D ideas** (state-driven regen, narrative-aware prompt evolution, batch updates between sessions) — still relevant: YES, but rebuild on top of cloud stack.

DROP from old doc: GGUF Q4 / Nunchaku / `--lowvram` / 8GB ComfyUI flags / FLUX.1 Dev framing — all superseded by cloud H100 + FLUX.2 Dev FP16. The active portrait roadmap of record is `standalone/docs/character-pipeline-roadmap.md` (the 11-rung ladder), per memory `character-pipeline-vision.md`.

---

## 5. Items intentionally NOT extracted

- TONIGHT-SESSION-PLAN.md — entirely session-specific TODOs. Nothing extracted.
- NEXT-SESSION-PROMPT.md — session-specific Phase 2 setup notes. Already covered by §2A above.
- skeleton-systems-report-2026-03-09.md — stale audit (Phase 3 ~79% snapshot). Nothing extracted.
- COMPREHENSIVE-BUILD-PLAN.md status snapshots ("Phase X complete", line counts) — stale.
- PLAN.md "Open Questions" — all resolved; see DESIGN-TRUTH extract.

---

## 6. Flagged for Mike (canon uncertainty)

- **Entity Creation Plan vs God-Head Plan ordering**: The two killed docs disagree on whether Goals/Custodian live in their own God-Head session or inside the Entity Wizard. Memory says Goal CRUD + custodian shipped 2026-04-04(b). Confirm: do we still need the standalone "Phase 6 Goals & Resistance UI" session, or is GoalCard enough?
- **Phase 3E Fear "hidden paradoxical power"** — flagged as canonical mechanic but no resolved Q&A. Confirm before adding to ROADMAP.
- **Portrait state-diff auto-regen cadence** — killed doc said "diff each session"; current cloud workflow is manual gen. Confirm trigger model.
