# GRO.WTH Module Registry

Last updated: 2026-03-10 (KRMA Crystallization + Skeleton Systems)

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
| LocationService | `services/location.ts` | Location CRUD (settlement/wilderness/dungeon/building/POI/region), GM-only create/update/delete, Zod validation | Prisma, permissions |
| CampaignItemService | `services/campaign-item.ts` | World item CRUD (weapon/armor/accessory/consumable/tool/artifact/prima_materia/misc), holder/location assignment, drag-and-drop inventory transfer via holderId, GM-only | Prisma, permissions |
| EncounterService | `services/encounter.ts` | Encounter CRUD (combat/social/exploration/puzzle/event), round/phase tracking, GM-only | Prisma, permissions |
| KRMA Ledger | `services/krma/ledger.ts` | Core transaction engine — ALL KRMA mutations. Append-only, checksummed, idempotent, atomic. Single/batch execution. | Prisma, krma types |
| KRMA Wallet | `services/krma/wallet.ts` | Wallet CRUD (user/campaign/character/system), fund/defund campaigns, transaction history, global metrics | Prisma, ledger, permissions |
| KRMA Evaluator | `services/krma/evaluator.ts` | Deterministic KV calculator (TKV breakdown by pillar, skills, WTH, traits). Death split calculator (component-level routing by pillar/governor). Versioned + hashable. | krma types, growth types |
| KRMA Death Split | `services/krma/death-split.ts` | Orchestrates multi-transaction death process: Body→GM, Soul→50/50, Spirit→player, Frequency→Lady Death. Atomic batch. | ledger, wallet, evaluator |
| KRMA Reconciliation | `services/krma/reconciliation.ts` | Balance reconciliation, global supply invariant check, checksum chain verification, full audit | Prisma, ledger |
| KRMA Crystallization | `services/krma/crystallization.ts` | Crystallize/dissolve entities across KRMA line. Ledger stored as campaign events. Prevents double-crystallization. Pool tracking | Prisma, permissions |
| DiceService | `services/dice.ts` | Single entry point for all dice rolling. Skilled/unskilled checks, death saves, fear checks, contested rolls, quick rolls, custom rolls. Integrates crypto RNG, Godhead injection, event bus | dice lib, dice-events, dice-injection |
| DiceInjectionRegistry | `services/dice-injection.ts` | Godhead override system. Register/remove/apply injections that silently modify die results. Filter by character/source/skill/next-roll. Override types: set values, ensure success/failure, clamp, hidden modifier. Audit-logged | dice types |

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
| Dice | `lib/dice.ts` | Crypto-RNG dice primitives: rollDie (rejection sampling), rollDice (batch), rollSkillDie, rollFateDie, skilledCheck, unskilledCheck. Uses crypto.getRandomValues() for uniform distribution |
| Dice Events | `lib/dice-events.ts` | Pub/sub event bus for roll results. Subscribers: terminal log, 3D overlay, roll history. DiceService emits after every roll |
| Character Actions | `lib/character-actions.ts` | Pure functions for character state mutations: attribute CRUD (update/spend/restore/setLevel), skill CRUD (add/remove/updateLevel/update with governors), performSkillCheck (rolls dice + spends effort). Returns { character, changes[] } for audit trail |
| Terminal Commands | `lib/terminal-commands.ts` | Command parser + executor for Campaign Terminal: /roll, /check, /deathsave, /spend, /restore, /session, /inject. /check and /deathsave use DiceService, /inject manages Godhead overrides |
| KV Calculator | `lib/kv-calculator.ts` | Client-side KRMA Value calculation utilities for character/entity valuation |

## Components

