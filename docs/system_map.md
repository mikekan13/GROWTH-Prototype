# GRO.WTH System Map

Last updated: 2026-03-08 (Forge System + Skill Redesign)

## Architecture Overview

Next.js 16 App Router with layered architecture adapted for the framework:

```
Interface Layer     →  app/ (pages + API routes)
Service Layer       →  services/ (business logic, Zod validation)
Infrastructure      →  lib/ (auth, database, utilities, permissions, errors)
AI Systems          →  ai/ (portrait pipeline, future Oracle)
Data Layer          →  Prisma 7 + SQLite (beta) → PostgreSQL (production)
Types               →  types/growth.ts (GrowthCharacter, game mechanics)
```

## Data Flow

```
Client Component → API Route → Service Function → Prisma → SQLite
Server Component → Service Function (direct) → Prisma → SQLite
Server Component → Prisma (direct, simple queries)
```

API routes are thin wrappers: parse input → Zod validate → call service → catch errors → return HTTP response.

## Key Systems

### Authentication
- bcrypt password hashing (12 rounds)
- Crypto session tokens (32 bytes), stored in DB
- httpOnly cookies, 7-day expiration
- Middleware protects /trailblazer, /watcher, /terminal routes
- Files: `lib/auth.ts`, `middleware.ts`

### Access Control
- Roles: TRAILBLAZER (player) → WATCHER (GM) → ADMIN → GODHEAD
- WATCHER access via physical rulebook QR codes (AccessCode model)
- Permission helpers in `lib/permissions.ts`
- Files: `services/access-code.ts`

### Campaign System
- Watchers create campaigns with invite codes, world context, custom backstory prompts
- Trailblazers join via invite code → CampaignMember enrollment (no placeholder characters)
- Seat limit: maxTrailblazers per campaign (default 5)
- Files: `services/campaign.ts`

### Character System
- GrowthCharacter data stored as JSON in SQLite
- Character lifecycle: DRAFT → SUBMITTED → APPROVED → ACTIVE → DEAD/RETIRED
- 4-step GM builder: Identity → Origin → Attributes → WTH
- Files: `services/character.ts`, `components/character/`

### Backstory System
- Structured prompts (8 defaults + GM custom per campaign)
- Player submits → GM reviews (approve/revision with notes)
- Files: `services/backstory.ts`

### Relations Canvas (Watcher Console)
- SVG infinite canvas with pan, zoom, node dragging, viewport culling
- CharacterCard: expanded (full sheet) / compact views, drag-to-move, dynamic name sizing
- InventoryCard: draggable sub-panel with gold tether line, 2000px max distance
- ComplexTooltip: 500ms lock-on-hover, nested tooltips via createPortal
- All canvas state persisted to localStorage per campaign (debounced 300ms)
- Persisted state: viewBox, zoom, positions, z-indices, expanded/collapsed, inventory panels, offsets
- Files: `components/canvas/RelationsCanvas.tsx`, `CharacterCard.tsx`, `InventoryCard.tsx`, `ui/ComplexTooltip.tsx`

### Change Log System
- Character updates trigger changelog entries via automatic diffing of before/after data
- Event architecture: `services/character.ts` `updateCharacter` calls `createChangeLogEntry` with before/after snapshots; `lib/changelog-utils.ts` diffs the objects, infers the category, and summarizes changes into human-readable descriptions
- Coalescence: 5-second server-side window groups rapid changes by the same actor on the same character into a single entry (prevents spam from multi-field edits)
- Auto-polling UI: `ChangeLogPanel` polls every 5 seconds when the panel is visible (bottom overlay on the Relations Canvas)
- Revert: any revertible entry can be reverted with conflict detection — the system compares the current field value against the expected "after" value before applying the rollback
- **Integration rule:** ALL future features that modify character data should wire into the changelog by calling `createChangeLogEntry` from `services/changelog.ts` with before/after data. The `updateCharacter` function already does this automatically for any character data updates routed through it.
- Files: `services/changelog.ts`, `lib/changelog-utils.ts`, `types/changelog.ts`, `components/changelog/ChangeLogPanel.tsx`, `app/api/changelog/route.ts`, `app/api/changelog/[id]/revert/route.ts`

