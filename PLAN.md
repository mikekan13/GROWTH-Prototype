# GRO.WTH — Build Plan

Last updated: 2026-03-06
Current phase: Phase 0 (Clean Slate Setup)

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

- **Next.js 15** + React 19 + TypeScript
- **Tailwind CSS 4**
- **Prisma + SQLite** (beta) -> PostgreSQL (production)
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
  id          String   @id @default(cuid())
  name        String
  genre       String?
  themes      String?  // JSON array
  description String?
  gmUser      User     @relation("GMCampaigns", fields: [gmUserId], references: [id])
  gmUserId    String
  inviteCode  String?  @unique
  status      CampaignStatus @default(ACTIVE)
  characters  Character[]
  createdAt   DateTime @default(now())
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
  narrative   String
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
Status: IN PROGRESS

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
- [ ] Portrait section (needs image upload/display)
- [ ] GM Character Builder: form/wizard for Seeds, Roots, Branches
- [ ] Character sheet JSON validation against GrowthCharacter type
- [ ] Skills display section
- [ ] Magic/Spells display section
- [ ] Inventory display section
- [ ] Body damage/vitals display

**Ship condition**: GM can create a character with all GROWTH attributes, view it as the full character sheet

### Phase 2: Campaign Flow
Status: NOT STARTED

- [ ] Campaign CRUD
- [ ] Invite code system (GM generates code, player enters it to join)
- [ ] Backstory submission workflow (player writes -> GM reviews -> GM builds mechanical character)
- [ ] Campaign character list view
- [ ] Player dashboard showing their characters across campaigns

**Ship condition**: Full loop from campaign creation to player seeing their completed sheet

### Phase 3: Session Tools
Status: NOT STARTED

- [ ] Dice roller (Fate Die + Skill Die + Effort, full resolution system)
- [ ] Effort spending (deducts from attribute pools, depletion warnings)
- [ ] Damage tracking (hit locations, conditions auto-applied)
- [ ] Short/long rest recovery
- [ ] Initiative tracker (basic turn order)

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
Status: NOT STARTED

The spatial GM interface with floating/dockable panels:
- [ ] Canvas with draggable/resizable panels
- [ ] Character cards as spatial nodes
- [ ] NPC cards
- [ ] Relationship lines between entities
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

### Questions for Mike (when he returns)
1. **Character portrait**: Upload images or paste URLs? What dimensions/format?
2. **Skills display**: The skill system is freeform (any name, level 1-20). Should skills be grouped by combat/non-combat, or just a flat list?
3. **Magic display**: Do we show all 10 schools as tabs, or just the ones the character has spells in?
4. **Body damage visual**: The rulebook has hit locations (head, neck, torso, arms, legs). Should this be a body diagram or a simple grid?
5. **GM character builder**: Full wizard with steps (Seed -> Root -> Branches -> Attributes), or a single form page?
6. **Who should be able to create campaigns?** Currently anyone can. Should it be WATCHER+ only? (Creating a campaign auto-promotes to WATCHER currently.)

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
