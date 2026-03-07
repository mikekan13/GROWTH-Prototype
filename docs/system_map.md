# GRO.WTH System Map

Last updated: 2026-03-07

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
