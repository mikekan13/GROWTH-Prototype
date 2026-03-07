# GRO.WTH Database Schema

Last updated: 2026-03-07
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
