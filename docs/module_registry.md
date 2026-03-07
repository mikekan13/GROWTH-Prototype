# GRO.WTH Module Registry

Last updated: 2026-03-07

## Services (Business Logic)

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| AuthService | `services/auth.ts` | Login, registration, access code redemption on signup | Prisma, auth lib, access-code service |
| CampaignService | `services/campaign.ts` | Campaign CRUD, invite code join, seat limits | Prisma, permissions |
| CharacterService | `services/character.ts` | Character CRUD, access control | Prisma, permissions, defaults |
| BackstoryService | `services/backstory.ts` | Structured backstory submit/review | Prisma, permissions |
| AccessCodeService | `services/access-code.ts` | Code generation, validation, redemption | Prisma, permissions |

## Infrastructure (lib/)

| Module | File | Purpose |
|--------|------|---------|
| Auth | `lib/auth.ts` | Password hashing, session management, cookie handling, typed auth/forbidden errors |
| Database | `lib/db.ts` | Prisma client singleton with LibSQL adapter |
| Permissions | `lib/permissions.ts` | Reusable role/ownership checks |
| Errors | `lib/errors.ts` | Typed error classes (AppError, ValidationError, etc.) |
| API Utils | `lib/api.ts` | Error-to-HTTP-response conversion |
| Defaults | `lib/defaults.ts` | Default GrowthCharacter factory |

## Components

| Group | Components | Purpose |
|-------|-----------|---------|
| Character Display | CharacterSheet, AttributeBlock, MagicSection, SkillsSection, VitalsSection, InventorySection | Full character sheet rendering |
| Character Builder | CharacterBuilder | 4-step wizard (Identity → Origin → Attributes → WTH) |
| Campaign | CampaignCreator, JoinCampaign | Campaign creation with world context, invite code join |
| Backstory | BackstoryEditor, BackstoryReview | Structured prompt editor, GM review interface |
| Auth | AuthForm, RedeemCode | Login/register with access code, post-registration upgrade |
| Branding | GrowthLogo | Canonical logo rendering, scalable via `scale` prop. DO NOT modify without Mike's approval |
| Layout | DashboardShell | Role-aware page wrapper with header |

## Types

| File | Contents |
|------|----------|
| `types/growth.ts` | GrowthCharacter, GrowthAttributes, GrowthConditions, GrowthLevels, GrowthCreation, GrowthSkill, GrowthMagic, GrowthTrait, GROvine, GrowthFear, GrowthVitals, GrowthInventory, PILLARS constant |

## API Routes (22 total)

| Route | Methods | Service |
|-------|---------|---------|
| /api/auth/register | POST | Direct (uses AccessCodeService for validation) |
| /api/auth/login | POST | Direct |
| /api/auth/logout | POST | Direct |
| /api/auth/me | GET | Direct |
| /api/campaigns | GET, POST | CampaignService |
| /api/campaigns/join | POST | CampaignService |
| /api/characters | GET, POST | CharacterService |
| /api/characters/[id] | GET, PATCH | CharacterService |
| /api/characters/[id]/backstory | POST, PATCH | BackstoryService |
| /api/access-codes | GET, POST | AccessCodeService |
| /api/access-codes/redeem | POST | AccessCodeService |
