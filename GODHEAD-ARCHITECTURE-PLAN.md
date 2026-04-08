# GRO.WTH — God-Head Architecture Build Plan (v2)

**Created:** 2026-04-04
**Rewritten:** 2026-04-08 — reframed around the agent-loop principle
**Status:** PLANNING — schema partially built (Goal, EntityRelationship, GodHead, ForgeItem extensions migrated; 3 MVP god-heads seeded)

---

## Core Principle (read this first)

**A god-head is an AI agent, not a prompt template.**

The earlier draft of this plan treated god-heads as `systemPrompt + temperature → response`. That's wrong. A god-head is a persistent agent with:

1. **Identity** — name, domain, pillar, system prompt, character sheet (universal)
2. **Memory** — accumulated observations, working notes, conversation history that survives between invocations
3. **Tools** — the things it can *do* and *look up* (read a sheet, query the graph, read its wallet, author a blueprint draft, adopt a goal, message a GM)
4. **Triggers** — events that wake the agent (GRO.vine created, milestone reached, GM request, scheduled scan)
5. **An action loop** — observe → think → act → record, not single-turn request/response

Everything in this plan derives from that principle. If a phase looks like "stuff context into a prompt and get a string back," it is wrong and should be reworked.

### Sub-principle: god-heads never sleep

A god-head is a permanent fixture of the metaverse. There is no off switch. Cost limits, load limits, and rate limits all live **upstream on the human side** (e.g. GMs can only submit N blueprints per minute) — never on the agent. If a god-head's prompt or tool implementation is broken, we fix her in place; we do not deactivate her. The runtime must be robust enough that one bad invocation cannot crash the agent loop: errors get logged, the invocation fails gracefully, and the agent is still listening for the next trigger a millisecond later.

This is a stronger commitment than "high availability." It means we never design a feature whose graceful-degradation path is "the god-head goes dormant." If the bill is a problem, we throttle GMs. If a tool is broken, we fix the tool. If Anthropic is down, we queue the trigger and run it when they're back. The agents stay alive.

**Implication:** the Anthropic Agent SDK (or a Claude tool-use loop) is the right substrate. The existing Ollama copilot pattern (single-turn request/response) is **not** what we're building here. The copilot stays as-is for the GM-facing chat assistant; god-heads are a different system.

---

## What Exists (Foundation)

| System | Status | Notes |
|---|---|---|
| Auth + Roles | ✅ | ADMIN/WATCHER/TRAILBLAZER/GODHEAD on User |
| Universal Character Sheet | ✅ | `entityType` field on Character (PC/NPC/CREATURE/GODHEAD) |
| KRMA Ledger | ✅ | Append-only, checksummed, atomic |
| KRMA Evaluator (deterministic) | ✅ | TKV from character data — used for crystallization |
| ForgeItem | ✅ | Skills/items/nectars/blossoms/thorns; extended with global catalog + decay + karmic value fields |
| Campaign Graph Models | ✅ | `Goal` and `EntityRelationship` migrated |
| GodHead Model | ✅ | `name`, `domain`, `pillar`, `characterId`, `systemPrompt`, `temperature`, `walletId`. ⚠️ Has an `active` boolean field — needs to be **dropped** in Phase 1 schema migration (god-heads cannot be deactivated). |
| 3 MVP God-heads Seeded | ✅ | Tara Almswood (Lady Death), Kai (Chaos & Balance), Eth'erling (Justice). All Balance pillar. Empty wallets. |
| Existing Copilot | ✅ | Ollama-based, GM-facing — **not** the god-head substrate |

---

## What's Missing (Gaps)

### Schema
- **GodHeadMemory** — persistent working notes per agent (observations, beliefs, accumulated context)
- **GodHeadInvocation** — trigger queue: pending work for each agent, with status (PENDING / RUNNING / DONE / FAILED)
- **GodHeadActionLog** — history of every tool call an agent has made (input, output, timestamp, invocation it belongs to)
- **GodHeadConversation** — multi-turn conversation history when an agent is in dialog with a GM or another god-head

