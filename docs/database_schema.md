# GRO.WTH Database Schema

Last updated: 2026-06-10 (Time system foundation — Timescale, HistoryEntry, Campaign clock)
Source of truth: `app/prisma/schema.prisma`

> NOTE: this doc lags the schema in places (it predates the GodHeadMemory /
> GodHeadInvocation / GodHeadActionLog / GodHeadMessage / Subscription /
> EmailVerificationToken / PasswordResetToken models). The schema file wins.

### Campaign — time fields (added 2026-06-10)
- `currentCycle`: Float, default 0 — the campaign's pocket-universe clock in META CYCLES (1 cycle ≈ 1 standard year). Rendered through the default timescale's calendar at display.
- `defaultTimescaleId`: String? — the campaign's primary calendar.

### Timescale (added 2026-06-10)
Campaign-local calendar converting meta cycles ↔ presented time. Carries the FULL customizable calendar per ruling r-2026-06-09-06.
- `name` ("Tiberoak Reckoning"), `unitName` ("year"), `unitsPerMetaCycle` (Float — local base-units per meta cycle)
- `calendar`: JSON<CalendarSpec> — months[{name,days}], dayNames[], hoursPerDay, epochYear/epochLabel, holidays[], seasons[], moons[] (`types/time.ts`)
- Every campaign auto-gets a "Standard Reckoning" (1 yr = 1 cycle, Earth-like) on first touch (`services/time.ensureDefaultTimescale`)
- Locations override via `data.timescaleId`; resolution walks located_at upward (`resolveTimescaleForLocation`)

### HistoryEntry (added 2026-06-10)
Per-canvas-object PERSPECTIVE history (ruling r-2026-06-09-07): one in-fiction event writes one entry per involved object, from that object's perspective, sharing an `eventGroupId`.
- `subjectType` ('location'|'character'|'item'|'campaign') + `subjectId`
- `timestampCycle`: Float — campaign clock at the event
- `type`: created|edited|arrival|departure|item_added|item_removed|status_change|clock_advance|harvest|narrative_event|combat
- `summary` (subject-perspective one-liner), `details?`, `actorId?`, `visibility` ('gm' default | 'public'), `realTime`
- Indexes: (campaignId, subjectType, subjectId, timestampCycle), (campaignId, eventGroupId)

### GrowthCharacter JSON — time fields
- `fatedAge` (top-level): META CYCLES (humans 80). `identity.fatedAge` REMOVED 2026-06-09 (was a drifting duplicate).
- `birthCycle?`: campaign clock at birth, stamped at assignMechanics. age = currentCycle − birthCycle.

## Models

### User
Core account. Roles determine interface access.
- `role`: TRAILBLAZER (default) | WATCHER | ADMIN | GODHEAD
- `profile`: JSON<TrailblazerProfile> — firstName, pronouns, bio, experienceLevel, systemsPlayed[], playstylePreferences[], playstyleNotes, conflictStyle, topicsToAvoid, availableDays[], preferredTime, timezone, sessionLength, frequency
- `watcherProfile`: JSON<WatcherProfile> — gmExperience, gmStyle, campaignPhilosophy, sessionZeroApproach, preferredGroupSize, contentWarningPolicy (WATCHER+ only)
- Relations: campaigns (as GM), characters, memberships, wallet, sessions, redeemed access codes

### Campaign
GM-created game world container.
- `worldContext`: Free-text world description for AI backstory assistance
- `customPrompts`: JSON array of GM-defined backstory prompts (appended to defaults)
- `listingStatus`: UNLISTED (default) | LISTED | CLOSED — controls EŶ∃tehrNET hub visibility
- `listingDescription`: Public-facing campaign pitch (separate from internal description)
- `listingTags`: JSON string[] — tags for hub filtering
- `requiredFields`: JSON string[] — profile fields GM requires from applicants
- `maxTrailblazers`: Seat limit (default 5, maps to subscription model)
- `inviteCode`: 8-char hex code for player enrollment
- Relations: characters, members (CampaignMember)

### CampaignMember
Player enrollment in a campaign (no character yet).
- Unique constraint: one membership per user per campaign
- Created when player redeems invite code or applies via EŶ∃tehrNET hub

