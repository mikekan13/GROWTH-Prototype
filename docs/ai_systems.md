# GRO.WTH AI Systems

Last updated: 2026-03-07

## Current Status

No AI systems are active in the app yet. All AI features are planned and will be implemented in phases following the "manual-first" development principle.

## Planned Systems

### 1. Portrait Pipeline (Phase A-D)

**Purpose**: Generate and maintain consistent character portraits from narrative data.

**Architecture**: ComfyUI + FLUX.2 Dev (GGUF quantized) + PuLID v2

**Detailed design**: See `PORTRAIT-PIPELINE.md` in project root.

**Data flow**:
```
Character Data → Prompt Template Engine → ComfyUI API → FLUX.2 + PuLID → Portrait Image → Storage
```

**Inputs**: Character description, backstory, equipment, vitals, conditions, traits
**Outputs**: Portrait image (1024x1024), identity embedding for consistency
**Dependencies**: ComfyUI (local), FLUX.2 Dev model, PuLID weights

### 2. Backstory AI Assistant (future)

**Purpose**: Help players expand their backstory responses using campaign context.

**Inputs**: Player's partial backstory text, campaign worldContext, campaign themes
**Outputs**: Expanded text suggestions (player accepts/rejects)
**Constraint**: AI expands existing text, never overwrites. Player always has final say.

### 3. Rule Arbiter (future — Phase 6+)

**Purpose**: AI copilot that monitors game state and suggests mechanical outcomes.

**Inputs**: Session events (eventually via microphone → transcription → interpretation)
**Outputs**: Suggested attribute changes, damage, conditions
**Constraint**: Manual override always available. GM is final authority. AI asks "why" when corrected and learns.

### 4. Oracle (future — separate project)

**Purpose**: Full AI co-GM system.

**Status**: Deferred beyond 3-month beta timeline. Will be its own service connecting via API.

## Directory Structure

```
src/ai/
  portraits/     ← Portrait pipeline integration (Phase A-D)
  prompts/       ← Prompt templates for AI systems
  (future additions as systems are built)
```

## Design Principles

1. **Manual first** — Every AI feature must work manually before automation
2. **AI is copilot, not authority** — Players and GMs can always override
3. **Isolated from domain logic** — AI code lives in /ai, called via services
4. **Local-first** — Run on local hardware during alpha/beta, cloud option later