| Group | Components | Purpose |
|-------|-----------|---------|
| Character Display | CharacterSheet, AttributeBlock, MagicSection, SkillsSection, VitalsSection, InventorySection | Full character sheet rendering |
| Character Builder | CharacterBuilder | 4-step wizard (Identity → Origin → Attributes → WTH) |
| Canvas | RelationsCanvas | SVG infinite canvas with pan/zoom, node dragging, KRMA Line, viewport culling, localStorage persistence |
| Canvas Cards | CharacterCard | Expanded/compact character sheet on canvas, dynamic name sizing, drag support |
| Canvas Cards | InventoryCard | Draggable inventory sub-panel showing real CampaignItems (HeldItemData). Weight level display, carry capacity tracking, condition/material/damage info, equip toggle, remove-from-inventory button, drop-target highlighting |
| Canvas Cards | SkillsCard | Skill sub-panel with governor badges, +/- level, Roll button, Request button (player), add form (GM). No categories or combat flags |
| Canvas Cards | LocationCard | Expandable location card on canvas. Compact (280px) and expanded (480px) views. Shows description, tech/wealth/danger levels, features, ley lines, tags |
| Canvas Cards | WorldItemCard | Expandable world item card on canvas. Compact (240px) and expanded (400px) views. Shows damage (P:S:H/D\\C:B:E), armor resistance, prima materia, material modifiers, condition |
| Canvas Cards | GROvinePanel | GROvine management sub-panel for characters. Add/complete/fail/abandon GRO.vines, G/R/O detail view, capacity tracking |
| Canvas Cards | EncounterTracker | Combat encounter management card. Three-phase (Intention/Resolution/Impact), round counter, per-pillar action pools, participant tracking by side |
| Canvas Cards | VitalsCard | Character vitals sub-panel on canvas — body part grid, damage tracking, conditions |
| Canvas Cards | TraitsCard | Character traits sub-panel — Nectars (permanent), Blossoms (temporary), Thorns (permanent negative) |
| Canvas Cards | MagicCard | Character magic sub-panel — mercy/severity/balance spell display |
| Canvas Cards | BackstoryCard | Character backstory sub-panel — structured prompt responses, narrative view |
| Canvas Cards | HarvestCard | Harvest log sub-panel — GROvine completion history across characters |
| Canvas Cards | CampaignCanvas | Campaign page wrapper that loads characters, locations, items and renders RelationsCanvas with tabs (Relations/Forge/Essence/Encounters) |
| Change Log | ChangeLogPanel | (Legacy — absorbed into Campaign Terminal) Bottom overlay panel, retained as reference |
| Terminal | CampaignTerminal | Unified campaign activity feed — merges changelog + campaign events. Resizable bottom overlay, session grouping, filter toggles, auto-poll (5s). Replaces ChangeLogPanel |
| Terminal | TerminalEventRow | Renders one terminal event — dispatches by type (changelog, dice_roll, chat, command, ai_message, game_event) with distinct styling |
| Terminal | CommandInput | Command input bar with history (up/down arrows), auto-submit on Enter, imperative prefill via ref |
| Forge | ForgePanel | GM design workshop — type filter, create form, publish/unpublish/delete, pending request queue with approve/deny, governor toggle selector for skills |
| Campaign | CampaignCreator, JoinCampaign | Campaign creation with world context, invite code join |
| Backstory | BackstoryEditor, BackstoryReview | Structured prompt editor, GM review interface |
| Auth | AuthForm, RedeemCode | Login/register with access code, post-registration upgrade |
| 3D Dice | DiceOverlay, DiceOverlayLoader, DiceAnimator, DiceScene, DicePhysics, DiceMesh, DiceTextureAtlas, DiceResultBar, DiceToggle | Full 3D dice rolling visualization. Three.js + Cannon-es physics. Lazy-loaded via next/dynamic. Mounted in root layout. Auto-subscribes to DiceService events. Snap-to-result after physics settle. Death save dramatic effects. Skip/Escape to dismiss. Toggle ON/OFF via localStorage |
| UI | ComplexTooltip | 500ms lock-on-hover tooltip with nested tooltip support via createPortal |
| UI | ConfirmDialog, Modal | Reusable dialog/modal primitives |
| Branding | GrowthLogo | Canonical logo rendering, scalable via `scale` prop. DO NOT modify without Mike's approval |
| Branding | GlitchText | Glitch text effect component for reality layer transitions |
| Layout | DashboardShell | Role-aware page wrapper with header |

## Types