### CampaignApplication (updated)
- `profileSnapshot`: JSON snapshot of applicant's profile at time of application
- Created atomically with CampaignMember when applying through hub

### Character
Universal entity sheet — players, NPCs, creatures, and God-heads all use the same model.
- `entityType`: PLAYER_CHARACTER (default) | NPC | CREATURE | GODHEAD
- `campaignId`: Nullable — God-heads and global NPCs may have no campaign
- `data`: JSON string containing `GrowthCharacter` (see types/growth.ts)
- `portrait`: Path to portrait image (null until generated)
- `status`: DRAFT → SUBMITTED → APPROVED → ACTIVE → DEAD | RETIRED
- Ownership: Player owns PCs, GM owns NPCs, Admin owns God-heads
- Relations: backstory (optional), portraitGenerations[], personaLock (optional), godHead (optional), goals[]

### PortraitGeneration
AI-generated portrait history for a character. One record per generation attempt.
- `characterId`: FK to Character (cascade delete)
- `imagePath`: Relative path to generated image (e.g. `portraits/{charId}/{genId}.png`)
- `thumbnailPath`: Smaller version for lists/tokens
- `prompt` / `negativePrompt`: Exact prompts used for generation
- `seed`: Random seed (for reproducibility)
- `model`: Model identifier (e.g. "flux1-dev-Q4_0")
- `steps`: Inference steps
- `pulidWeight`: PuLID identity strength (null for first generation)
- `styleLoraName` / `styleLoraWeight`: Style LoRA if used
- `generationTimeMs`: Wall clock time for generation
- `stateSnapshot`: JSON<PortraitCharacterData> — character visual state at generation time
- `status`: pending → completed → accepted | archived | failed
- `isCurrentPortrait`: Boolean — true for the active portrait (at most one per character)
- `campaignId`: Campaign context
- Indexes: characterId, (characterId + isCurrentPortrait)

### PersonaLock
Permanent identity anchor for a character. Stores the reference image and metadata
used by PuLID to maintain the same face across all future generations.
- `characterId`: Unique FK to Character (one lock per character, cascade delete)
- `referenceImagePath`: Path to the locked portrait image
- `embeddingPath`: Path to PuLID face embedding file (Phase B)
- `lockedPrompt`: The exact prompt that produced the accepted portrait
- `lockedSeed`: Seed of the accepted generation
- `bodyDescription`: Full body description for non-facial consistency (hair, scars, tattoos, build)
- `styleLora` / `loraStrength`: Style config at lock time
- `pulidWeight`: PuLID strength (default 0.8)
- `lockVersion`: Increments on re-lock (rare — major narrative transformation)
- `previousLockId`: Points to archived lock for history

### CharacterBackstory
Structured backstory responses from player.
- `responses`: JSON array of `{ prompt: string, response: string }`
- `narrative`: Compiled narrative (optional, for future AI-generated summary)
- `status`: DRAFT → SUBMITTED → APPROVED | REVISION
- `gmNotes`: Watcher feedback visible to player on REVISION

### AccessCode
QR code credentials from physical rulebook.
- `code`: 8-char uppercase hex, unique
- `role`: Role granted on redemption (default WATCHER)
- `label`: Human-readable label ("Alpha Tester", "Kickstarter Backer")
- One-time use: `redeemedById` + `redeemedAt` set on redemption
- Optional `expiresAt` for time-limited codes

### Wallet
KRMA currency holder. Every unit of KRMA lives in exactly one wallet.
- `walletType`: USER | RESERVE | CAMPAIGN | CHARACTER | BURN | LADY_DEATH | GODHEAD
- `ownerType`: Kept for backwards compat; `walletType` is canonical
- `label`: Reserve: "Terminal","Mercy","Balance","Severity"; System: "Burn Sink","Lady Death"
- `ownerId`: Unique per user (USER wallets)
- `campaignId`: For CAMPAIGN wallets
- `characterId`: For CHARACTER wallets
- `frozen`: Admin hold flag
- **Cardinality**: 4 RESERVE, 1 BURN, 1 LADY_DEATH, 1 per God-head (GODHEAD), 1 per user, 1 per campaign, 1 per character
- **Genesis**: 100B KRMA distributed to reserves (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%)

