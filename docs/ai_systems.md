# GRO.WTH AI Systems

Last updated: 2026-04-04

## Current Status

Two AI systems are now active, both running via Ollama (gemma2:9b, local).

### Active: Application AI (QoL)

**Purpose**: Help GMs design application prompts and help players expand backstory responses.

**Architecture**: `src/ai/application-ai.ts` → `src/ai/providers/ollama.ts` → Ollama REST API

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
    ollama.ts           — Ollama HTTP client (generateText + chat), server-only
    index.ts            — getAIProvider() factory (AI_PROVIDER env var)
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
