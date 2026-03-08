# GRO.WTH Module Registry

Last updated: 2026-03-08 (Forge System + Skill Redesign)

## Services (Business Logic)

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| AuthService | `services/auth.ts` | Login, registration, access code redemption on signup | Prisma, auth lib, access-code service |
| CampaignService | `services/campaign.ts` | Campaign CRUD, invite code join, seat limits | Prisma, permissions |
| CharacterService | `services/character.ts` | Character CRUD, access control | Prisma, permissions, defaults |
| BackstoryService | `services/backstory.ts` | Structured backstory submit/review | Prisma, permissions |
| AccessCodeService | `services/access-code.ts` | Code generation, validation, redemption | Prisma, permissions |
| ChangeLogService | `services/changelog.ts` | Create changelog entries with diff/coalescence (5s window), query with pagination and filters, revert with conflict detection | Prisma, changelog-utils |
| CampaignEventService | `services/campaign-event.ts` | Campaign event CRUD (dice rolls, chat, commands, game events), session management (start/end/list), auto-assigns events to active session | Prisma |
| ForgeService | `services/forge.ts` | ForgeItem CRUD (skill/item/nectar/blossom/thorn templates), publish/unpublish, PlayerRequest CRUD (create/edit/resolve), Zod validation per type | Prisma, permissions |

## Infrastructure (lib/)

| Module | File | Purpose |
|--------|------|---------|
| Auth | `lib/auth.ts` | Password hashing, session management, cookie handling, typed auth/forbidden errors |
| Database | `lib/db.ts` | Prisma client singleton with LibSQL adapter |
| Permissions | `lib/permissions.ts` | Reusable role/ownership checks |
| Errors | `lib/errors.ts` | Typed error classes (AppError, ValidationError, etc.) |
| API Utils | `lib/api.ts` | Error-to-HTTP-response conversion |
| Defaults | `lib/defaults.ts` | Default GrowthCharacter factory |
| ChangeLog Utils | `lib/changelog-utils.ts` | Pure diff/summary utilities: diffObjects (deep object comparison), inferCategory (maps changed fields to changelog categories), summarizeChanges (generates human-readable descriptions from FieldChange arrays) |
| Dice | `lib/dice.ts` | Pure dice rolling utilities: rollDie, rollSkillDie, rollFateDie, skilledCheck, unskilledCheck. Implements GRO.WTH resolution system (SD + FD + Effort vs DR) |
| Character Actions | `lib/character-actions.ts` | Pure functions for character state mutations: attribute CRUD (update/spend/restore/setLevel), skill CRUD (add/remove/updateLevel/update with governors), performSkillCheck (rolls dice + spends effort). Returns { character, changes[] } for audit trail |
| Terminal Commands | `lib/terminal-commands.ts` | Command parser + executor for Campaign Terminal: /roll, /spend, /restore, /session. Calls character-actions.ts functions |

## Components

| Group | Components | Purpose |
|-------|-----------|---------|
| Character Display | CharacterSheet, AttributeBlock, MagicSection, SkillsSection, VitalsSection, InventorySection | Full character sheet rendering |
| Character Builder | CharacterBuilder | 4-step wizard (Identity → Origin → Attributes → WTH) |
| Canvas | RelationsCanvas | SVG infinite canvas with pan/zoom, node dragging, KRMA Line, viewport culling, localStorage persistence |
| Canvas Cards | CharacterCard | Expanded/compact character sheet on canvas, dynamic name sizing, drag support |
| Canvas Cards | InventoryCard | Draggable inventory sub-panel with filter tabs, quick stats, ComplexTooltip items |
| Canvas Cards | SkillsCard | Skill sub-panel with governor badges, +/- level, Roll button, Request button (player), add form (GM). No categories or combat flags |
| Canvas Cards | CampaignCanvas | Campaign page wrapper that loads characters and renders RelationsCanvas |
| Change Log | ChangeLogPanel | (Legacy — absorbed into Campaign Terminal) Bottom overlay panel, retained as reference |
| Terminal | CampaignTerminal | Unified campaign activity feed — merges changelog + campaign events. Resizable bottom overlay, session grouping, filter toggles, auto-poll (5s). Replaces ChangeLogPanel |
| Terminal | TerminalEventRow | Renders one terminal event — dispatches by type (changelog, dice_roll, chat, command, ai_message, game_event) with distinct styling |
| Terminal | CommandInput | Command input bar with history (up/down arrows), auto-submit on Enter, imperative prefill via ref |
| Campaign | CampaignCreator, JoinCampaign | Campaign creation with world context, invite code join |
| Backstory | BackstoryEditor, BackstoryReview | Structured prompt editor, GM review interface |
| Auth | AuthForm, RedeemCode | Login/register with access code, post-registration upgrade |
| UI | ComplexTooltip | 500ms lock-on-hover tooltip with nested tooltip support via createPortal |
| UI | ConfirmDialog, Modal | Reusable dialog/modal primitives |
| Branding | GrowthLogo | Canonical logo rendering, scalable via `scale` prop. DO NOT modify without Mike's approval |
| Layout | DashboardShell | Role-aware page wrapper with header |

## Types

| File | Contents |
|------|----------|
| `types/growth.ts` | GrowthCharacter, GrowthAttributes, GrowthConditions, GrowthLevels, GrowthCreation, GrowthSkill (with SkillGovernor[], no categories/combat flag), GrowthMagic, GrowthTrait, GROvine, GrowthFear, GrowthVitals, GrowthInventory, SKILL_GOVERNORS, PILLARS constant |
| `types/changelog.ts` | ChangeActor (player, gm, ai_copilot, system), ChangeCategory, FieldChange (field/oldValue/newValue), ChangeLogEntry (full DB record type), query/create/revert input types |
| `types/terminal.ts` | TerminalEvent (unified event type), TerminalEventType, TerminalPayload (discriminated union), payload types (ChangeLogPayload, DiceRollPayload, ChatPayload, CommandPayload, AIMessagePayload, GameEventPayload), GameSessionInfo, TerminalFilter |

## API Routes (32 total)

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
| /api/changelog | GET | ChangeLogService (query with filters: campaignId, characterId, actor, category, pagination) |
| /api/changelog/[id]/revert | POST | ChangeLogService (revert entry with conflict detection) |
| /api/campaigns/[id]/events | GET, POST | CampaignEventService (create + query campaign events with type/session filters) |
| /api/campaigns/[id]/sessions | GET, POST | CampaignEventService (list sessions, start/end session) |
| /api/campaigns/[id]/forge | GET, POST | ForgeService (list + create forge items, GM-only create, players see published only) |
| /api/campaigns/[id]/forge/[itemId] | GET, PATCH, DELETE | ForgeService (get/update/delete forge item, GM-only edit, delete draft only) |
| /api/campaigns/[id]/forge/[itemId]/publish | POST, DELETE | ForgeService (publish/unpublish forge item, GM-only) |
| /api/campaigns/[id]/requests | GET, POST | ForgeService (list + create player requests, players see own only) |
| /api/campaigns/[id]/requests/[requestId] | PATCH | ForgeService (player edit or GM resolve with approve/deny/modify) |