### KrmaTransaction
Append-only KRMA transaction ledger. Immutable, checksummed, sequenced.
- `sequenceNumber`: Global monotonic counter (unique, gap-free)
- `fromWalletId` / `toWalletId`: Source and destination wallets
- `amount`: BigInt, always positive
- `state`: FLUID | LOCK | UNLOCK | BURN
- `reason`: Transaction type code (30+ types, see `types/krma.ts`)
- `description`: Human-readable explanation
- `metadata`: JSON string containing context (characterId, campaignId, deathContext, kvBreakdown, etc.)
- `actorId` / `actorType`: Who initiated (USER, SYSTEM, GM, EVALUATOR, GODHEAD)
- `checksum`: SHA-256 hash chain link (tamper detection)
- `idempotencyKey`: Unique, prevents duplicate transactions

### LedgerSequence
Singleton for atomic sequence number generation.
- `id`: Always "singleton"
- `current`: Current sequence number (BigInt)

### BurnLedger
Singleton tracking global KRMA burn total and hard cap.
- `id`: Always "singleton"
- `totalBurned`: BigInt
- `cap`: 5,000,000,000 (5B hard cap)

### AuditEntry
Audit log for all attempted KRMA operations (including failures).
- `actorId` / `actorType`: Who attempted
- `action` / `targetType` / `targetId`: What was attempted
- `outcome`: SUCCESS | DENIED | FAILED | ERROR
- `reason` / `metadata`: Context

### ChangeLog
Immutable record of every character data change. Supports timeline view, filtering, and revert.
- `id`: String (cuid)
- `campaignId`: String — which campaign this change belongs to
- `characterId`: String — which character was modified
- `characterName`: String — denormalized for display without joins
- `groupId`: String — groups coalesced changes (same actor + character within 5s window)
- `actor`: Enum — `player` | `gm` | `ai_copilot` | `system`
- `actorUserId`: String (optional) — the user who made the change
- `category`: String — inferred from changed fields (e.g., attributes, inventory, vitals, skills, magic, identity, grovines, backstory, status, other)
- `description`: String — human-readable summary of what changed
- `changes`: JSON — `FieldChange[]` array, each with `{ field, oldValue, newValue }`
- `source`: String (optional) — origin context (e.g., "character-builder", "canvas-edit", "revert")
- `revertible`: Boolean (default true) — whether this entry can be reverted
- `revertedAt`: DateTime (optional) — set when entry is reverted
- `revertedBy`: String (optional) — userId who performed the revert
- `snapshotBefore`: JSON (optional) — full character data snapshot before the change (for complex reverts)
- `createdAt`: DateTime
- Indexes: `(campaignId, createdAt)`, `(characterId, createdAt)`, `(groupId)`

### GameSession
Numbered game session within a campaign. Used by Campaign Terminal for event grouping.
- `id`: String (cuid)
- `campaignId`: String — which campaign this session belongs to
- `number`: Int — sequential session number (unique per campaign via `@@unique([campaignId, number])`)
- `name`: String (optional) — human-readable session name (e.g., "The Dragon's Lair")
- `startedAt`: DateTime — when the session was started
- `endedAt`: DateTime (optional) — null while session is active
- Relations: campaign, events (CampaignEvent[])

### CampaignEvent
Activity event in a campaign (dice rolls, chat, commands, AI messages, game events). Merged with ChangeLog entries at display time in the Campaign Terminal.
- `id`: String (cuid)
- `campaignId`: String — which campaign this event belongs to
- `sessionId`: String (optional) — which GameSession this event belongs to (null = "between sessions")
- `type`: String — event type: `dice_roll` | `chat` | `command` | `ai_message` | `game_event`
- `actor`: String — who created the event: `player` | `gm` | `ai_copilot` | `system`
- `actorUserId`: String (optional) — the user who created the event
- `actorName`: String — display name of the actor
- `characterId`: String (optional) — character involved (if any)
- `characterName`: String (optional) — denormalized character name
- `payload`: JSON — event-specific data (see TerminalPayload types in `types/terminal.ts`)
- `createdAt`: DateTime
- Relations: campaign, session (GameSession, optional)
- Indexes: `(campaignId, createdAt)`, `(sessionId)`

