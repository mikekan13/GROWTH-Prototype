# Next Session — God-Head Phase 2: Tool Library + Blueprint Authoring Pipeline

## Read First
- `docs/PRODUCTION-PLAN.md` — 25-day build plan, current state assessment
- `GODHEAD-ARCHITECTURE-PLAN.md` — full architecture (we're in Phase 2)
- `memory/realtime-sse-system.md` — SSE + skill checks built 2026-04-19
- `memory/session-2026-04-19-planning.md` — key decisions (online play, voice vision, fears cut)
- `memory/skill-check-flow.md` — SD first → wager → FD (verified from repository)
- `memory/git-push-blocked.md` — history cleaned, push works now

## What Was Built (2026-04-19/20)
1. **SSE real-time** — replaces polling, connection tracking, per-campaign rooms
2. **Skill checks** — GM triggers from canvas → player wagers → throws Fate Die on canvas
3. **Contested checks** — server-orchestrated attacker→defender chain, governor overlap filtering
4. **Forge redesign** — ForgeWorkshop: universal blueprint browser with type tabs, campaign/global views, search, create
5. **God-Head Phase 1** — schema (Memory, Invocation, ActionLog, TokenUsage), GodHeadAgent class, tool registry, read_entity tool, manual invoke API
6. **Fears/Values/Addictions** stripped from codebase
7. **Production plan** written (docs/PRODUCTION-PLAN.md)

## Current State
- Phase 1 skeleton DONE: agent can be loaded, invoked, call tools, persist logs
- Anthropic SDK installed, `@anthropic-ai/sdk`
- 3 god-heads seeded: Tara Almswood (Lady Death), Kai (Balance), Eth'erling (Justice)
- `active` field dropped — god-heads never sleep
- Manual invoke: `POST /api/godhead/[name]/invoke`

## What To Build This Session

### Phase 2A: Read Tools
God-heads need eyes. Build these tools in `src/godhead/tools/`:
- `read_wallet(walletOwnerId)` — query wallet balance + recent transactions
- `read_my_wallet()` — convenience: agent's own wallet
- `query_relationships(entityId, depth?)` — graph traversal over EntityRelationship
- `list_goals(filters)` — find goals by status, custodian, campaign
- `read_goal(goalId)` — full goal detail with milestones
- `search_blueprints(query, scope?)` — fuzzy search ForgeItems
- `read_blueprint(forgeItemId)` — full blueprint detail
- `read_my_memory(key?)` — agent's own working memory

### Phase 2B: Write Tools
God-heads need hands:
- `write_my_memory(key, value)` — record observations
- `adopt_goal(goalId, reasoning)` — claim GRO.vine custodianship
- `release_goal(goalId, reasoning)` — give up custodianship
- `propose_resistance(goalId, plan)` — resistance prompt for GM
- `draft_blueprint(spec)` — create ForgeItem in draft
- `send_message_to_gm(campaignId, message)` — god-head ↔ GM channel (needs GodHeadMessage model)
- `transfer_krma(toWalletId, amount, reason)` — wrapper around existing ledger

### Phase 2C: Test the Agent
- Invoke Tara: "review the campaign graph, tell me which goals you'd adopt"
- She should call read tools, think, call write tools, produce a result
- Verify action logs, memory persistence, token tracking

## Key Architecture Rules
- God-heads are AGENTS, not prompt templates. They observe → think → act → record.
- Tools throw typed errors the agent can react to.
- Memory is agent-managed — we do NOT pre-stuff context.
- One invocation per god-head at a time.
- Model choice is per-action (Sonnet for routine, Opus for complex reasoning).
- God-heads transfer their own KRMA freely — no GM gate.
- Scripted (non-LLM) handlers are first-class tools.

## Blueprint Authoring Pipeline (The Big Goal)
Once tools exist, the pipeline Mike described:
1. GM describes → pays KRMA
2. Router god-head picks authoring god-head
3. Author drafts blueprint (may create sub-blocks)
4. Author pays Kai → Kai balances → pays Et'herling
5. Et'herling grades KV → sends back
6. Author accepts or contests (costs KRMA)
7. GM confirms or challenges

This requires Phase 2 tools + Phase 4A (Kai) + Phase 4C (Et'herling) + Phase 5 (multi-agent conversation). Build tools first, then specialize.

## Parallel Work
- Mike is building character creation wizard in standalone with another Claude instance
- This instance focuses on: Forge + God-head pipeline + game mechanics
- Don't duplicate character creation work

## Git
- Remote: `origin` → `https://github.com/mikekan13/GROWTH-Prototype.git`
- History was cleaned (removed 122MB node_modules)
- Push works: `git push origin master`
