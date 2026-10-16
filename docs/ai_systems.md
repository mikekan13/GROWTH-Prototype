# GRO.WTH AI Systems

Last updated: 2026-04-04

## Current Status

Two AI systems are now active. **2026-10-13: local Ollama is no longer a default anywhere** (Christophoros/OpenClaw shut down) — QoL text runs on the pod (the serverless text lane, `AI_PROVIDER=pod` default) and every image-understanding call goes through `src/ai/network/vision.ts` (`VISION_PROVIDER=pod` default: the lane's Qwen3.8 VL model; `claude` = fiction only; `ollama` = explicit opt-in). The lock gate (`ai/portraits/lock-gate.ts`) and `/api/references/describe` both use it.

### Active: Application AI (QoL)

**Purpose**: Help GMs design application prompts and help players expand backstory responses.

**Architecture**: `src/ai/application-ai.ts` → `src/ai/providers/index.ts` (`getAIProvider`: `PodProvider` default, `ClaudeProvider` / `OllamaProvider` via `AI_PROVIDER`) → `routedChatText` on the local lane

**Functions**:
- `suggestApplicationPrompts(campaign)` — AI generates 5 tailored backstory prompts from campaign context
- `expandApplicationResponse(prompt, response, campaign)` — Expands player's short answer into rich narrative prose

**Classification**: Quality-of-life (metered on basic tier, unlimited on premium, local-model-eligible)

### Active: Campaign Co-pilot (QoL, Beta)

**Purpose**: AI assistant embedded in the Campaign Terminal. Answers questions about characters, rules, the campaign world. Can create items, skills, and locations via action intents.

**Architecture**: `src/ai/copilot/` — pre-retrieval pattern
```
User message → Context Assembler → Relevant data fetched → Prompt built → Ollama chat → Action parser → Response
```

**Components**:
- `copilot-service.ts` — Main orchestrator (conversation loop, history, context assembly)
- `context-assembler.ts` — Builds entity index, finds mentions in user message, fetches full details for matches
- `rules-search.ts` — Keyword search across GRO.WTH Repository markdown files (70+ files)
- `action-parser.ts` — Parses structured action blocks from AI responses

**Context Assembly (lean)**:
- Campaign summary always included (names only — small)
- Entity details fetched only when mentioned in user's message
- Rules searched only when rules-related keywords detected
- Last 20 conversation messages for continuity

**Actions** (GM-only, require confirmation):
- `create_forge_item` — skills, items, nectars, blossoms, thorns
- `create_location` — settlements, dungeons, etc.
- `create_campaign_item` — weapons, armor, artifacts, etc.

**Data**: `CopilotMessage` model persists conversation history per campaign.

**UI**: "Co-pilot" tab in Campaign Terminal panel, accessible to both GMs and players.

**Classification**: Quality-of-life (local-model-eligible)

### Active: Claude AI Provider (God-head Operations)

**Purpose**: Deep reasoning AI for God-head operations — custodian assignment, resistance generation, future blueprint evaluation and council routing.

**Architecture**: `src/ai/providers/claude.ts` → Anthropic Messages API (v1/messages)

**Configuration**:
- `ANTHROPIC_API_KEY` — Required for God-head operations
- `ANTHROPIC_MODEL` — Default: `claude-sonnet-4-20250514`
- `ANTHROPIC_API_URL` — Default: `https://api.anthropic.com`

**Accessed via**: `getGodheadProvider(task)` from `src/ai/providers/index.ts` — a `ClaudeProvider` that is a face over `routedChatText`: the task (caller + REQUIRED content class) goes through route() and the wall.

**Classification**: System-required (always cloud, not local-model-eligible). God-heads need deep reasoning that local models cannot provide.

### Design Note: Resistance is Entity-Based

Resistance is NOT auto-generated text. The GM creates entities (NPCs, creatures, locations) and assigns them as resistance to goals via EntityRelationship edges (`resisted_by`). Resistance entities have their own GRO.vines and custodian God-heads, creating a natural adversarial graph. God-heads see the full resistance graph to understand cross-entity dynamics.

**Service**: `src/services/goal-resistance.ts` — assign/remove/list resistance entities
**API**: `GET/POST/DELETE /api/goals/[id]/resistance`

### Active: God-head Custodian Assignment

**Purpose**: Determine which God-head picks up a new GRO.vine based on domain alignment.

**Architecture**: `src/services/goal-custodian.ts` → `buildGoalContext()` → Claude AI → JSON parse → assign

**God-heads** (seeded):
- **Lady Death** (BALANCE) — Death, decay, karmic recycling, endings, transformation
- **Kai** (BALANCE) — Value, balance, karmic evaluation, creation, ambition
- **Eth'erling** (BALANCE) — Justice, routing, cosmic judgment, moral dilemmas (default fallback)

### Active: Forge Authoring Pipeline (Kai)

**Purpose**: GMs describe what they want narratively → Kai (God-head) generates balanced mechanical stats + KRMA Value estimate → GM reviews and confirms or reforges.

**Architecture**: `src/services/forge-authoring.ts` → build type-specific prompt with schema guidance → Claude AI → JSON parse → return for GM review → confirm persists as draft ForgeItem

**Supports all forge types**: seed, root, branch, skill, item, nectar, blossom, thorn

**Flow**:
1. GM enters name + narrative description in ForgePanel (textarea, not stat fields)
2. `POST /api/campaigns/[id]/forge/author` → `authorForgeItem()` → Kai generates stats
3. `KaiReviewPanel` displays: stat badges, attributes, skills, nectars/thorns, KV estimate, Kai's reasoning
4. GM accepts → `PUT /api/campaigns/[id]/forge/author` → `confirmForgeAuthoring()` → draft ForgeItem created
5. GM can then publish the item for use in entity creation wizard

**Key design rule**: GMs describe, God-heads author mechanics. The Forge creation form is a narrative prompt + name, NOT stat fields.

**Balance guidance**: Type-specific schema templates with reference ranges (e.g., Human seed = 50 total attributes, frequency 40, KV 225). Every seed must have at least one Thorn.

## Planned Systems

### Portrait Pipeline (Phase A — In Progress)

**Purpose**: Generate and maintain consistent character portraits from narrative data. Portraits are dynamic — they update as equipment, wounds, conditions, and traits change.

**Architecture**: ComfyUI + FLUX.1 Dev Q4_0 GGUF (12B params, 8GB VRAM) + PuLID Flux II (identity preservation)

**Core Concept — Persona Lock**: On first portrait generation, player cycles until satisfied, then "locks" the identity. The reference image + face embedding + locked prompt are stored permanently. All future regenerations use PuLID to inject the locked identity, producing the same person in different states.

**Components**:
```
src/ai/portraits/
  types.ts              — All interfaces (PortraitInput, PersonaLock, provider types, stub pipeline schemas)
  style-config.ts       — Style bible prompt, negative prompts (4 layers), campaign theme modifiers
  prompt-builder.ts     — Character data → prompt translation (7 visual weight tiers)
  character-adapter.ts  — Prisma Character → PortraitCharacterData flattening
  state-diff.ts         — Detects visual changes between portrait states (equipment/wounds/traits/etc.)
  portrait-service.ts   — Main orchestrator (generate, accept, lock, diff, history)
  providers/
    index.ts            — Provider factory (local vs cloud, with fallback)
    local.ts            — ComfyUI REST/WebSocket client, VRAM management (Ollama unload)
    cloud.ts            — Stub (future: BFL API, Replicate)
  workflows/
    README.md           — How to create ComfyUI workflow JSON files
    character-portrait.json     — (Phase A: manual creation in ComfyUI GUI)
    character-portrait-pulid.json — (Phase B: with PuLID identity injection)
```

**API Routes** (6 routes):
- `POST /api/portraits/generate` — Queue generation
- `GET /api/portraits/history` — Portrait history for a character
- `POST /api/portraits/accept` — Set as current portrait
- `POST /api/portraits/lock` — Persona lock
- `GET /api/portraits/status` — Check for visual changes
- `GET /api/portraits/provider` — Provider health check

**Database Models**: `PortraitGeneration` (generation history + state snapshots), `PersonaLock` (identity anchor + body description)

**Detailed design**: See `PORTRAIT-PIPELINE.md` and `docs/PORTRAIT-ARCHITECTURE-PLAN.md`

### Rule Arbiter (future — Phase 6+)

**Purpose**: AI copilot that monitors game state and suggests mechanical outcomes.

**Inputs**: Session events (eventually via microphone → transcription → interpretation)
**Constraint**: Manual override always available. GM is final authority.

### God-Head Council (Phase 0 Schema — DONE, services next)

**Purpose**: AI agents that ARE the game. God-heads author blueprints, evaluate karmic cost, assign custodianship to player goals, generate opportunities, process death. They use the same universal character sheet as players/NPCs.

**AI Model**: Claude (cloud API via Anthropic) — God-heads need deep reasoning, not Ollama.

**MVP God-heads**: Lady Death (Balance), Kai (Balance), Eth'erling (Balance) — all KRMA-integral.

**Schema (built 2026-04-04)**:
- `Goal` model — player goals with God-head custodianship, resistance prompts, milestones
- `EntityRelationship` model — typed graph edges between any entities (2-hop traversal)
- `GodHead` model — metadata linking to Character record + systemPrompt + domain + pillar
- `Character.entityType` — PLAYER_CHARACTER | NPC | CREATURE | GODHEAD
- `ForgeItem` extended — global catalog, authorship royalties, decay tracking, karmic evaluation

**Context Services (built 2026-04-04)**:
- `services/context/entity-context.ts` — `buildEntityContext(entityId)`: queries DB, returns clean context string (identity, attributes, goals, inventory, relationships)
- `services/context/goal-context.ts` — `buildGoalContext(goalId, campaignId)`: follows EntityRelationship edges from goal entity (2-hop max), returns focused context window of connected entities only

**Build Order (remaining)**:
1. Goal CRUD service + API routes + resistance generator
2. God-head custodian assignment (AI determines who picks up GRO.vines)
3. Opportunity generation (God-head reads goal context → generates opportunity)
4. Blueprint relationship tagger (for Kai evaluation)
5. Karmic evaluator — Kai (scope/frequency/reversibility/specificity/synergy scoring)
6. Council router — Eth'erling (GM request → existing search → domain route → Kai value → confirm)
7. Lady Death — death processor + blueprint decay

**Design doc**: `GODHEAD-ARCHITECTURE-PLAN.md`

### Oracle (superseded by God-Head Council)

**Purpose**: Originally planned as full AI co-GM system. Now replaced by the God-Head Council architecture — multiple specialized AI agents with domain authority, not a single monolithic oracle.
**Status**: Concept absorbed into God-Head Council system.

## Provider Architecture

```
src/ai/
  types.ts              — AIProvider interface (text generation), ChatMessage, GenerateOptions
  providers/
    routed.ts           — RoutedProvider: AIProvider face over routedChatText (the wall decides)
    pod.ts              — PodProvider = RoutedProvider on the 'local' lane (the DEFAULT text provider)
    claude.ts           — ClaudeProvider = RoutedProvider on 'godhead' (or a given Claude lane)
    ollama.ts           — Ollama HTTP client (generateText + chat), OPT-IN only (AI_PROVIDER=ollama)
    index.ts            — getAIProvider() factory (AI_PROVIDER: pod default | claude | ollama)
  prompts/
    application.ts      — Prompt templates for application suggest + expand
  application-ai.ts     — Public API for application features
  copilot/
    types.ts            — CopilotAction, CopilotContext, EntityIndex
    context-assembler.ts — Campaign data retrieval + entity matching
    rules-search.ts     — GRO.WTH Repository keyword search
    action-parser.ts    — Parse action blocks from AI responses
    copilot-service.ts  — Main service (message handling, history)
  portraits/            — IMAGE generation (separate provider pattern from text AI)
    types.ts            — ImageGenerationProvider interface, all portrait types
    style-config.ts     — Style bible, negatives, campaign modifiers
    prompt-builder.ts   — Character data → image prompt (7 tiers)
    character-adapter.ts — Prisma model → portrait data adapter
    state-diff.ts       — Visual change detection
    portrait-service.ts — Main orchestrator
    providers/          — Local (ComfyUI) + Cloud (stub)
    workflows/          — ComfyUI JSON workflow templates
```

## Subscription Tier Classification

| Feature | Type | Basic Tier | Premium Tier | Local Model |
|---------|------|-----------|-------------|-------------|
| KRMA Validator | System-required | Always | Always | No (cloud only) |
| God-Head Council | System-required | Always | Always | No (Claude cloud) |
| Application AI | QoL | Metered | Unlimited | Yes |
| Campaign Co-pilot | QoL | Metered | Unlimited | Yes |
| Portrait Generation | QoL | Metered | Unlimited | Yes |
| Rule Arbiter | System-required | Always | Always | No (cloud only) |

## Design Principles

1. **Manual first** — Every AI feature must work manually before automation
2. **AI is copilot, not authority** — Players and GMs can always override
3. **Isolated from domain logic** — AI code lives in /ai, called via services
4. **Local-first** — Run on local hardware during alpha/beta, cloud option later
5. **Centralized co-pilot** — AI is overhead assistant, not per-field buttons
6. **Lean context** — Pre-retrieve only relevant data, never front-load everything

## DAYA v0.x — Work sessions (F-3 walking version, 2026-08-07)
The walking version of the DAYA being loop (memory: `daya-being-loop-2026-08-07`; spec: memory/daya-specs/F3-JEWL-WORK-SESSIONS-SPEC-2026-08-07.md). Big jobs become `DayaWorkSession` rows; an outer loop (`ai/copilot/work-loop.ts`, guarded-global) re-invokes JEWL with `JEWL_WORK_CYCLE` dispatches until HE sets status=done. Conversation interleaves (steering lands next cycle); several jobs round-robin; blocked↔forge-batch-watch wired; completion = quiet 2-3 line burst-in + Forge pointer. Deliberately absent: tick/cron semantics, budget caps, TTLs (rejected as micromanagement — completion bounds the run). Economics = OPEN systemic discussion (JEWL rides the subscription price). DAYA versioning: 0.x until launch (=1.0).

**Genesis is a dialogue (2026-10-12):** a character genesis opens in stage `PRODDING`; its cycles (`work-cycle-text.ts#planWorkCycle`/`buildProdCycleText`, carrying PROD_LAW: GM = storyteller, JEWL = crew; ask creative gaps, never mechanical/derivative; no answers inside questions; no building) may only call `raise_prod` / `end_prod_round` (runtime `allowedTools` + `toolOffered`; those two are hidden from every other dispatch). The GM answers / leaves open / delegates each prod; only the Build route leaves PRODDING; after Build the plan gains SETTLED / OPEN THREADS — DO NOT FILL / DELEGATED sections and JEWL records delegated fills via `record_delegated_choice`.

**Genesis perf pass (2026-10-12) — same shape, roughly half the wall time.** (1) *Trim, not reject:* every JEWL tool description ends with a `LIMITS:` line derived from its Zod schema (`tools/coerce.ts#describeLimits`, memoised specs so the cached tools+system prefix stays byte-identical); at the runtime boundary `coerceToolInput` ellipsises over-long strings at a sentence and coerces trivial shapes (a `duration`/`expiry` string → object; a `dataJson` object → string), logging `[tools] coerced <tool>.<field>`; `propose_forge_blueprint` repairs its nested body against `forgeDataSchemaFor(type)`. Identifiers (name/id/anchorQuote…) and arrays are never cut; the handler's own Zod parse still rejects anything genuinely wrong. (2) *Catalog-first only with a catalog:* a genesis build cycle reads `getGlobalCatalogSnapshot()`; at ≤5 stock rows across seed/root/branch/skill/traits/items the cycle's CATALOG line says so (naming what exists) and the dispatch withholds `search_catalog` (`excludedTools`); otherwise it asks for ONE bulk `search_catalog({queries:[…]})`. (3) *Born → awake:* a genesis session reaching `done` wraps the character as a DAYA entity if needed and sets `DayaEntity.status='ACTIVE'` (`services/character-genesis-born.ts`; Character.status untouched — review is still ratification). (4) *Unattended + concurrent loop:* genesis sessions are background (no SSE needed); the loop runs up to `JEWL_WORK_CONCURRENCY` (default 2) cycles at once (`work-loop-schedule.ts#pickSessionsToStart`), never two on one character, each session taking its own breather. (5) *429 resilience:* each tool-loop round retries 429/529/overloaded with jittered backoff (3 tries, SDK retries off — `ai/network/retry.ts`); a cycle that still fails on provider weather pauses its session 30 s and never counts toward the 3-failure auto-block. Unchanged: the 12-round cap, the prod stage, the wall.

**Blocks are campaign-agnostic archetypes; the instance carries NARRATIVE PAINT (Mike 2026-10-12).** Genesis kept drafting bearer-specific blocks ("Raised by Rosemary", "After the Key"). Now: (1) *Prompt law* — `services/block-archetype.ts#ARCHETYPE_LAW` (stranger test incl. legibility, 3 good/bad pairs, the August-rejected shapes, draft the archetype AND the paint in one proposal, pull-and-paint before drafting) rides in the `propose_forge_blueprint` description and in every genesis BUILD cycle (`work-cycle-text.ts#draftingGuidance`, with the campaign's reusable blocks and the session's REJECTED SHAPES). (2) *Validator at the tool boundary* — for every Forge type incl. items (locations aren't forged), `propose_forge_blueprint` extracts proper nouns (`extractSeedProperNouns`: mid-sentence capitalised words, recurring ones, multi-word names and their leading tokens, DB-name matches; stoplist of starters/kinship/calendar/game words so "Grandmother" stays legal) from the bearer's name, backstory, physical description and genesis brief plus campaign/location/character names (`block-attachment.ts#loadArchetypeBans`), scans name + body text (notes excluded), and rejects with the tokens + fields named; the rejection is recorded as an `ARCHETYPE REJECTED:` progress note. While a genesis builds, character-layer drafts must carry `characterId` + `attachmentStory` (≤600, may name people), optional `localName`; the paint lands on `CharacterBlockLink` with an origin history entry. (3) *Reuse first* — a draft whose (name,type) already exists in the campaign or stock is attached instead of duplicated; `attach_block` attaches an existing block/item with paint (stock pulled free). `place_item` stamps `sourceForgeItemId`/`story`/origin history on CampaignItem. (4) *Redraft* — `services/genesis-redraft.ts#withdrawDraftsAndRedraft` (GM/ADMIN; `POST /api/campaigns/[id]/genesis/[sessionId]/redraft`) withdraws the session's pending JEWL drafts via the shared `services/forge-withdraw.ts`, notes "drafts withdrawn: generalise per the archetype law — …" and resumes the session. (5) *Per-draft feedback* (Mike: "options for feedback for each one") — `requestDraftRevision` (GM/ADMIN; `POST /api/campaigns/[id]/genesis/drafts/[draftId]/feedback {note ≤600}`) withdraws THAT draft only, stores the note as `revisionNote` (+ sessionId) on its withdrawn tag, notes "GM feedback on <name> (<kind>): <note> — redraft it" (seed: JEWL may re-pick; with sealed memories, warns the sheet may need a rebuild) and resumes; `loadPendingFeedback` carries every note verbatim into BUILD cycles (GM FEEDBACK block) until JEWL drafts a new block of that kind. UI: FEEDBACK per row in `GenesisGmSteps` (overlay + JEWL work popup) → inline note + SEND → row shows REVISING… until the replacement appears. Not yet built: showing `localName` over the archetype name on character/item cards. GM-flagged JewlMistake rows are NOT auto-written (that table is the KRMA bounty ledger).

**Genesis completion stages (Mike 2026-10-12) — after the sheet, before Born: AGE → POSSESSIONS → SEEDS → WORLD_FACTS → VINES.** "Possessions, inventory etc. are things JEWL should be authoring when making a character too" + canon R3 (prose grants → possessions, NPC seeds, world facts). Walk: on a genesis in stage `BUILDING` or a completion stage, `update_work_session status=done` does NOT close the session — `daya-work-session.ts` calls `services/genesis-stages.ts#advanceGenesisStage` (leaving BUILDING: `dedupeBlockLinks` + `syncCreationFromBlockLinks` mirror the links into creation.seed/root/branches + traits; leaving a completion stage: stamp `_genesisStages`) and moves to the next stage still MISSING (`detectMissingStages`: AGE = birthCycle + identity.age = Σ instance years; POSSESSIONS = held items or `owns` edges; SEEDS = NPC seeds or place edges; WORLD_FACTS = stamp only; VINES = goals); Born after the last. Each completion cycle (`work-cycle-text.ts#buildCompletionStageText`) carries its stage law + FINISH line + the brief (with SETTLED / OPEN THREADS) and offers ONLY its tools (`COMPLETION_STAGE_TOOLS` + update_work_session / raise_prod / record_delegated_choice; the five new tools are STAGE_ONLY in runtime.ts): AGE `set_starting_age` (additive age, instance years must sum to the brief's AGE, roots ≤25); POSSESSIONS `grant_possession` (catalog-first: campaign → stock pulled free; paint = CampaignItem local name/story/origin history; no archetype → `propose_forge_blueprint` item archetype + paint, granted after approval; tiers equipped (region key of HER anatomy) / carried (holderId) / owned (`owns` deed edge, optional located_at); real lbs; owned items do NOT add to TKV — [NEEDS MIKE]) + search/pull/forge read tools; SEEDS `seed_npc` (shell, no model call; a LEFT_OPEN prod rides verbatim as UNKNOWN, an answer beside it is refused) + `seed_location` (Location seed, sources = the GM's typed world messages — `loadGmWorldMessages`: GM-typed, fiction by the wall, no [system]/[ambient]/table rows — cited by id; `owned` adds the deed); WORLD_FACTS `establish_world_facts` (same GM messages in the cycle); VINES `author_vine_goal` (GOAL third only, `authoredBy 'ai'`, slots = seed `grovineSlots` ?? 3, +1 for the Ambitious nectar, ≤5; emits goal.created for custodian triage; Resistance/Opportunity never written). Progress ladder gains age/possessions/seeds/worldfacts/vines. **completeCharacter** (`services/genesis-complete.ts`, `POST /api/characters/[id]/complete`, campaign GM/ADMIN): for a BORN character (finished genesis, SKETCH, or DayaEntity ACTIVE) dedupes links, syncs the creation view, and opens a background genesis session at the first missing stage running only the missing ones (prior prod decisions incl. left-open threads ride in the plan); 409 while one runs; nothing missing → nothing opened. `sketch-genesis#markForDeepening` now calls it (the deepen-later hook). **Seed numbers win** (canvas audit 2026-10-12, Violet d6 vs Human d8, Frequency 1/1 vs 40): `genesis-sheet-sync.ts#applySeedToSheet` sets creation.seed.baseFateDie = the seed's die and Frequency level = the seed's pool (current follows a full pool; a spent pool keeps what is left, clamped) — run when the sheet stage ends and by completeCharacter, each correction logged (`[genesis-sheet-sync] … corrected from seed`) and returned as `seedCorrections`.

## ai/network — the model-routing layer (2026-08-23)
One chokepoint for every AI call: `app/src/ai/network/` (design: `AI-NETWORK-DESIGN-INTENT-2026-08-23.md`, economics: `AI-ECONOMICS-2026-08-23.md`). Lanes: `judgment` (JEWL tool-loop, Sonnet + prompt caching), `classify` (ambient gate, Haiku), `grunt` (work-cycle chores, Haiku — flip via `JEWL_WORK_CYCLE_LANE`), `godhead` (deep-reasoning text), `local` (company-compute serverless vLLM = the wall's inner face). **The wall (Mike 2026-10-12): cloud = Soul pillar (heavy reasoning), local = Spirit pillar (live table + gatekeeper).** Every task declares a REQUIRED `contentClass`: `fiction` (backstory, memories, scenes, in-character speech, drafts) may reach a cloud lane only through `prepareCloudText()` = `enforceWall()` (stripAndForward + assertClean from `daya/sanitize`) then `toneFilter()` (`ai/network/tone-filter.ts`, the LOCAL tone-down: regex screen, clean text free; flagged paragraph chunks softened by the local lane, cached by sha256, fail-closed placeholder — the raw text never crosses on filter failure); `table` (ambient mic, OOC chatter) and `real` (anything about the actual humans) route LOCAL or throw `WallViolationError` — never cloud. There is no trusted bypass class. `routedChatText()` (`ai/network/chat.ts`) is the door services use (route → wall → transport → metering). Lint `ai/network/__tests__/no-direct-cloud.test.ts` fails on any direct cloud use outside the transports (`ai/network/`, `ai/providers/claude-tools.ts`) — no pending list — and on any caller of the tool-use transport that does not call `route()`. DAYA's `model-client.chat()` requires a content class and sends every Claude-backed tier through `routedChatText` once (table/real → local or refused). `routedChatText` takes multi-turn/image messages, a model override and an injected client. `references/describe` describes identity-lock photos of REAL people: local vision only, a cloud setting is refused (422). **Audit (grep):** every request that actually reaches Claude logs exactly one `[wall→cloud] caller= lane= class=fiction bytes_in= toned=yes|no chunks_toned= campaign=` line (`ai/network/audit.ts`; emitted in `routedChatText` and the tool-use transport `callClaudeWithTools`, whose `audit` option is required); every refusal logs `[wall✗] caller= class= reason=`. Never any text. Every call meters to the unified `AiCall` ledger (tokens incl. cacheRead/cacheWrite, list-price estimate, campaignId) — report: `npx tsx scripts/ai-costs.ts`. Every JEWL dispatch also appends a full tool-loop trace (`app/traces/*.jsonl`, system prompts deduped under `traces/systems/`) — the fine-tune corpus for the GROWTH-native local model (target division of cognition: game runtime local; Claude = simulation/psychology/Godhead-balance/company consults). Config surface: `AI_JUDGMENT_MODEL`, `AI_CLASSIFY_MODEL`, `AI_GRUNT_MODEL`, `AI_LOCAL_BASE_URL/_MODEL/_API_KEY` (legacy `ANTHROPIC_MODEL`/`DAYA_L1_*` still honored).

## Text generation — RunPod Serverless local lane (LIVE; Qwen3.8 promoted 2026-08-25)
Endpoint `growth-text` (`y0lkvhwp0xkzrs`, worker-v1-vllm **v2.25.2**, template `jh3qgfbp9o`, volume o5y6of5tje, scale-to-zero, flashboot, H100/A100-80/H200 class, **`minCudaVersion: "13.0"`** — required: recent worker images are CUDA-13 builds that crash at torch init on older-driver hosts). Serves `/openai/v1/chat/completions` as model `growth-local` — **Qwen3.8-27B-abliterated** (promoted after the 2026-08-25 A/B: richer JEWL prose + clean structured tool calls vs 3.6, which also exposed that the hermes parser silently leaks tool calls as text on this stack — **parser must be `qwen3_coder` + reasoning `qwen3`**). FP8 on-load + enforce-eager + gpu-util 0.90 (BF16-unquantized OOMs at init). Warm latency ~1.3-4s. Cold-start-safe call pattern: async `POST /v2/{id}/run` with `{input:{openai_route,openai_input}}` + poll `/status/{id}` (sync HTTP drops ~180s). Qwen3.6-27B-abliterated stays on the volume as rollback + A/B baseline; 3.8 doubles as the GROWTH fine-tune base. The retired H100 pod's DAYA-vLLM role lives here; volume 280GB.

## Portrait generation — RunPod Serverless (2026-08-08)
Portraits now run on RunPod Serverless endpoint `growth-portraits` (`qr4r1dkgw3uyhf`, worker-comfyui 5.8.6-base, volume o5y6of5tje, scale-to-zero, flashboot). `providers/serverless.ts` (`ServerlessProvider extends LocalProvider`) swaps only the ComfyUI transport: uploads ride the /run payload as data-URLs (refs downscaled to 1024px), completion polled via /status, images returned base64. Selected whenever `RUNPOD_ENDPOINT_ID` is set. All templating/saving/edit logic inherited from LocalProvider. Volume model layout bridged with relative symlinks (`models/* -> ../ComfyUI/models/*`). The dedicated pod is legacy for portraits. Memory: `serverless-portraits-2026-08-08`.

## Portrait generation — Qwen-Image-2.1 provider (2026-10-13, behind flag, endpoint NOT built yet)
Ruling `ruling-switch-to-qwen-image-2-1-2026-10-13`. `PORTRAIT_PROVIDER=qwen21` + `RUNPOD_QWEN_ENDPOINT_ID` (+ `RUNPOD_API_KEY`) → `getLocalProvider()` returns `Qwen21Provider` (`providers/qwen21.ts`, same serverless transport as FLUX.2); default `flux2` keeps `qr4r1dkgw3uyhf` as rollback. Two steps, never mixing photos and style refs in one call: (1) identity lock = photos as `<image1>..` + a 3-sentence prompt, blank grey, no style words; (2) style pass = lock as `<image1>` + up to 5 style refs as `<image2>..<image6>` + "keep the face… of <image1>" + a 2-sentence style line from getFlux2StyleProse. Body = styled bust as `<image1>`, EmptyLatentImage 832×1216, studio backdrop. Edits = instruction + "Change nothing else."; masks applied by post-compositing (`mask-composite.ts`) because TextEncodeQwenImage21 has no mask input — the model still repaints the full frame, only the painted area is kept. **Localized designer edits (2026-10-15, `edit-localize.ts`):** with no painted mask the designer's edits (`localize`, set by the edit route when `target` is given) make their own — the repaint is pinned to the base's canvas (EmptyLatentImage at its size), the vision lane (`describeImage`, contentClass `real`, pod) is asked for a 0..1000 box round the change on the edited image, then a SECOND, FINE look: the zoom window round that coarse box (≥ 22 % of the long side) is cropped at full resolution and asked again, and the answer is mapped back to frame fractions — the mark is large in the crop, so the box is precise (coarse boxes on Violet's navel ring sat ~4 % high; the fine box landed 35×60 px on the ring). The fine box, padded 30 % + 0.8 % of the frame, IS the mask (fine look fails → the coarse box padded wider; no coarse box → whole repaint kept, `metadata.localized: 'none'`). The repaint is colour-matched to the base round the box (`matchColorInRegion`, per-channel mean shift) before compositing, and the pure repaint is kept at `finetune/repaint/<seed>.png` for lab reruns. A pixel-difference mask was tried and DROPPED (15 Oct, probe on the real pair): a repaint re-renders every highlight and fold, and the bra's sheen out-scored the ring (p95 38 vs 21), so no threshold separates mark from noise — it was pasting bra highlights and abdominal shading ("the body still gets altered a little"). Measured on the real pair after the two-look fix: head/legs/hips/chest within 0.1–0.3 levels of the base, only the navel region changed. **POLISH = APPROVE's clean re-render (15 Oct, `Qwen21Provider.polish`, route `/api/portraits/polish`):** the approved face or body image is `<image1>` AND the init latent (`resumeFrom` at `QWEN21_POLISH_AT`, default 0.55) with the active LoRA blend and `buildQwen21PolishPrompt` (keep everything of `<image1>`; one continuous finish; no seams, patches, artifacts). Violet lab 15 Oct (`style-refs/lab/polish-body`, `polish-face`): the pale rectangle a composited scar edit had left behind the shoulder is gone, tattoo/ring/scar kept, identity kept; 0.7 left a faint remnant, 0.55 cleaned fully → 0.55; ~13 s warm, ~68 s cold. **No style LoRA on edits** (Mike, 15 Oct: the base already carries the look; the LoRA only restyled the patch and pulled the repaint off the base; `QWEN21_EDIT_LORA=on` restores it); edits never had the mid-generation ink. Proven on Violet's navel piercing: ring on, body untouched, locate ≈1.3 s warm. Workflow `workflows/qwen21-edit.json`: UNETLoader → QwenImage21Cache → KSampler (25 steps, cfg 1, euler/simple) on TextEncodeQwenImage21's latent (`resolution` = INT pixel budget 1024, aspect follows image_1). Needs ComfyUI ≥ 0.37 (custom worker image). Scripts: `scripts/qwen21-validate-workflow.ts` (object_info check via `QWEN21_COMFYUI_URL`, else prints the workflow), `scripts/qwen21-smoke.ts` (Violet lock → style, billable).

### GROWTH image style — three layers (Mike ruled 2026-10-13, "Lets do it")
LIVE 13 Oct: **single pass** (photos + painted prompt) is the default (`QWEN21_STYLE_MODE=single`); a second pass over a generated image degrades into HDR grain. Consistency across campaigns comes from three layers, each with one job:
1. **MEDIUM** — `GROWTH_MEDIUM` in `ai/portraits/style-config.ts`. The rendering technique only, fixed forever, subject-agnostic (no skin tone / hair / make-up / species words), ≤ 4 sentences. `getFlux2StyleProse()` = MEDIUM + growth mood (legacy).
2. **MOOD** — `CAMPAIGN_MOODS` (growth, horror, dark fantasy, high fantasy, sci-fi, romance, mystery, western, gothic, nautical, steampunk). Structured `{atmosphere, palette, shadows, accent}` → `renderMood()` = 2 sentences; a mood may only set palette temperature, shadow hardness/depth, accent colour family and one atmosphere word. Resolution (`resolveMoodKey`): `CampaignStyleConfig.styleMood` → `Campaign.genre` (free text: key or alias found in it, longest first) → `'growth'`. `portrait-service.resolvePortraitMood()` fills `styleMood` from the campaign (directly or via the character) for generate; the edit route passes `mood` to `editImage`. Replaces the old `CAMPAIGN_THEME_MODIFIERS` (`getThemeModifier()` now returns mood prose).
3. **FINISH** — `ai/portraits/finish.ts`, deterministic sharp post-process on every saved Qwen output: grade (saturation ×0.88, blacks lifted to 0.045, #0f2a3a shadow tint at 0.18 × darkness², +0.02 warm mids), monochrome grain seeded from the job seed (amount 0.025 — same input + seed = identical bytes), soft vignette (0.22 at the corners from 0.45 radius). `finishToken()` = circular mask + 2-px Terminal teal #22ab94 ring on RGBA (not wired into the designer yet). All numbers in the one `FINISH` object; `GROWTH_FINISH=off` bypasses.

**Ink pass (FINISH.ink, Mike 13 Oct: "slightly exaggerated pen lines. subtle but noticible")** — runs after the grade and before the vignette and grain, so the grain sits on top of the lines. It works on the float RGB planes as pure TypeScript and is deterministic. It runs Sobel on luminance blurred at two scales, fine (σ ≈ 0.7·width px) and coarse (σ ≈ 2.5 px); both scale with width/832, so the look holds at any resolution. A pixel inks only when the fine edge clears `threshold`, a luminance-step unit, and the coarse scale also sees an edge. That catches the jaw, nose, nostrils, lip line, eyelids, hair masses and the silhouette, and ignores pores, freckles and flat skin. Smooth mid-tones need a stronger coarse edge. The line sits on the dark side of the edge, so it reads as a thin stroke rather than a halo. Pixels that are already dark (lashes, brows, deep hair) are left alone so they don't thicken. Inked pixels darken toward #141413 by `amount`·mask. On strong (silhouette-grade) edges only, the lit side picks up a faint luminance-free shift in the shadowTint hue (`teal`). Defaults are `{ amount: 0.55, width: 1.5, threshold: 0.06, teal: 0.2 }`. `GROWTH_FINISH_INK=off` or `amount: 0` disables the pass. To preview offline with no generation, run `npx tsx scripts/finish-preview.ts <raw.png> [--ink A] [--out DIR] [--seed S]`. It writes `<name>-finished.png` and `<name>-compare.jpg` (raw | ink 0 | ink A | ink 1.5·A).

**Prompt assembly:** `buildQwen21LockPrompt(photoCount, painted, mood?, medium?)` = identity/framing sentences + MEDIUM + MOOD + blank backdrop. Body = framing + MEDIUM + MOOD + studio wall. Edits = instruction + one-clause medium reminder (`GROWTH_MEDIUM_REMINDER`) + MOOD + "Change nothing else."

**Raw copies:** the provider saves the finished image at the normal path and the RAW model output at `<dir>/raw/<name>.png` (`rawSiblingPath`). Chained steps (style pass, body, edits, mask composite) consume the raw, so the finish is never applied twice. The raw set is the future LoRA training set.

**Style lab** (`app/scripts/style-lab.ts`, billable): `npx tsx scripts/style-lab.ts --seeds 4 --mood horror [--seed-start 7] [--photos DIR] [--out DIR] [--medium-file PATH] [--no-finish]` → single-pass lock per seed via `Qwen21Provider.renderLock()` (no savePortrait), `seed-<s>.png` + `raw/seed-<s>.png`, `sheet.jpg` (row 1 raw, row 2 finished; `contact-sheet.ts`), `prompts.txt`, `lab.json`. Default out `style-refs/lab/<timestamp>-<mood>/`, default photos = Violet's two.
**Approve** (`app/scripts/approve-image.ts <png> [--note]`): copies the RAW version into `style-refs/approved/<date>-<mood>-<name>.png` + sidecar JSON (source, raw, seed, mood, date). Note: the `refs`/`prose` two-step modes read `style-refs/approved/*` as style refs.

**BASE-LOCK GATE** (`ai/portraits/lock-gate.ts`, 2026-10-13; ruling `ruling-base-lock-fixed-composition-2026-10-13`: "keep the framing and pose exact regardless of character"). The painted look words still pull costume / a 3/4 pose on ~3 seeds in 10, so `Qwen21Provider.lockIdentity` (painted/single mode only) judges each RAW render with `checkBaseLock(buf)` and re-rolls deterministically on seed S+1, then S+2 (`LOCK_GATE_MAX_RETRIES = 2`); first pass wins, else the best-scoring attempt is returned flagged; only the chosen attempt is saved. Checks (strict JSON `{clothed, tilted, framing_ok, eyes_ok}`; score = checks passed / 4): no garment/strap/choker/jewellery, square to camera, head-and-shoulders with headroom, eyes open to camera. **Privacy wall:** the lock comes from photos of a real person, so the judge is the LOCAL vision model only — Ollama (`OLLAMA_URL`, default 127.0.0.1:11434) `LOCK_GATE_VISION_MODEL` (default `qwen2.5vl:7b`); a non-loopback/private/tailnet host is refused; the RunPod text lane (openai-compat) takes no images and is not used. 20 s timeout; any error fails OPEN (`pass: true`, reason `gate unavailable: …`). Measured 13 Oct: ~20 s warm per check at 768 px (`LOCK_GATE_DIM` lowers it); verified on 3 lab images (bare/square PASS; anchor blouse FAIL clothed; seated 3/4 FAIL clothed + off-pose). `metadata.gate = { pass, reasons, attempts, seed, score, bypassed? }` reaches the designer via /api/portraits/generate → caption `gate: pass` / `re-rolled ×N` / `flagged: <reason>` + note "The base came back dressed or off-pose; tap regenerate." `QWEN21_LOCK_GATE=off` bypasses. Tools: `scripts/lock-gate-check.ts <img…> [--timeout MS]`; `style-lab.ts --gate` prints PASS/FAIL + reasons under each tile.

**Style-LoRA corpus pipeline** (2026-10-13; taste notes items 8–10): the GROWTH look moves into a LoRA trained on a large, diverse corpus. Four stages: (1) CONTENT here — `ai/portraits/corpus-prompts.ts` `buildCorpusPrompts()` = 130 plain prompts (people 48, beings 24, creatures 12, items 20, scenes 20, groups 6) across 13 shots and 8 genres, lighting written into every setting, NO art-medium words, deterministic seeds (FNV-1a of the id), figures 832×1248 / scenes 1248×832 / items 1024²; `Qwen21Provider.generateContent()` = zero-image text-to-image on EMPTY_LATENT, prompt + "Sharp, well-lit, clear subject." only, finish skipped (`runStep/saveStep {finish:false}`); runner `app/scripts/corpus-content.ts [--groups a,b] [--limit N] [--out DIR] [--resume] [--dry-run]` → `style-refs/corpus/content/<id>.png` (raw) + `manifest.json` + `sheet-<group>.jpg`, sequential, billable; (2) STYLE TRANSFER on a pod — QwenStyle (Qwen-Image-Edit-2509 LoRA, arXiv 2601.06202) re-renders each content image from the gold-standard anchor; (3) CULL from contact sheets (Mike); (4) LoRA training.

**Community style-LoRA blend** (2026-10-13): every Qwen 2.1 generation (locks, restyle, describe, body, edits) can carry a stack of community style LoRAs. `Qwen21WorkflowOptions.loras` = `{ file, strength, trigger? }[]`; `buildQwen21Workflow` inserts one `LoraLoaderModelOnly` per entry, chained `UNET → LORA_1 → … → LORA_n`, and rewires every former `['UNET', 0]` consumer (today only `CACHE.model`, the QwenImage21Cache) to `LORA_n`; triggers are prepended to the prompt once each, in order (`"cine1p, Inklingv2, <prompt>"`). No LoRAs = byte-identical workflow. Config: env `QWEN21_LORAS` = `file:strength[:trigger],…` parsed by `parseQwen21Loras()` (strength 0–2, `*.safetensors`, bare file name), e.g. `cine1p_c1-st4000.safetensors:0.7:cine1p,Inklingv2-qwen21_c1-st6000.safetensors:0.25:Inklingv2`. Precedence in `Qwen21Provider`: per-call `loras` → `setLoras()` instance override → env. `generateContent()` (plain corpus content) never takes LoRAs. The spec is saved in portrait metadata as `loras`. Scripts `style-lab.ts`, `style-lab-describe.ts`, `corpus-restyle.ts` take `--loras "<spec>"` (`""` = none), record it in lab.json/manifest/prompts.txt and label sheet tiles ("cine1p 0.7 + Inklingv2 0.25"). Files live on the volume at `/runpod-volume/models/loras`. Licences: Cinematic Painterly (`cine1p`) = CivitAI "Image + RentCivit" commercial use, credit required, derivatives allowed; Inklingv2 = Apache-2.0 per its author.

**THE GROWTH STYLE LoRA — grwthpaint v1** (trained 2026-10-13, baseline ruled 2026-10-14): a Qwen-Image-2.1 style LoRA (ai-toolkit `arch: qwen_image_2`, rank 32, 3000 steps, H100, ≈$3.70) on the 130-image approved corpus (`style-refs/approved/corpus-2026-10-13`, captions = `grwthpaint, <plain content>` with GROWTH race names stripped — strictly style transfer). File: volume `models/loras/grwthpaint_v1.safetensors` (+ `-s2000` lighter alt); local copy + training config in `style-refs/approved/`. **Baseline (Mike, 14 Oct, from the Violet seed-8 strength sheet `style-refs/lab/2026-10-14-violet-lora-ab` and a seed-21499 check, then in-app play — 0.9 "was too much"): strength 0.7 on EVERY Qwen generation, with the MEDIUM paragraph STRIPPED from the lock prompt** — the trigger word carries the look; at 0.25–0.5 the medium words still pull costume and half-length framing, at ≥0.75 they are redundant. Code: `GROWTH_STYLE_LORA` (0.7) / `hasGrowthStyleLora()` in `qwen21-workflow.ts`; `qwen21LorasFromEnv()` returns `[GROWTH_STYLE_LORA]` when `QWEN21_LORAS` is UNSET (`none` or `""` = no LoRAs, a spec = that blend), so locks, style, body, edits, describe and restyle all carry it (only `generateContent()` excludes LoRAs); `Qwen21Provider.renderLock()` passes an empty medium whenever the style LoRA is in the active blend (an explicit `opts.medium` still wins) and records the blend in the lock's metadata; `style-lab.ts` applies the same rule (`--medium-file` overrides). Open: the body/style/edit/describe/restyle prompts still carry their own medium wording alongside the LoRA; non-person subjects under the bare lock lead can grow a face (use the object lead); Qwen-Image-2.1 licence check before commercial use.

**BASE LOCK = POSE SKELETON + FIXED CANVAS + GATE** (2026-10-14, Mike: "we need everyone to be same framing and pose"; "We need it to be solid for the base. Do the reference"). Root cause of the drift: Qwen 2.1 copies a reference's framing, and a user's identity photo is whatever they uploaded (Violet's = a tilted half-length selfie in a blouse), so the prompt fought the photo on every lock; the style LoRA cannot be started late to protect composition (it lays the paint down in the first 1–2 of 25 steps — `loraStart`/`QWEN21_LORA_START` exists but stays 0). The fix uses the model's native keypoint-map support (Qwen-Image-Edit-2509+): **(1) pose reference** — `src/ai/portraits/refs/lock-pose-grey.png`, an OpenPose COCO-18 skeleton (controlnet_aux colours) of the face-tight passport frame on MID-GREY, drawn by `scripts/lock-pose-skeleton.ts` (scale 1.7, shoulder line at 116% = just off the bottom edge: face large and centred, frame ends at the neck). `Qwen21Provider.renderLock()` appends it as the LAST image (`defaultLockPoseRef()`, cached; `QWEN21_LOCK_POSE_REF=off` or `opts.frameRef=false` disables, an explicit image replaces it) and `buildQwen21LockPrompt(..., { frameRef })` adds `lockFrameRefClause(<imageN>)` ("copy the exact pose and framing of the pose skeleton in <imageN>… fills the whole canvas… draw no skeleton"). A photoreal mannequin in that slot became the subject; a BLACK skeleton map pulled fog, blouses and insets (0/6); grey held pose and bareness on 6/6 (`style-refs/lab/2026-10-14-pose-ref-test-v2|v3|v4`). **(2) fixed canvas** `QWEN21_LOCK_SIZE` 832×1040 (4:5) — the lock no longer inherits the photo's aspect. **(3) gate** (`lock-gate.ts`): framing criterion = tight face crop ending at the neck, timeout 120 s (45 s failed open on a cold lane and let a clothed lock through). `style-lab.ts`: `--frame-ref PATH` / `--no-frame-ref` (default = the shipped skeleton). LoRA strength history that day: 0.6 → 0.9 → 0.7 → 0.65 → 0.9 (finish OFF: its Sobel ink doubled the LoRA's lines) → **0.7 with the skeleton**.

**MID-GENERATION INK = the live base lock** (2026-10-14, Mike: "halfway through the generation make the lines and then just have the generation continue with the lines in place" → best-so-far at 75% → "set lora to .70 and ink at 80%"). The finish layer's ink is no longer a post-process: `Qwen21Provider.renderLockInked()` runs job A = the lock to `QWEN21_LOCK_INK_AT` (default **0.8**) of the steps with `KSamplerAdvanced` snapping to the clean prediction (`buildQwen21Workflow({stopAt})`), draws `finish.ts inkImage()` (lines only, `FINISH.ink` defaults: amount 0.55, width 1.5, threshold 0.06, teal 0.2; `ink.color` hex overrides the near-black pen) on that soft image, then job B VAE-encodes the inked image, re-noises it to step k's level and runs the rest (`{resumeFrom: {image, at}}`). `lockIdentity` uses it for every painted lock (gate judges the final; `metadata.inkAt`); `off`/0 = the plain single-pass lock. One LoRA strength throughout (**0.7**): a per-stage strength on the resume job (`style-lab --ink-lora-b`) made no visible difference. Prompt levers tried the same day and rolled back: a "lifelike portrait … photographic realism" lead and a firmer realism line — both "went too far"; the kept text is `LOCK_REALISM` (the GOLD medium's one "almost passes for a photograph" sentence), riding after the identity line whenever the medium is stripped. Lab: `style-lab --ink-mid 0.8 [--ink-amount/--ink-threshold/--ink-width/--ink-color]`, sheets `sheet.jpg` (+ ink rows) and `sheet-ink-stages.jpg` (soft/inked). Strong ink (amount 1, threshold 0.03, width 2.5) "all fail"; 40/50% re-paint the lines away. Reference image: `style-refs/lab/2026-10-14-ink-mid/lora-0.75-realism/inkmid-0.75/final-seed-29569.png`.

**GROWTH STYLE v1 + the running training set** (2026-10-14, Mike: "Calling this v1 growth style… generating 7 diverse images… the first 7 into our running training data"). v1 = grwthpaint_v1 at 0.7 + mid-generation ink at 0.8 + the stripped-medium prompt (lead + `LOCK_REALISM` + mood). `Qwen21Provider.renderStyled(prompt, seed, size, {inkAt?, loras?})` renders any described subject text-to-image on that recipe (no photos/skeleton). `scripts/style-v1-set.ts` holds `V1_SET` (seven corpus-voice prompts: person, being, creature, item, landscape, interior, group; lighting written in, no lore names; deterministic `corpusSeed(id)`) and writes `style-refs/training/v1/<id>.png` + `<id>.txt` (`grwthpaint, <plain caption>`), `stages/` (soft + inked), `manifest.json`, `sheet.jpg`; re-runs skip existing ids. Add entries to `V1_SET` to grow the set; it is the seed of the next LoRA round (v2). style-refs is not in git.

**LIGHT AXIS + THE GOLD PEN** (2026-10-14). Mike's hypothesis, tested with `scripts/style-light-axis.ts` (3 subjects × 5 lighting steps, fixed seeds, `style-refs/lab/2026-10-14-light-axis`): the v1 LoRA renders dark/gritty scenes near-photographic and bright/magical scenes painterly — "a hidden gem that matches GRO.WTH" (the corpus was all moody; daylight is out of its distribution). Consequence for the ink: a dark pen on a bright scene draws black outlines (anime look), so `finish.ts` now has a second, LIGHT pen drawn on the LIT side of edges (`ink.lightColor`, default GROWTH gold `ffcc78`) and `ink.auto` picks it when the midpoint's mean luminance ≥ `autoThreshold` 0.42 (measured: Violet lock 0.26 → dark pen; noon market 0.47, snow fox 0.55 → gold). The light-pen mask demands a real coarse edge (no stipple on sky/walls). Mike: "I like the gold" → ON by default in `FINISH.ink`; `auto:false` restores the dark pen everywhere. Lab: `style-lab --ink-light HEX [--ink-auto]`, `scripts/style-light-ink.ts` (dark vs gold vs off-white on the bright market + fox). Training-data caveat: bright renders also drift toward anime (six-legged fox, greenhouse being) — cull before v2.

**REFERENCE PHOTO PREPARER** (2026-10-14, Mike: "design and implement the photo preparer that crops to the face"): the input-side half of the fix above. `ai/portraits/photo-prep.ts` — `checkPhoto(buf)` = ONE vision call on the inside-the-wall lane (`describeImage`, caller `photo-prep`, contentClass `real` → Claude refused) returning the main HEAD's box (0–1000 normalised, hair top to chin) + flags (faces, frontal, eyes_visible, obstructed, blurry) → `parsePhotoCheck` → human-readable `warnings`; `passportCropRect`/`passportCrop(buf, box)` = pure sharp math: a 4:5 window with the HEAD box (hair top → chin; VL models return heads far more consistently than brow-to-chin faces) at `HEAD_FRACTION` 0.55 of the height, centred, its centre at `HEAD_CENTRE_Y` 0.50 (hair top ≈ 22%, chin ≈ 78%, as the skeleton frames it), SHRINK-TO-FIT when the window would leave the photo (real pixels beat padding — a mirrored pad put an upside-down ghost head above Violet), a last sliver edge-replicated, output `QWEN21_LOCK_SIZE` 832×1040 JPEG; `preparePhoto` = both, never throws (`cropped:false` → original used, `check.unavailable` says why). `services/reference-photo.ts` — `storeReferencePhoto(userId, raw)` (normalise ≤2048 JPEG, write `<uuid>.jpg`, prepare → `<uuid>.prep.jpg` + `<uuid>.prep.json`, return the ORIGINAL path + `prep`), `prepareStoredReference(webPath)` (idempotent re-prep), `deleteReferencePhoto` (all three files); `POST/DELETE /api/references` are thin wrappers and the upload response now carries `prep: {cropped, path?, check}`. `Qwen21Provider.renderLock()` → `preferPrepared(webPath)`: sends the `.prep.jpg` sibling when it exists, prepares older uploads on the fly (one vision call, cached on disk), `QWEN21_PHOTO_PREP=off` or any failure → the original. `CharacterTab` shows the check's first warning under the thumbnail (hover = all). `style-lab.ts --prep` runs the same preparer on lab photos and saves crops + checks under `<out>/prep/`.

## Reality Simulation (founded 2026-09-02; Unit 1 shipped 2026-09-05)
Authority: `REALITY-SIM-DESIGN-2026-09-02.md` (memory `reality-simulation-design-2026-09-02`). DAYA is the whole simulation pooling for an entity, not the entity. Frame: a PREDICTION ENGINE for the GM; Body/Spirit/Soul = JEWL/GM/DAYA; sub-agents = faculties (Wit rules · Wisdom forecast · Willpower hold/reconcile) × domains; GM-flow time; render-distance LOD with a full-history floor; async scene-first wave; authority ledger > GM > sim. Walking version = combat rounds (6 s). **Unit 1 (built):** one round through the engine — see module_registry `sim/`. Model use in v0: branch planning only (`sim.plan`, L1 local lane, probe-gated; heuristic fallback). Not yet model-driven: ordering's Layer-5 call, DR derivation, damage values, physical sim (falling/projectiles), the outward wave.

## Perception — REACH + NOTICING world-sim call (units 6+7, 2026-10-10; behind PERCEPTION_REACH, default OFF)
Rulings: memory `ruling-passive-active-perception-familiarity-2026-10-08` (Q5 reach = the LLM simulates it; Q7 thoughts only via a mind-reading sense; Q8 attention; noticing threshold = LLM judges). Module `sim/senses/reach.ts` (pure + injected model), wiring `services/perception-reach.ts`.
- **Call:** ONE call per canon event, every being in range batched (chunks of 12). LOCAL lane via `ai/network` `routedChatText()` (Mike 2026-10-12; no local lane configured → the stub, never cloud), caller `perception-reach`, content class `fiction`, temperature 0, maxTokens 40 + 40/being, system prompt cached. Inputs per being: organs + condition per sense (`SenseProfile`), non-physical (mind) senses, place, focus (encounter plan note, else ACTIVE goals), Wisdom. Event: kind (narration/speech/action/thought), text, source, target, place, volume/concealment cues.
- **Output:** JSON array `[{id, reach, via[], noticed, salience}]`, Zod-validated; hard laws applied after (only senses > 0 carry; thoughts only via a mind sense; no reach → not noticed); a being the model omits gets the stub verdict.
- **Fallback:** time cap `PERCEPTION_REACH_TIMEOUT_MS` (default 4000) — timeout, transport error, no JSON or Zod failure → the deterministic stub (`stubVerdict`) for the whole event. Never throws. Flag off → the stub is never even consulted by the hooks (behaviour pinned byte-for-byte in `perception-reach.test.ts`).
- **Hooks:** `declareCanon` witnesses; encounter round memories (one call per narrated act, all in parallel); table legacy `deliverToTable`; table split `runBeats` — the LISTEN beat: a stretch waits for its verdict, never the answer clock (an answer flushes that being's waiting stretches as heard).
- **Latency (estimate, not yet measured live):** Haiku, ~500–900 input tokens + ~40 output tokens/being → ~0.8–2 s per event; an encounter round = acts in parallel ≈ one call's latency. Worst case the 4 s cap, then the stub.

### Visible form — the perceived feed line (perception unit 8, 2026-10-10)
Ruling Q6 (feed = the entity's memory) + Q7 (visible form). Module `services/visible-form.ts`. Deterministic first: speech heard poorly keeps each word with probability = hearing clarity (seeded RNG keyed on the memory row id, so a row always renders the same); a run of missed words is one `{gap}` piece. Entities named by the viewer's IDENTITY familiarity (F0 generic, F1–F2 short description, F3+ name). Thoughts only for the thinker or via a mind sense.
- **Model call (only for a poorly seen ACTION / sim act):** classify lane via `route()`, caller `visible-form`, temperature 0, maxTokens 40, 3 s cap; used only when `PERCEPTION_REACH=on` (else never). Prompt: one ≤12-word vaguer sentence, actor = "someone", no names/numbers/senses/doubt. Held by `lawfulRewrite` (one line, ≤16 words, no digit, no "distort", no name the viewer does not know at F3+) — refused or failed → deterministic `fallbackVague` ("someone <verb>"). Smoke (Haiku, 2 calls 10-10): "Someone swung something and moved toward an opening." / heard-only "Something heavy splashed down into the darkness below." — both lawful.
- **Cache:** the render is stored on the row (`DayaMemoryEntry.visibleForm` = {sig, form}); a hit costs no call. `correctCanon` clears it.

## SKETCH genesis — improvised NPCs in one call (2026-10-12)
Ruling: [[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]] "Speed tiers" — sketch NPCs "need a mechanically valid sheet as fast as possible". Module `services/sketch-genesis.ts` (+ pure `services/sketch-genesis-rules.ts`). Entry points: `POST /api/campaigns/[id]/npcs/sketch` (202 + characterId; poll `GET …/npcs/sketch/[characterId]/status`) and the JEWL tool `sketch_npc({seedText})` (TABLE lane only — `runtime.ts` `TABLE_ONLY_TOOLS`; never offered in a work cycle).
- **One model call:** `routedChatText` caller `sketch-genesis`, lane `judgment`, class `fiction`, maxTokens 1400, temp 0.5 → {name, persona, voice, 3–5 memories, seedName, 8 attribute levels, ≤8 skills, ≤2 trait hints}. No JEWL work loop, no prods, no Forge drafts, no GM pause. Input screened (`assertLawfulInput`), output screened (routedChatText); a withheld answer fails the job.
- **Repair, never reject:** attributes clamp 1–20; Frequency comes from the seed; skills 1–20 with die→tier (d2/d3 → d4); bad governors → focus; text clipped; memories in game vocabulary (sealLint HARD) dropped; unreadable JSON → bare stock sketch named "Stranger".
- **Priced:** seed = campaign/global published seed by name, else stock Human (paper-catalog fallback), via `applyCreationGrants`; TKV = `lib/kv-calculator` (shared with the ledger); `fitToBudget` lowers skills then attributes until TKV ≤ the campaign's fluid KRMA (`getCampaignEconomy`); floor = the bare seeded sheet (Human ≈ 188), refused up front if even that does not fit. The TKV is invested through `crystallizeEntity` (campaign → character wallet, `CHARACTER_INVEST`); ledger code untouched.
- **Write set:** Character (NPC, `genesisTier='SKETCH'`, owned by the campaign GM) → crystallize → `wrapCharacterAsDaya` (entity + affect + believed sheet) → `updateDayaAuthoring` (identityNarrative = persona, voiceNotes = voice) → `seedEntityMemories` → `setDayaStatus ACTIVE` → Character ACTIVE → canvas snap beside the first awake being's location (best effort) → SSE `character_update`. The row is written only once the sheet is valid and priced; job status lives in an in-process map.
- **Cost/latency (estimate):** ~1.5k input + ~500–700 output tokens on the judgment (Sonnet) lane ≈ $0.01–0.015 and ~8–15 s of model time per sketch, plus <1 s of writes. The local lane could take it (structured JSON; the server repairs every number) once warm — change `lane` to `'local'`, nothing else.
- **Deepen later:** `markForDeepening(characterId)` sets `Character.deepenRequested`; the deep pipeline picks those up in idle cycles (no scheduler yet).

## JEWL per-lane context — table chat fits the 32k local window (2026-10-12)
Measured by `app/scripts/measure-local-prompt.ts` (read-only; now prints per-kind totals): table chat was ≈57k est. tokens (persona v3 7.8k + 51 tool specs 21.7k + 20 history rows 25.5k + context 1.6k) — now ≈9.7k. Every dispatch has a KIND (`ai/copilot/tool-profiles.ts` `dispatchKindOf`): **TABLE_CHAT** (every non-work-cycle source) carries the light tool set `TABLE_CHAT_TOOLS` (NPC voice/acts, sketch_npc, memory, actor state, clock, damage/conditions, read_location, ask_terminal) + `request_tool(name)` — an escape hatch that offers one heavier tool on the NEXT round of the same dispatch (kept while used, dropped after an unused round, never carried to another dispatch; a canvas gesture's proposedTool is pre-granted); **WORK_CYCLE** = full set minus table-only tools; **GENESIS** = as before (stage allow/exclude lists). Heavy tool descriptions ≤900 chars (Zod + the LIMITS line still enforce the schema). Persona prompt v4 (`prompts/system/v4.ts`) = a ≤2.5k-token CORE (the v2 laws, compressed) + per-kind addenda (table law / building+stock+work-session law / stock+work-session+genesis law), pure in (kind, register) so the system block is byte-identical across rounds (cache); `JEWL_PROMPT_VERSION=v3` rolls back. Table-chat history (`table-history.ts`): work-cycle briefs, their replies (stamped `metadata.dispatchKind`, legacy rows paired) and `[genesis]` reports are excluded; rows clipped to 1.2k chars; newest rows within 6k tokens; older fiction rows fold into a deterministic extractive rolling summary on `Campaign.jewlChatSummary` (+`…Through`, migration `20261012180000_jewl_chat_summary`), injected as `EARLIER TABLE CHAT` in the context block (TODO: local-model summary). Before every dispatch the runtime logs `[ctx] kind= system= tools= history= ctx= total= budget=` (`dispatch-budget.ts`; local budget = window − 8k) and drops the oldest history lines when over; the transport's 792fd2c fit/clamp still backs it up.

## Material life — the POSSESSIONS stage at full size (Mike 2026-10-16)

Ruling (memory `ruling-material-life-root-kv-crystallized-dollar-exchange-2026-10-16`): a character is not finished until her whole material life exists — "Her apartment, her full wardrobe, pots and pans, the junk in her junk drawer. All of it placed and tied to her with memories of where and how they came to be." Every Root and Branch now carries `accumulatedWealth` (a KRMA line INSIDE its TKV, beside attributes/skills/named grants); Σ over her blocks is JEWL's budget to build the unnamed life (stock blueprints free, instances = the Watcher's KRMA crystallized as objects); the remainder is exchanged into a campaign Currency (a stored-KRMA vehicle — many per campaign, each rated on what objects cost in that time and place, AI-managed) and granted as cash; income from her current branch. **Built 2026-10-16:** the schema line, pricing, `Currency` model, the `GrowthWealth` ledger, `lifeBudget`, JEWL tools `read_life_budget` / `establish_currency` / `grant_cash` / `set_income` and the POSSESSIONS stage law. **Not yet:** the stock Root/Branch regrade (+~50 TKV at root scale, time-proportional for branches, spread across the lines — lands as drafts for Mike), the room-by-room life walk with a memory per item (plan `PORTRAIT-STAGE-PLAN-2026-10-15.md` §3), and the portrait that paints from it.

## Genesis walk reordered — look → world → memories → vines → portrait (Mike 2026-10-16)

Mike: "1. Seed 2. Root 3. Branches 4. Appearance 5. Possessions and Item/building their physical world 6. Memories from all that building 7. Vines decided 8. Portrait generated 9. Done" — "age comes from the root + branches" (a sum, not a stage); "How can anyone decide their current goals unless everything else is built." Post-sheet stages (`lib/genesis-stages.ts`): **AGE** (repair only — the sheet stage now stamps age from the blocks as it closes via `setStartingAge`, and `set_starting_age` is a BUILDING tool) → **APPEARANCE** (PLAYER GATE: `identity.designer.approvedImagePath` + `bodyImagePath`, or legacy `generatedBust` + `generatedFullBody`) → **WORLD** (was POSSESSIONS + SEEDS + WORLD_FACTS: home + rooms as Locations, things room by room from the life budget, the people she names as NPC seeds, the facts; tools = the union + `read_life_budget` / `establish_currency` / `grant_cash` / `set_income`; evidence = things AND people/places, or the three legacy stamps) → **MEMORIES** (new; `daya_seed_memory` + `daya_ledger_read`; one memory per thing built — items, marks, places, people; fleeting / held / chain; stamp-only evidence) → **VINES** → **PORTRAIT** (GATE on `Character.portrait`; enforced only with `GENESIS_PORTRAIT_GATE=on` until the portrait step ships) → Born. **Gates never reach the model:** `work-loop.ts runCycle` calls `services/genesis-gates.ts holdOrPassGate` — pass = `update_work_session done` (the walk moves on), hold = `blocked` with the fixed reason `waiting at the designer — …` (Forge-resolved resumes skip it). The designer's save (`updateCharacter`) and `lockPortrait` call `reopenGenesisGates(characterId)`, which reactivates a held gate whose evidence now exists and kicks the loop. Legacy stage names on in-flight sessions normalize into WORLD (`normalizeStage`). Progress ladder keys: age, appearance, world, memories, vines, portrait, born. Recursion (Mike): every person built in WORLD is an entity and gets the same walk at sketch tier, deepened later via completeCharacter; humans drive, JEWL scales (memory `ruling-world-building-recursion-jewl-swarm-personality-2026-10-16`).