### ForgeItem (Blueprint)
Design template (skill, item, nectar, blossom, thorn). Can be campaign-scoped or global catalog.
- `id`: String (cuid)
- `campaignId`: String (nullable) — null for global catalog items
- `type`: String — `skill` | `item` | `nectar` | `blossom` | `thorn`
- `name`: String — design name (unique per campaign + type)
- `status`: String — `draft` | `published` | `global`
- `data`: JSON — type-specific details (e.g., skill: `{ governors, description }`)
- `createdBy`: String — userId of the GM who created it
- **Global catalog fields:**
  - `isGlobal`: Boolean — true = lives in global catalog
  - `sourceGlobalId`: String (nullable) — if this is a campaign instance of a global blueprint
  - `authorUserId`: String (nullable) — original author for royalty tracking
- **Authorship economy:**
  - `useCount`: Int — times instantiated across campaigns
  - `royaltyRate`: Float (default 0.01) — KRMA fraction paid to author on reuse
- **Blueprint decay (Lady Death):**
  - `lastUsedAt`: DateTime (nullable) — last instantiation
  - `decayStatus`: String — ACTIVE | FLAGGED | DISSOLVING | DISSOLVED
  - `flaggedAt`: DateTime (nullable)
- **Karmic evaluation (Kai):**
  - `relationshipTags`: JSON — `[{ blueprintId, interactionType, synergyRisk }]`
  - `karmicValue`: BigInt (nullable) — locked value assigned by Kai
  - `evaluatedAt`: DateTime (nullable)
- Relations: campaign (optional), requests (PlayerRequest[])
- Indexes: `(campaignId, type)`, `(campaignId, status)`, `(isGlobal, type)`, `(authorUserId)`, `(decayStatus)`, `@@unique([campaignId, name, type])`

### PlayerRequest
Player request for a new campaign component. Submitted from SkillsCard (or future panels), reviewed by GM in the Forge.
- `id`: String (cuid)
- `campaignId`: String — which campaign
- `requesterId`: String — userId of the requesting player
- `type`: String — same types as ForgeItem
- `name`: String — requested name
- `status`: String — `pending` | `approved` | `denied` | `modified`
- `data`: JSON — what the player wants (e.g., skill: `{ governors, description }`)
- `gmNotes`: String (optional) — GM feedback
- `forgeItemId`: String (optional) — linked ForgeItem once approved/modified
- `createdAt`: DateTime
- `updatedAt`: DateTime
- Relations: campaign, forgeItem (optional)
- Indexes: `(campaignId, status)`, `(requesterId)`

### Location
Campaign-level location entity. Appears as an expandable card on the Relations Canvas.
- `id`: String (cuid)
- `campaignId`: String — which campaign
- `name`: String — location name
- `type`: String — `settlement` | `wilderness` | `dungeon` | `building` | `point_of_interest` | `region`
- `data`: JSON — `GrowthLocation` (see `types/location.ts`)
- `status`: String — `ACTIVE` | `HIDDEN` | `DESTROYED`
- `createdBy`: String — userId of creator (GM)
- Indexes: `(campaignId)`, `(campaignId, type)`

### CampaignItem
Campaign-level item entity. Represents weapons, armor, artifacts, prima materia, etc. as standalone world objects.
- `id`: String (cuid)
- `campaignId`: String — which campaign
- `name`: String — item name
- `type`: String — `weapon` | `armor` | `accessory` | `consumable` | `tool` | `artifact` | `prima_materia` | `misc`
- `data`: JSON — `GrowthWorldItem` (see `types/item.ts`)
- `holderId`: String (optional) — characterId of current holder
- `locationId`: String (optional) — locationId where item resides
- `status`: String — `ACTIVE` | `DESTROYED` | `CONSUMED` | `LOST`
- `createdBy`: String — userId of creator (GM)
- Indexes: `(campaignId)`, `(campaignId, type)`, `(holderId)`, `(locationId)`

