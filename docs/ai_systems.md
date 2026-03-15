# GRO.WTH AI Systems

Last updated: 2026-03-14

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

### Portrait Pipeline (Phase A-D)

**Purpose**: Generate and maintain consistent character portraits from narrative data.

**Architecture**: ComfyUI + FLUX.2 Dev (GGUF quantized) + PuLID v2

**Detailed design**: See `PORTRAIT-PIPELINE.md` in project root.

### Rule Arbiter (future — Phase 6+)

**Purpose**: AI copilot that monitors game state and suggests mechanical outcomes.

**Inputs**: Session events (eventually via microphone → transcription → interpretation)
**Constraint**: Manual override always available. GM is final authority.

### Oracle (future — separate project)

**Purpose**: Full AI co-GM system (the GODHEAD role).
**Status**: Deferred beyond beta. Will be its own service connecting via API.

## Provider Architecture

```
src/ai/
  types.ts              — AIProvider interface, ChatMessage, GenerateOptions
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
```

## Subscription Tier Classification

| Feature | Type | Basic Tier | Premium Tier | Local Model |
|---------|------|-----------|-------------|-------------|
| KRMA Validator | System-required | Always | Always | No (cloud only) |
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