### Campaign Terminal
- Unified activity feed replacing the ChangeLog bottom overlay
- Merges two data sources at display time: ChangeLog entries (character state diffs) + CampaignEvent entries (dice rolls, chat, commands, game events)
- Resizable bottom panel (drag top edge, height persisted to localStorage per campaign)
- Events grouped by GameSession (collapsible session headers, "between sessions" for downtime)
- Filter toggles: All / Chat / Dice / Changes / Events
- Command input bar (bottom): plain text = chat, / prefix = command
- Commands: `/roll <skill> dr:<n> effort:<n> attr:<attr>`, `/roll <die>`, `/spend <attr> <n>`, `/restore <attr> <n>`, `/session start [name]`, `/session end`
- Commands execute via same `character-actions.ts` pure functions as UI buttons
- Auto-poll 5s when visible, auto-scroll to bottom on new events
- Design doc: `docs/campaign-terminal-design.md`
- Files: `components/terminal/CampaignTerminal.tsx`, `TerminalEventRow.tsx`, `CommandInput.tsx`, `lib/terminal-commands.ts`, `types/terminal.ts`, `services/campaign-event.ts`

### Dice / Resolution System
- Pure rolling functions in `lib/dice.ts`: rollDie, rollSkillDie, rollFateDie, skilledCheck, unskilledCheck
- Implements GRO.WTH resolution: Skilled (SD + FD + Effort + mods vs DR) and Unskilled (FD + Effort + mods vs DR)
- Skill Die progression: levels 1-3 = flat bonus, 4-5 = d4, 6-7 = d6, 8-11 = d8, 12-19 = d12, 20 = d20
- `performSkillCheck()` in `character-actions.ts` combines dice rolling with effort spending (auto-depletion, overflow to Frequency)
- Effort always spent regardless of success/failure

### Skills System
- **Freeform** — name defines context, no predefined categories, no combat flag
- Skills have: name, level (1-20), governors (1+ attribute names, not Frequency), description
- Governors: clout, celerity, constitution, flow, focus, willpower, wisdom, wit
- Modifiers come from external sources (gear, nectars, buffs) — not stored on skill
- Skill specificity affects DR adjustment (-2 to +2) — evaluated by GM or AI copilot
- Skills stored inline in character JSON (GrowthSkill[] array)
- CRUD via pure functions in `character-actions.ts`: addSkill, removeSkill, updateSkillLevel, updateSkill
- SkillsCard: governor badges (pillar-colored), +/- level, Roll button, Request button (player)
- Max output readout in tooltip: max roll, skill cap, effort to cap
- Files: `types/growth.ts` (SkillGovernor, SKILL_GOVERNORS), `lib/character-actions.ts`, `components/canvas/SkillsCard.tsx`

### Forge System
- Campaign-level design workshop where GM creates templates and players submit requests
- ForgeItem: campaign-scoped design (skill/item/nectar/blossom/thorn), draft → published lifecycle
- PlayerRequest: player-submitted request, GM approves/denies/modifies → creates ForgeItem
- Players can request skills from SkillsCard (name, governors, description) — appears in Forge + Terminal
- Published ForgeItems are available in the campaign for assignment to characters
- KRMA cost: creating a template is free, assigning to a character at a level costs KRMA (future)
- Files: `services/forge.ts`, `app/api/campaigns/[id]/forge/`, `app/api/campaigns/[id]/requests/`

### AI Systems (planned)
- Portrait pipeline: ComfyUI + FLUX.2 Dev + PuLID (see PORTRAIT-PIPELINE.md)
- Oracle (future): AI co-GM, separate service
- Rule Arbiter (future): AI copilot for session mechanics

### KRMA Economy (planned)
- Reserve wallets, GM KRMA pools, TKV calculation
- Wallet + KrmaTransaction models in schema (not yet implemented)

## Three Interfaces

| Interface | Role | Route | Purpose |
|-----------|------|-------|---------|
| Trailblazer Portal | Player | /trailblazer | View characters, join campaigns, write backstories |
| Watcher Console | GM | /watcher | Manage campaigns, review backstories, build characters |
| Terminal | Admin | /terminal | System administration, access code management |

## External Dependencies

- **Zero external services** during alpha/beta
- SQLite for data (file-based, no server needed)
- ComfyUI for portraits (local, optional — system works without it)