| File | Contents |
|------|----------|
| `types/growth.ts` | GrowthCharacter, GrowthAttributes, GrowthConditions, GrowthLevels, GrowthCreation, GrowthSkill (with SkillGovernor[], no categories/combat flag), GrowthMagic, GrowthTrait, GROvine, GrowthFear, GrowthVitals, GrowthInventory, SKILL_GOVERNORS, PILLARS constant |
| `types/krma.ts` | WalletType, KrmaState, ActorType, TransactionReason (30+ codes), genesis constants (supply, distribution, burn cap), KV evaluator constants, pillar classification helpers, TKVBreakdown, DeathSplitManifest, WalletSummary, TransactionRecord, ReconciliationReport |
| `types/changelog.ts` | ChangeActor (player, gm, ai_copilot, system), ChangeCategory, FieldChange (field/oldValue/newValue), ChangeLogEntry (full DB record type), query/create/revert input types |
| `types/terminal.ts` | TerminalEvent (unified event type), TerminalEventType, TerminalPayload (discriminated union), payload types (ChangeLogPayload, DiceRollPayload, ChatPayload, CommandPayload, AIMessagePayload, GameEventPayload), GameSessionInfo, TerminalFilter |
| `types/dice.ts` | DieType, DieColor, RollSource (discriminated union — 10 source types), DieSpec, RollRequest, DieOutcome, RollResult, ContestedRollResult, InjectionFilter, InjectionOverride, DiceInjection, legacy compat types |
| `types/location.ts` | LocationType (settlement/wilderness/dungeon/building/POI/region), Location fields, create/update input types |
| `types/item.ts` | ItemType, WorldItem fields, damage/armor/material types, HeldItemData (bridge type for inventory display) |
| `types/material.ts` | Material system: ResistType (soft/hard), MaterialMod union type, Material interface, weight level labels, condition labels, armor layer rules |
| `lib/materials.ts` | Material catalog (25+ materials: Linen→Dragonscale), getMaterial(), combineMaterials(), getAvailableMaterials() |
| `types/encounter.ts` | EncounterType (combat/social/exploration/puzzle/event), EncounterPhase (intention/resolution/impact), Encounter fields, participant/round tracking types |
| `types/crystallization.ts` | CrystallizationEntry, CrystallizationLedger, crystallize/dissolve request/response types |

## Hooks

| Hook | File | Purpose |
|------|------|---------|
| useDiceEvents | `hooks/useDiceEvents.ts` | Subscribe to dice roll events from DiceService event bus |
| useDiceQueue | `hooks/useDiceEvents.ts` | Accumulate roll results in a queue for sequential 3D animation |

## API Routes (39 total)

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
| /api/krma/wallets/me | GET | KRMA Wallet (authenticated user's wallet balance) |
| /api/krma/wallets/me/transactions | GET | KRMA Wallet (paginated transaction history, filterable by reason) |
| /api/krma/campaigns/[id]/balance | GET | KRMA Wallet (campaign wallet balance, GM-only) |
| /api/krma/campaigns/[id]/fund | POST | KRMA Wallet (GM funds campaign from personal wallet) |
| /api/krma/campaigns/[id]/defund | POST | KRMA Wallet (GM withdraws from campaign to personal wallet) |
| /api/krma/campaigns/[id]/transactions | GET | KRMA Wallet (campaign transaction history, GM-only) |
| /api/krma/campaigns/[id]/economy | GET | KRMA Wallet (campaign fluid/crystallized/total breakdown, GM-only) |
| /api/krma/campaigns/[id]/crystallize | POST, GET | Crystallization (crystallize/dissolve entities, get ledger + crystallized IDs) |
| /api/krma/metrics | GET | KRMA Wallet (global KRMA metrics, Admin-only) |
| /api/krma/audit/verify | POST | KRMA Reconciliation (full ledger audit, Admin-only) |
| /api/dice/roll | POST | DiceService (quick roll — one or more dice, no DR/effort) |
| /api/dice/check | POST | DiceService (full skill/unskilled check with DR, effort, modifiers) |
| /api/dice/inject | GET, POST, DELETE | DiceInjection (Godhead-only — list/register/remove injections) |
| /api/campaigns/[id]/locations | GET, POST | LocationService (list + create locations, GM-only create) |
| /api/campaigns/[id]/locations/[locationId] | GET, PATCH, DELETE | LocationService (get/update/delete location, GM-only) |
| /api/campaigns/[id]/items | GET, POST | CampaignItemService (list + create world items, GM-only create) |
| /api/campaigns/[id]/items/[itemId] | GET, PATCH, DELETE | CampaignItemService (get/update/delete item, GM-only) |
| /api/campaigns/[id]/encounters | GET, POST | EncounterService (list + create encounters, GM-only create) |
| /api/campaigns/[id]/encounters/[encounterId] | GET, PATCH, DELETE | EncounterService (get/update/delete encounter, GM-only) |