### Runtime
- No agent loop. No tool registry. No trigger dispatcher. Nothing that wakes a god-head when a GRO.vine is created.

### Tools
- Nothing exposed. The agent has nowhere to "look" and nothing to "do."

---

## Build Phases

### Phase 1 — Agent Runtime Skeleton
**Goal:** a god-head can be invoked, can call one tool (read_entity), can think for one turn, can record what it did. Nothing fancy.

#### 1A — Schema additions
- `GodHeadMemory` — `{ id, godheadId, key, value, updatedAt }` (key/value working memory, agent-managed)
- `GodHeadInvocation` — `{ id, godheadId, triggerType, triggerData, status, startedAt, finishedAt, result }`
- `GodHeadActionLog` — `{ id, invocationId, godheadId, toolName, input, output, error?, createdAt }`
- `GodHeadTokenUsage` — `{ id, godheadId, invocationId, model, inputTokens, outputTokens, costEstimate, createdAt }` (observability, no enforcement)
- **Drop `GodHead.active` field** — god-heads cannot be deactivated
- Migration + Prisma client regen

#### 1B — `GodHeadAgent` runtime class
- Loads a god-head row + character sheet + system prompt
- Holds a tool registry (initially: just `read_entity`)
- Runs one invocation: builds the Claude message list (system prompt + memory snapshot + trigger context), calls Claude with tool use enabled, executes any tool calls, loops until the agent is done or hits a step cap, persists action log + memory updates
- Uses the Anthropic SDK (cloud, Claude Opus 4.6 or Sonnet) — **not** Ollama
- Lives at `app/src/godhead/agent.ts`

#### 1C — Tool registry foundation
- `app/src/godhead/tools/registry.ts` — `registerTool(name, schema, handler)` pattern
- First tool: `read_entity(entityId: string) → EntityRecord` — fetches a Character row + parses JSON, returns structured data (NOT a pre-baked prompt string)
- Agent decides what to look at; we don't pre-stuff anything

#### 1D — Manual invocation API
- `POST /api/godhead/[name]/invoke` — admin-only, takes `{ triggerType, triggerData }`, runs the agent synchronously, returns the action log
- For testing only — production triggers come in Phase 3

**Acceptance:** I can hit the API as Mike, tell Tara Almswood "look at character X," watch her call `read_entity`, see the action log in the DB, see her response.

---

### Phase 2 — Tool Library
**Goal:** the agents have enough tools to actually observe the world and take meaningful action.

Each tool is a small, typed function. The agent picks which to call. We never pre-bake a "context dump."

**Read tools (observation):**
- `read_entity(entityId)` — already built in Phase 1
- `read_wallet(walletOwnerId)` — query a wallet's current balance + recent transactions
- `read_my_wallet()` — convenience: agent's own wallet
- `query_relationships(entityId, depth?)` — graph traversal (1–2 hops) over EntityRelationship
- `list_goals(filters)` — find goals by status, custodian, campaign, entity
- `read_goal(goalId)` — full goal detail including milestones
- `search_blueprints(query, scope?)` — fuzzy search ForgeItems (campaign + global catalog)
- `read_blueprint(forgeItemId)` — full blueprint detail
- `read_my_memory(key?)` — retrieve agent's own working memory

**Write tools (action):**
- `write_my_memory(key, value)` — record a note
- `adopt_goal(goalId, reasoning)` — agent claims custodianship of a GRO.vine
- `release_goal(goalId, reasoning)` — agent gives up custodianship
- `propose_resistance(goalId, plan)` — write to `Goal.resistancePrompt` for GM review
- `draft_blueprint(spec)` — create a ForgeItem in `draft` status, agent as authorUserId
- `send_message_to_gm(campaignId, message)` — write to a god-head ↔ GM message channel (new model needed: `GodHeadMessage`)

**Karmic-economy tools (Phase 4 work, but stub now):**
- `transfer_krma(toWalletId, amount, reason, description)` — must validate amount ≤ wallet balance, must use existing ledger service, reason is constrained to god-head-allowed types