### Encounter
Combat, social, or exploration encounter. Tracks three-phase resolution (Intention → Resolution → Impact).
- `id`: String (cuid)
- `campaignId`: String — which campaign
- `name`: String — encounter name
- `type`: String — `combat` | `social` | `exploration` | `puzzle` | `event`
- `status`: String — `PLANNED` | `ACTIVE` | `PAUSED` | `RESOLVED`
- `round`: Int — current combat round (0 = not started)
- `phase`: String — `intention` | `resolution` | `impact`
- `data`: JSON — `GrowthEncounter` (see `types/encounter.ts`)
- `locationId`: String (optional) — where this encounter takes place
- `sessionId`: String (optional) — which game session
- `createdBy`: String — userId of creator (GM)
- Indexes: `(campaignId)`, `(campaignId, status)`

### Session
Auth session token.
- 7-day expiration, cleaned up on logout or expiry

### Goal
Core gameplay loop entity. Tracks a character's narrative goal with God-head custodianship.
- `characterId`: String — the entity that owns this goal (PC, NPC, God-head)
- `campaignId`: String (nullable) — God-head meta-goals may be campaign-independent
- `description`: String — plain language goal ("Find my father's killer")
- `status`: ACTIVE | COMPLETED | FAILED | ABANDONED
- `priority`: Int 1-5
- **God-head custodianship:**
  - `custodianId`: String (nullable) — GodHead.id that adopted this goal
  - `custodianName`: String (nullable) — cached display name
  - `pillar`: String (nullable) — MERCY | BALANCE | SEVERITY
- **Resistance:**
  - `resistancePrompt`: String (nullable) — auto-generated prompt to GM
  - `resistancePlan`: String (nullable) — GM's response
- **Progress:**
  - `milestones`: JSON — `[{ id, description, completed, nectarAwarded?, completedAt? }]`
  - `nectarsEarned`: Int
  - `completedAt`: DateTime (nullable)
- Indexes: `(characterId, status)`, `(campaignId, status)`, `(custodianId)`

### EntityRelationship
Graph edge connecting any two entities in the campaign. Enables God-head context queries.
- `campaignId`: String (nullable) — null for cross-campaign relationships (God-head networks)
- `sourceId` / `sourceType`: Source node (CHARACTER, NPC, LOCATION, ITEM, GODHEAD, GOAL)
- `targetId` / `targetType`: Target node
- `relationshipType`: String — ally, rival, parent, guardian, custodian, located_at, owns, created_by, etc.
- `strength`: Int 1-10 (default 5)
- `bidirectional`: Boolean (default false)
- `data`: JSON (nullable) — relationship-specific metadata
- Unique constraint: `(sourceId, targetId, relationshipType)`
- Indexes: `(campaignId)`, `(sourceId, sourceType)`, `(targetId, targetType)`

### GodHead
Supplementary metadata for God-head entities. Links to a Character record (universal sheet).
- `name`: String (unique) — "Lady Death", "Kai", "Eth'erling"
- `domain`: String — "Death, decay, karmic recycling, blueprint maintenance"
- `pillar`: String — MERCY | BALANCE | SEVERITY
- `characterId`: String (unique) — FK to Character record
- `systemPrompt`: String — core personality + domain authority for Claude API calls
- `temperature`: Float (default 0.7)
- `active`: Boolean (default true)
- `walletId`: String (nullable) — God-head's KRMA wallet
- God-heads use Claude (cloud API) for reasoning, not Ollama

## JSON Field Schemas

### Character.data → GrowthCharacter
See `types/growth.ts` for full interface. Key sections:
- `identity`: name, age, fatedAge, background, description
- `attributes`: 9 attributes across 3 pillars (Body/Spirit/Soul)
- `creation`: seed, root, branches
- Note: WTH levels (wealthLevel/techLevel/healthLevel) removed 2026-04-05. Characters use fatedAge (from seed) instead.
- `skills`, `magic`, `traits`, `grovines`, `fears`, `vitals`, `inventory`

### CharacterBackstory.responses
```json
[
  { "prompt": "Where did you grow up?", "response": "In the shadow of..." },
  { "prompt": "Who raised you?", "response": "My grandmother, a..." }
]
```

### Campaign.customPrompts
```json
["Are you part of the King's Dominion?", "What is your relationship with magic?"]
```
