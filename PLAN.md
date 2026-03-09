# GRO.WTH — Build Plan

Last updated: 2026-03-09
Current phase: Phase 3 (Session Tools) — Skeleton Systems Pass

---

## Decisions Made (Mike confirmed 2026-03-06)

- **Clean rebuild** in the gro.wth folder (fresh project, not patching the beta)
- **Google Sheets is DEAD** — cut entirely, no fallback, no googleapis
- **No active campaigns** — will simulate with AI for testing
- **Relations Canvas IS the vision** — spatial web of floating/dockable panels for GM interface
- **3-month timeline** — workable product for investors/Kickstarter demo
- **Desktop-first** — GM at a computer is the primary use case
- **Keep from beta**: TypeScript types (`src/types/growth.ts`), character card visual DNA, Prisma entity design

## What to Carry Forward from Beta

### Keep (copy into new project)
- `GRO.WTH Beta/src/types/growth.ts` — Solid TypeScript interfaces (GrowthCharacter, GrowthAttributes, etc.). Will need Soul/Spirit label corrections.
- Character card component visual patterns — colors, layout DNA, sacred geometry aesthetic
- Reference images (4 PNG character sheet designs)
- Prisma entity concepts (User, Campaign, Character, Wallet, KrmaTransaction)

### Kill
- Google Sheets integration (7+ service files)
- MCP server configs and integration
- Email/nodemailer services
- Cloudflare tunnel setup
- Google OAuth (switching to bcrypt + sessions)
- Debug routes
- Playwright test suite (built for old codebase)

---

## Tech Stack

- **Next.js 16** + React 19 + TypeScript
- **Tailwind CSS 4** + **Zod 4** (validation)
- **Prisma 7 + SQLite** (beta) -> PostgreSQL (production)
- **bcrypt auth** with session tokens (no OAuth)
- Zero external service dependencies

---

## Data Model

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  email        String   @unique
  passwordHash String
  role         Role     @default(TRAILBLAZER) // ADMIN, WATCHER, TRAILBLAZER, GODHEAD
  campaigns    Campaign[] @relation("GMCampaigns")
  characters   Character[]
  wallet       Wallet?
  sessions     Session[]
  createdAt    DateTime @default(now())
}

model Campaign {
  id              String           @id @default(cuid())
  name            String
  genre           String?
  themes          String?          // JSON array
  description     String?
  worldContext    String?          // World description for AI context
  customPrompts   String?          // JSON array of GM-defined backstory prompts
  gmUser          User             @relation("GMCampaigns", fields: [gmUserId], references: [id])
  gmUserId        String
  inviteCode      String?          @unique
  status          CampaignStatus @default(ACTIVE)
  maxTrailblazers Int              @default(5)
  characters      Character[]
  members         CampaignMember[]
  createdAt       DateTime @default(now())
}

model CampaignMember {
  id         String   @id @default(cuid())
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  campaignId String
  user       User     @relation(fields: [userId], references: [id])
  userId     String
  joinedAt   DateTime @default(now())
  @@unique([campaignId, userId])
}

