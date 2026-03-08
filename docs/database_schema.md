# GRO.WTH Database Schema

Last updated: 2026-03-08
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