Each tool has Zod input/output schemas. Tools throw typed errors that the agent sees and can react to.

**Acceptance:** Tara Almswood can be invoked with "review the campaign graph and tell me which goals you'd adopt as custodian," and she actually queries goals, reads relationships, writes memory notes, and calls `adopt_goal` on the ones that match her domain.

---

### Phase 3 — Trigger System
**Goal:** god-heads wake up on their own when something happens, not because Mike hits an admin endpoint.

#### 3A — Trigger sources
- **Domain events** emit triggers: `goal.created`, `grovine.created`, `milestone.completed`, `entity.died`, `blueprint.created`, `blueprint.unused_for_90d`, `gm.requested_council`
- A `Triggers` service receives events from existing services (goal service, character service, etc.) and writes `GodHeadInvocation` rows with status PENDING

#### 3B — Dispatcher
- `GodHeadDispatcher` — periodic worker (Node interval or cron-style) that finds PENDING invocations and runs them through the right agent
- Routing: each trigger type maps to one or more god-head names (e.g. `entity.died` → Tara Almswood; `blueprint.created` → Kai; `gm.requested_council` → Eth'erling routes from there)
- Routing rules live in `app/src/godhead/routing.ts` — simple table to start, can become smarter later
- For "GRO.vine pickup" the trigger goes to *all* active god-heads as PENDING; first to call `adopt_goal` wins

#### 3C — Concurrency + safety
- One invocation per god-head at a time (DB lock or in-memory mutex per god-head)
- Step cap per invocation (e.g. max 20 tool calls), wall-clock cap (e.g. 60s)
- Failed invocations get logged + status FAILED, never retried automatically (for now — Mike decides)

**Acceptance:** Create a goal in a campaign. Within seconds, one or more god-heads have invocation rows that ran, looked at the goal, and either adopted it or wrote a memory note explaining why they passed.

---

### Phase 4 — Specialized Behaviors

Now that the runtime, tools, and triggers exist, each god-head gets the prompts, tool subsets, and behaviors specific to their domain. **No new infrastructure** in this phase — only prompts, routing rules, and small tool additions.

#### 4A — Kai (Chaos & Balance)
- Trigger: `blueprint.created`
- Tools: `read_blueprint`, `query_relationships`, `read_my_memory`, `write_my_memory`, plus a new `evaluate_blueprint(forgeItemId, scoring) → karmicValue` that writes `karmicValue + evaluatedAt` on the ForgeItem
- Scoring dimensions stay the same as the original plan (Scope, Frequency, Reversibility, Specificity, Synergy Risk) but Kai *decides* them via reasoning, not a fixed formula
- Modifications loop: Kai can call `propose_blueprint_modification(forgeItemId, changes)` which writes a suggestion the GM sees

#### 4B — Tara Almswood (Lady Death)
- Triggers: `entity.died`, `blueprint.unused_for_90d`
- Tools: existing read tools + `process_death(characterId)` which orchestrates the existing death-split service, + `decay_blueprint(forgeItemId, status)` which moves a blueprint through ACTIVE → FLAGGED → DISSOLVING → DISSOLVED
- Tara also has a "gentle hand" pattern: she leaves memory notes about characters whose Fated Age is approaching, even when no death has occurred yet

#### 4C — Eth'erling (Justice)
- Trigger: `gm.requested_council`
- Tools: existing read tools + `route_to_godhead(godheadName, request)` which creates a sub-invocation for another god-head and waits for it
- Eth'erling is the orchestrator — she reads the GM request, decides which god-head's domain it falls under, routes, then synthesizes the response back to the GM via `send_message_to_gm`

---

### Phase 5 — Multi-Agent Conversation
**Goal:** god-heads can talk to each other when a request spans domains.

- `GodHeadConversation` model — turn-by-turn dialog between 2+ agents, each turn is an invocation linked to the conversation
- Eth'erling can open a conversation with Kai + Tara on a complex request, each takes turns, Eth'erling closes the conversation with a synthesized response
- This is a pure layering on top of Phase 1–4. No new tools, just a new orchestration pattern.

---

### Phase 6 — Goals & Resistance (UI + Loop)

Now that god-heads are real agents, the goal system can be wired into the player-facing UI:
- Goal creation panel on character cards
- Player creates goal → trigger fires → god-heads consider adoption → custodian assigned → resistance prompt generated → GM sees it in Tapestry
- Milestone completion → trigger fires → custodian decides nectar bestowal
- Goal completion / failure → custodian writes summary to memory, KRMA flows recorded

Originally Phase 2 in v1, now last because everything else has to exist first.

---

## Implementation Order

```
Session 1: Phase 1 (Agent Runtime Skeleton)
           Schema (GodHeadMemory, GodHeadInvocation, GodHeadActionLog)
           GodHeadAgent class + tool registry
           First tool: read_entity
           Manual invoke API for Mike to test

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

---

## Key Decisions (locked unless Mike says otherwise)

- **Substrate:** Anthropic SDK (Claude), not Ollama. God-heads need real reasoning + tool use.
- **Model selection is per-action, not per-god-head.** Every god-head can use Opus, Sonnet, or even a plain scripted function — whichever is right for the task at hand. A god-head deciding whether to adopt a complex GRO.vine probably needs Opus. The same god-head running a routine "did this blueprint get used in the last 90 days?" check should use a script with no LLM at all. We build the model/tool routing one capability at a time as each god-head needs it.
- **Scripted (non-LLM) handlers are first-class.** A "tool" in the registry can be backed by a deterministic function, a Sonnet call, or an Opus call. The agent runtime shouldn't care which. Some triggers may not even invoke the LLM — they just run a script and write to memory.
- **Memory is agent-managed.** We do NOT pre-stuff context. The agent uses tools to look at what it needs.
- **No "starting state" baked into seeds.** Wallets, memory, action logs all start empty. State is journaled, not declared. (See `memory/godhead-seeding.md`.)
- **Tools throw typed errors the agent can recover from.** The runtime relays errors back to the model as tool results, not exceptions.
- **One invocation per god-head at a time.** Avoid weird concurrent state. Throughput comes from multiple god-heads, not parallel invocations of one.
- **Synchronous council (Phase 5) before async drama.** No "the council deliberates for 3 minutes" UX until the basics work.
- **Production-grade ledger constraints on `transfer_krma`.** A god-head must never bypass the existing wallet/ledger services. The tool is a thin wrapper.
- **Existing copilot is untouched.** GM-facing chat assistant (Ollama) and god-heads (Claude agents) are two systems. They may share read tools eventually but ship separately.

---

## Decisions Locked 2026-04-08

- **God-heads never sleep.** No off switch. No `active` flag. No auto-dormancy on cost or error. See "Sub-principle" at top.
- **Model choice is per-action.** No god-head is "an Opus god-head" or "a Sonnet god-head." Each tool/capability picks its own model (or no model, if a script suffices). Built incrementally as god-heads need new capabilities.
- **Scripted (non-LLM) handlers are first-class.** A "tool" in the registry can be backed by a deterministic function, a Sonnet call, or an Opus call. The agent runtime shouldn't care which. Many triggers may not invoke the LLM at all.
- **God-heads transfer their own KRMA freely.** Spending out of their own wallet is their decision and should reflect their personality. No GM/Admin gate on `transfer_krma`. (Constraint still: cannot transfer more than the wallet holds; cannot bypass the ledger.)
- **Memory visibility:** ADMIN can see all god-head memory at all times. GMs and players cannot — *unless* they have an in-game ability that grants it (e.g. a high-level "read mind" spell targeted at a god-head). Memory is canon-private by default, exposed only via mechanical abilities.
- **No spending caps.** Token cost is observed (via `GodHeadTokenUsage`) but never enforced. If costs become a problem, we throttle humans (e.g. GM blueprint submission rate limits) — never the agents. Long term: own servers + local models.
- **Backpressure lives upstream.** If god-heads can't keep up with human requests, we add rate limits to what humans can submit — not to what agents process. Agents always work through their queue in order, never drop work.