model Character {
  id         String   @id @default(cuid())
  name       String
  user       User     @relation(fields: [userId], references: [id])
  userId     String
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  campaignId String
  data       String   // JSON<GrowthCharacter>
  portrait   String?
  status     CharacterStatus @default(DRAFT)
  backstory  CharacterBackstory?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model CharacterBackstory {
  id          String   @id @default(cuid())
  character   Character @relation(fields: [characterId], references: [id])
  characterId String   @unique
  responses   String   // JSON: array of { prompt: string, response: string }
  narrative   String?  // Compiled narrative (generated from responses)
  gmNotes     String?
  status      BackstoryStatus @default(DRAFT) // DRAFT, SUBMITTED, APPROVED, REVISION
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Wallet {
  id        String   @id @default(cuid())
  owner     User?    @relation(fields: [ownerId], references: [id])
  ownerId   String?  @unique
  ownerType WalletOwnerType // USER, RESERVE
  label     String?  // For reserve wallets: "Terminal", "Mercy", "Balance", "Severity"
  balance   BigInt   @default(0)
}

model KrmaTransaction {
  id           String   @id @default(cuid())
  fromWalletId String
  toWalletId   String
  amount       BigInt
  reason       String
  createdAt    DateTime @default(now())
}

model Session {
  id        String   @id @default(cuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## Build Phases

### Phase 0: Clean Slate Setup
Status: COMPLETE

- [x] Initialize fresh Next.js 16 project in `app/` directory
- [x] Copy and correct `growth.ts` types (apply Soul/Spirit swap, add GROvine, Fear, Blossom/Nectar/Thorn)
- [x] Set up Prisma 7 schema with data model above (SQLite via libsql adapter)
- [x] Run initial migration
- [x] Auth system: register, login, logout, session middleware (bcrypt + session tokens)
- [x] Basic layout with GROWTH visual identity (powder blue calm surface, pillar colors, CSS custom properties)
- [x] Three route groups: `/trailblazer`, `/watcher`, `/terminal`
- [x] Role-based middleware redirecting to correct interface
- [x] Promote script for GODHEAD role (`scripts/promote-godhead.ts`)
- [x] Git initialized

**Ship condition**: Can register, login, see empty dashboard per role — ACHIEVED

### Phase 1: The Character Sheet
Status: COMPLETE (portrait and JSON validation deferred)

The core product. Everything else is secondary.

- [x] Character Sheet display component (CharacterSheet.tsx)
  - Identity header (name, seed, fate die, WTH levels, TKV, age)
  - Seed/Root/Branches origin section
  - 3x3 Attribute panel (Body/Spirit/Soul — CORRECTED) with pool bars, augments
  - Condition flags (auto-shown when attributes hit 0)
  - GRO.vines section (Goal/Resistance/Opportunity with status colors)
  - Nectars (permanent), Blossoms (temporary), Thorns (permanent negative)
  - Fears with resistance levels and alignment status
- [x] Character CRUD API routes (GET list, GET detail, POST create, PATCH update)
- [x] Campaign CRUD API routes (GET list, POST create with invite code)
- [x] Demo page (/demo) with sample character "Kael Ashenmire"
- [ ] Portrait section (needs image upload/display — waiting on Mike's input)
- [x] GM Character Builder: 4-step wizard (Identity -> Origin -> Attributes -> WTH)
- [x] Campaign creator on Watcher dashboard with invite codes
- [x] Watcher Console with campaign list and character management links
- [ ] Character sheet JSON validation against GrowthCharacter type (future)
- [x] Skills display section (SkillsSection.tsx — combat/general split)
- [x] Magic/Spells display section (MagicSection.tsx — mercy/severity/balance pillars)
- [x] Inventory display section (InventorySection.tsx)
- [x] Body damage/vitals display (VitalsSection.tsx — body part grid)

**Ship condition**: GM can create a character with all GROWTH attributes, view it as the full character sheet — ACHIEVED

### Phase 2: Campaign Flow
Status: IN PROGRESS

- [x] Campaign CRUD (create with invite code, list by GM, WATCHER+ only)
- [x] Campaign detail page with character list + pending members (/watcher/campaign/[id])
- [x] CampaignMember model — players enroll without getting placeholder characters
- [x] Invite code join system with seat limits (POST /api/campaigns/join)
- [x] Backstory submission API with structured prompts (POST/PATCH /api/characters/[id]/backstory)
- [x] Trailblazer Portal with campaign memberships, characters, backstory status
- [x] Structured backstory editor — 8 default prompts + GM custom prompts per campaign
- [x] GM backstory review UI (/watcher/review/[id] — structured responses, approve/revision with notes)
- [x] Campaign creator with world context and custom backstory prompts
- [x] Change Log system — schema, service (diff/coalescence/revert with conflict detection), API routes (GET with filters, POST revert), UI panel (bottom overlay on canvas with auto-poll, timeline, filters, expand/collapse, revert). All character updates via `updateCharacter` automatically create changelog entries. Future features modifying character data should call `createChangeLogEntry` from `services/changelog.ts`.
- [ ] Campaign settings/edit page (rename, change status, regenerate invite code)
- [ ] Collaborative character creation (GM creates character after backstory approval)

**Ship condition**: Full loop from campaign creation to player seeing their completed sheet

### Phase 3: Session Tools
Status: IN PROGRESS

- [x] **Campaign Terminal** — Unified activity feed replacing ChangeLog overlay. Resizable bottom panel, session grouping (collapsible), filter toggles (All/Chat/Dice/Changes/Events), command input bar with history, auto-poll 5s. Design: `docs/campaign-terminal-design.md`
- [x] **Game Sessions** — GM starts/ends sessions via `/session start [name]` and `/session end`. Events auto-assigned to active session. Collapsible session groups in terminal.
- [x] **Dice roller** — Full resolution system: Skill Die (level-based d4→d20) + Fate Die + Effort vs DR. Pure functions in `lib/dice.ts`, integrated via `performSkillCheck()` in `character-actions.ts`. Rolls via `/roll` command or future UI buttons.
- [x] **Effort spending** — `spendAttribute()` with overflow to Frequency, depletion conditions auto-triggered. Available via `/spend` command and UI attribute bars.
- [x] **Skills CRUD** — Add/remove/level skills in SkillsCard sub-panel. `addSkill`, `removeSkill`, `updateSkillLevel` in `character-actions.ts`. All changes flow through changelog.
- [x] **Chat system** — Plain text in terminal = chat message. Persisted to CampaignEvent table. Grouped by session. Fixed caching bug (force-dynamic + no-store).
- [x] **Command system** — `/roll`, `/spend`, `/restore`, `/session` commands parsed client-side, execute via character-actions.ts, results posted to terminal.
- [x] **Forge system (bones)** — ForgeItem + PlayerRequest models, ForgeService with CRUD + Zod validation, ForgePanel UI in campaign Forge tab. GM creates skill/item/nectar/blossom/thorn templates (draft→published), players submit requests. 6 API routes.
- [x] **Skill system redesign** — Freeform skills with attribute governors (no categories/combat flag). Governor badges (pillar-colored), max output readout, player request flow from SkillsCard.
- [ ] **Editable skills in SkillsCard** — Add/remove/level skills directly in the sub-panel, wire to character-actions + changelog
- [ ] **Dice roller UX** — Skill check rolls from SkillsCard (click skill → roll), effort spending integrated
- [ ] **Traits** — Blossoms/Thorns/Nectars that modify rolls and drive attribute changes
- [ ] Damage tracking (hit locations, conditions auto-applied)
- [ ] Short/long rest recovery
- [x] **Skeleton Systems Pass (2026-03-09)** — Created structural skeletons for all major remaining systems:
  - [x] **Location system** — Prisma model, types (`types/location.ts`), service, 2 API routes (CRUD), LocationCard canvas component (compact/expanded)
  - [x] **World item system** — Prisma model, types (`types/item.ts`), service, 2 API routes (CRUD), WorldItemCard canvas component with damage (P:S:H/D\C:B:E), armor, prima materia support
  - [x] **Encounter system** — Prisma model, types (`types/encounter.ts`), service, 2 API routes (CRUD), EncounterTracker component with three-phase combat, round tracking, per-pillar action pools
  - [x] **GROvine panel** — GROvinePanel canvas component with add/complete/fail/abandon, G/R/O detail view, capacity tracking
  - [x] **Essence tab** — Filled with GROvine overview, Nectars/Blossoms/Thorns summary, Harvest log across all characters
  - [x] **Encounters tab** — New tab in CampaignCanvas for encounter management
  - [x] **Canvas create buttons** — Location and Item creation buttons added to canvas toolbar (alongside character create)
  - [x] **Canvas rendering** — Location and item nodes render as expandable foreignObject cards (like CharacterCard), not just circles

**Ship condition**: Can run a combat encounter using the app

### Phase 4: KRMA Economy
Status: NOT STARTED

- [ ] Reserve wallets (Terminal: 50M, Mercy: 20M, Balance: 20M, Severity: 10M)
- [ ] GM KRMA allocation on account creation
- [ ] KRMA earning/spending during sessions
- [ ] TKV calculation from character data
- [ ] Transaction history view

**Ship condition**: KRMA flows correctly through the system during gameplay

### Phase 5: Relations Canvas (GM Vision)
Status: LARGELY COMPLETE (merged into Phase 2-3)

The spatial GM interface with floating/dockable panels:
- [x] Canvas with draggable/resizable panels
- [x] Character cards as spatial nodes
- [x] Location cards as spatial nodes (2026-03-09)
- [x] World item cards as spatial nodes (2026-03-09)
- [ ] NPC cards (currently render as circles — need CharacterCard-like expansion for NPCs)
- [x] Relationship lines between entities (connection system exists)
- [ ] Campaign overview panel
- [ ] Session notes panel

**Ship condition**: GM can spatially arrange and navigate campaign elements

### Phase 6: Oracle Foundation (Future — Separate Project)
Status: DEFERRED

AI co-GM system. Too complex for 3-month beta. Will be its own service connecting via API.

---

## Progress Log

### 2026-03-06: Project Setup + Design Truth
- Created GROWTH-DESIGN-TRUTH.md (canonical design document, 480+ lines)
- Created VISUAL-DESIGN-SPEC.md (visual identity from Core Rulebook v0.4.5)
- Created project CLAUDE.md for session continuity
- All 10 [QUESTION] items answered by Mike
- Corrected Blossom/Nectar definitions (Nectars=permanent, Blossoms=temporary)
- Removed Thread sub-mechanics (Ritual/Worry/Tithe/Hex) — GROWTH is just G/R/O/W/T/H
- Updated repository files: Soul/Spirit swap, Blossom/Nectar fix, dead tech cleanup (15 files)

### 2026-03-07: Phase 0 Complete
- Initialized Next.js 16 + Prisma 7 + SQLite project in `app/`
- Full auth system (bcrypt + session tokens): register, login, logout, /api/auth/me
- GrowthCharacter types corrected with Soul/Spirit swap, GROvine, Fear, Blossom/Nectar/Thorn
- GROWTH visual identity: powder blue surface, pillar colors, CSS custom properties, terminal typography
- Three role-based dashboards: /trailblazer, /watcher, /terminal
- Middleware for session protection and role redirect
- Git initialized, .gitignore configured
- Phase 1 started: CharacterSheet component, AttributeBlock, Character/Campaign APIs, demo page
- Demo character "Kael Ashenmire" (Cambion apothecary) shows all systems working
- Visit http://localhost:3000/demo to see the character sheet
- **Next**: Skills/Magic/Inventory/Vitals display, GM character builder form, portrait upload

### 2026-03-07: Phase 1 Complete + Phase 2 Campaign Flow
- Magic display section (MagicSection.tsx — mercy/severity/balance pillars with spell cards)
- Campaign detail page (/watcher/campaign/[id]) — GM views characters + pending members
- Player invite code join with seat limits (CampaignMember model, no placeholder characters)
- Structured backstory system: 8 default prompts + GM custom prompts per campaign
- BackstoryEditor with save draft / submit for review flow
- BackstoryReview with structured response display, approve/revision with notes
- CampaignCreator expanded with world context and custom backstory prompts
- Trailblazer Portal shows campaign memberships + characters with action links
- Campaign creation restricted to WATCHER+ (no more auto-promote from TRAILBLAZER)
- Prisma migration: CampaignMember model, campaign worldContext/customPrompts/maxTrailblazers, structured backstory responses
- Mike answered 7 design questions: AI portraits, WATCHER-only campaigns, collaborative character creation, structured backstory, AI rule arbiter (future), manual-first dev priority, KRMA balance enforcement
- 20 routes total, all compiling clean
- **Next**: Campaign settings page, collaborative character creation after backstory approval

### 2026-03-07: WATCHER Access Codes + Portrait Research
- AccessCode model — QR/invite codes that grant WATCHER role on registration or redemption
- Registration now accepts optional access code at signup (AuthForm field + API validation)
- POST /api/access-codes — Admin generates batch codes with labels and expiration
- POST /api/access-codes/redeem — Existing users upgrade role with a code
- RedeemCode component on Trailblazer dashboard for post-registration upgrade
- Script: `scripts/generate-access-codes.ts` for CLI code generation
- Portrait pipeline research complete — PORTRAIT-PIPELINE.md written
  - Recommended: ComfyUI + FLUX.2 Dev (GGUF quantized) + PuLID v2 for identity preservation
  - RTX 4060 8GB VRAM confirmed viable with Nunchaku or GGUF quantization
  - Phased implementation: basic gen → identity consistency → steering → dynamic state updates
  - Prompt template system designed: identity + state + equipment assembled from character data
- 22 routes total, all compiling clean

### Decisions Made (2026-03-07, Mike's answers)
1. **Portraits**: AI-generated locally. Must maintain identity consistency + style consistency across characters. Dynamic updates based on injuries, equipment, aging. Pipeline TBD.
2. **Campaign creation**: WATCHER only. Subscription model: 5 Trailblazer seats per Watcher (adjustable later).
3. **Join flow**: No placeholder characters. Players join campaign → collaborate with Watcher on backstory → mechanics created from backstory. Multi-step collaborative workflow.
4. **Backstory**: Structured prompts (childhood, parents, culture, appearance, formative events, goals, fears). GMs can add custom prompts per campaign. AI can assist expansion with campaign context. NEVER single open field.
5. **Character editing**: Manual control always available. AI Rule Arbiter (future) acts as copilot, not authority. Players/GMs can correct AI mistakes. Future: always-on mic → AI interprets events → auto-adjusts stats.
6. **Dev priority**: Manual systems first → AI-assisted → full AI co-pilot.
7. **KRMA balance**: GM's KRMA pool limits character power creation. Prevents power inflation across the network.

### Decisions Made (2026-03-07, Mike's second round)
1. **WATCHER access**: Tied to physical rulebook QR code during alpha/beta. Admin can manually create tester/demo accounts. Future: normal SaaS subscription.
2. **Portrait pipeline**: Major system, not minor feature. Research complete — see PORTRAIT-PIPELINE.md. Recommended: ComfyUI + FLUX.2 Dev (quantized) + PuLID for identity consistency on RTX 4060 8GB. Phased: basic gen → identity → steering → dynamic updates.
3. **Backstory → mechanics pre-population**: Needs more precise definition before implementation. The backstory should influence mechanics but automation level TBD. Collaborative process between player and GM with AI assistance.

### 2026-03-07: Engineering Protocol + Service Layer Refactor
- Reviewed and adapted engineering protocol for Next.js solo-developer alpha project
- Created infrastructure layer: `lib/errors.ts` (typed error classes), `lib/permissions.ts` (reusable permission helpers), `lib/api.ts` (error-to-HTTP conversion)
- Extracted 5 service modules from all API routes: `services/auth.ts`, `services/campaign.ts`, `services/character.ts`, `services/backstory.ts`, `services/access-code.ts`
- All services use Zod schemas for input validation and throw typed errors
- All 11 API routes refactored to thin wrappers (parse → validate → service → response)
- `lib/auth.ts` now throws typed `AuthError`/`ForbiddenError` instead of generic `Error`
- Removed legacy `Error('Unauthorized')` fallback from `lib/api.ts`
- Server component pages now use `canViewCharacter`/`canManageCampaign`/`canEditCharacter` from `lib/permissions.ts` instead of inline checks
- Register route now uses `$transaction` for atomic user+wallet+code creation
- Created system documentation: `docs/system_map.md`, `docs/module_registry.md`, `docs/database_schema.md`, `docs/ai_systems.md`
- Updated CLAUDE.md with architecture rules, code standards, and session workflow for all future sessions
- 22 routes, all compiling clean
- **Next**: Campaign settings page, collaborative character creation after backstory approval

### 2026-03-07: Login Page — Logo Implementation
- Created `GrowthLogo` component (`components/GrowthLogo.tsx`) — reusable, scalable via `scale` prop
- Pixel-matched to `GROWTHlogo.png` using Python/Pillow color extraction from source PNG
- Letter colors (warm-to-cool): G=#F7525F, R=#E06666, O=#F4CCCC, W=#CFE2F3, T=#6FA8DC, H=#002F6C
- Panel backgrounds: G=#FFFFFF, R=#393937, O=#222222, W=#222222, T=#393937, H=#F5F4EF
- Slim cream (#F5F4EF) panel to the left of G
- Black T-bar above O/W gap with #222222 highlight rectangle on top-left (3D effect)
- Gold `<n>` (#856A3F) between O and W at letter baseline (looks like a period)
- Font: Consolas bold at 103px base size
- Login page (`page.tsx`) updated to use GrowthLogo component
- **Mike approved**: "This is the logo and how it should be displayed everywhere"
- **Next**: Continue login page aesthetics (auth form styling, layout, visual polish)

### 2026-03-08: Skill System Redesign + Forge + Terminal Fix
- **Skill system redesign**: Freeform skills — no predefined categories, no combat flag. Skills have `governors: SkillGovernor[]` (any attribute except Frequency), optional description, optional forgeItemId. Max output readout in tooltip. Governor badges (pillar-colored) on skill rows.
- **Forge system (bones)**: ForgeItem + PlayerRequest Prisma models + migration. ForgeService with full CRUD, Zod validation per type (skill/item/nectar/blossom/thorn), draft→published lifecycle. GM creates templates, players submit requests. 6 new API routes.
- **ForgePanel component**: Type filter, create form (GM), publish/unpublish/delete, pending requests queue with approve/deny, governor toggle selector for skills. Wired into existing Forge tab on campaign page.
- **Player skill requests**: Players can request skills from SkillsCard with name, governors, and description. Requests POST to both Forge DB and Terminal feed. Editable while pending.
- **Pillar color correction**: Spirit=#7050A8 (purple), Soul=#3E78C0 (blue). Teal is Terminal only, NOT an attribute color. Fixed in SkillsSection, SkillsCard, ForgePanel, and PILLARS constant.
- **Layout fix**: Root container `h-screen overflow-hidden` (was `min-h-screen`) — canvas zoom/pan no longer affects header/terminal overlays. Header gets `z-[60]`.
- **Text size bump**: +2px across ForgePanel, CampaignTerminal, CommandInput, TerminalEventRow.
- **Terminal chat fix**: Messages weren't appearing due to Next.js/browser fetch caching. Added `cache: 'no-store'` on GET fetches, `export const dynamic = 'force-dynamic'` on events + changelog API routes.
- **Demo page deleted**: All work happens in the live campaign page as intended.
- CommandInput converted to forwardRef with imperative handle (prefill + focus) for cross-component control.
- Custom event pattern (`growth:roll-skill`) for SkillsCard → Terminal communication.
- Docs updated: database_schema.md, module_registry.md, system_map.md
- 28 routes total, all compiling clean
- **Next**: Editable skills in SkillsCard (add/remove/level), dice roller tied to skill checks, traits (Blossoms/Thorns/Nectars)

### Questions for Mike (when he returns)
1. **Portrait art style**: Should all portraits share one style (painterly fantasy)? Or should each campaign set its own?
2. **ComfyUI integration**: Run as subprocess, separate service, or direct API? (~15-30 sec generation time on RTX 4060 acceptable?)
3. **Portrait fallback**: What to show when ComfyUI isn't running? Generic placeholder avatar?
4. **Access code distribution**: Do you want to generate some test codes now? The system is ready.

---

## Open Questions — All Resolved (2026-03-06)

All 10 original questions answered by Mike. See GROWTH-DESIGN-TRUTH.md Section 20 for full answers.

Key decisions:
- GROWTH = Goals/Resistance/Opportunity/Wealth/Tech/Health (confirmed)
- Magic: GM-flexible, no single framework hardcoded
- KRMA: NOT XRP. Future ledger-based crypto for co-ownership, not build-now
- Nectars = permanent, Blossoms = temporary, Thorns = permanent negative
- No budget — get a working product first
- Community chat rate limit = future marketing stunt
- Reversible book = still planned but app comes first
- Prisma + SQLite confirmed
