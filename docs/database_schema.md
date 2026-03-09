# GRO.WTH Database Schema

Last updated: 2026-03-09 (Skeleton Systems — Location, CampaignItem, Encounter)
Source of truth: `app/prisma/schema.prisma`

## Models

### User
Core account. Roles determine interface access.
- `role`: TRAILBLAZER (default) | WATCHER | ADMIN | GODHEAD
- Relations: campaigns (as GM), characters, memberships, wallet, sessions, redeemed access codes

### Campaign
GM-created game world container.
- `worldContext`: Free-text world description for AI backstory assistance
- `customPrompts`: JSON array of GM-defined backstory prompts (appended to defaults)
- `maxTrailblazers`: Seat limit (default 5, maps to subscription model)
- `inviteCode`: 8-char hex code for player enrollment
- Relations: characters, members (CampaignMember)

### CampaignMember
Player enrollment in a campaign (no character yet).
- Unique constraint: one membership per user per campaign
- Created when player redeems invite code

### Character
Player character with full game data.
- `data`: JSON string containing `GrowthCharacter` (see types/growth.ts)
- `portrait`: Path to portrait image (null until generated)
- `status`: DRAFT → SUBMITTED → APPROVED → ACTIVE → DEAD | RETIRED
- Relations: backstory (optional)

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
KRMA currency holder. One per user + reserve wallets.
- `ownerType`: USER | RESERVE
- `label`: For reserve wallets ("Terminal", "Mercy", "Balance", "Severity")
- Not yet implemented in app logic

### KrmaTransaction
KRMA transfer record. Immutable ledger.
- Not yet implemented in app logic

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

### ForgeItem
Campaign-level design template (skill, item, nectar, blossom, thorn). Created by GM in the Forge.
- `id`: String (cuid)
- `campaignId`: String — which campaign this design belongs to
- `type`: String — `skill` | `item` | `nectar` | `blossom` | `thorn`
- `name`: String — design name (unique per campaign + type)
- `status`: String — `draft` | `published`
- `data`: JSON — type-specific details (e.g., skill: `{ governors, description }`)
- `createdBy`: String — userId of the GM who created it
- `createdAt`: DateTime
- `updatedAt`: DateTime
- Relations: campaign, requests (PlayerRequest[])
- Indexes: `(campaignId, type)`, `(campaignId, status)`, `@@unique([campaignId, name, type])`

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

## JSON Field Schemas

### Character.data → GrowthCharacter
See `types/growth.ts` for full interface. Key sections:
- `identity`: name, age, fatedAge, background, description
- `attributes`: 9 attributes across 3 pillars (Body/Spirit/Soul)
- `levels`: wealthLevel, techLevel, healthLevel (1-10)
- `creation`: seed, root, branches
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
