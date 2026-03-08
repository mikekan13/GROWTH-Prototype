# Campaign Terminal — Design Plan

Last updated: 2026-03-08
Status: APPROVED — Mike reviewed, all questions resolved. Building now.

---

## 1. Core Concept

The Campaign Terminal replaces the current ChangeLog bottom overlay with a unified activity panel that serves as the central hub for everything happening in a campaign session. All activity streams into one interface with filtering to manage volume.

**What it absorbs:**
- The existing ChangeLogPanel (bottom overlay on canvas)
- Dice roll results (new)
- Player/GM chat (new)
- Command input (new)
- AI system messages (future)
- Game events (new)

**What it does NOT replace:**
- The Relations Canvas itself (spatial character management stays)
- Character sub-panels (SkillsCard, VitalsCard, etc. stay as canvas sub-panels)
- The canvas header/tabs

---

## 2. Event Stream Architecture

### 2.1 Unified Event Model

All terminal activity is represented as a `TerminalEvent`. This is a new type that wraps both persisted (DB-backed) and ephemeral (session-only) events.

```typescript
type TerminalEventType =
  | 'changelog'      // Character state changes (existing ChangeLog system)
  | 'dice_roll'      // Dice roll results
  | 'chat'           // Player/GM messages
  | 'command'         // Command execution + result
  | 'ai_message'     // AI copilot messages (future)
  | 'game_event';    // Narrative/system events (session start, combat begin, etc.)

interface TerminalEvent {
  id: string;                    // Unique ID (DB id for persisted, nanoid for ephemeral)
  type: TerminalEventType;
  timestamp: string;             // ISO 8601
  campaignId: string;

  // Who generated this event
  actor: 'player' | 'gm' | 'ai_copilot' | 'system';
  actorUserId: string;
  actorName: string;             // Display name

  // Optional character context
  characterId?: string;
  characterName?: string;

  // Type-specific payload (discriminated by `type`)
  payload: ChangeLogPayload | DiceRollPayload | ChatPayload | CommandPayload | AIMessagePayload | GameEventPayload;
}
```

### 2.2 Payload Types

```typescript
// Wraps an existing ChangeLogEntry — no duplication
interface ChangeLogPayload {
  entryId: string;               // References ChangeLog.id
  category: ChangeCategory;
  description: string;
  changes: FieldChange[];
  source: string | null;
  revertible: boolean;
  reverted: boolean;
}

interface DiceRollPayload {
  context: string;               // "Persuasion check" or "Fate Die"
  skillName?: string;
  skillLevel?: number;
  skillDie?: { die: string; value: number; isFlat: boolean };
  fateDie: { die: string; value: number };
  effort?: number;
  effortAttribute?: string;
  flatModifiers?: number;
  total: number;
  dr?: number;
  success?: boolean;
  margin?: number;
  isSkilled: boolean;
}

interface ChatPayload {
  message: string;
  // Future: in-character vs out-of-character flag
}

interface CommandPayload {
  input: string;                 // Raw command string ("/roll d20", "/spend focus 3")
  result: string;                // Human-readable result
  success: boolean;
}

interface AIMessagePayload {
  message: string;
  severity: 'info' | 'warning' | 'action' | 'question';
  actionTaken?: string;          // What the AI did (links to changelog entry)
  requiresConfirmation?: boolean;
}

interface GameEventPayload {
  eventType: string;             // "session_start", "combat_begin", "rest_short", etc.
  description: string;
}
```

### 2.3 Persistence Strategy

Not all events need DB persistence. The strategy:

| Event Type   | Persisted?          | Where?                                          |
|-------------|---------------------|--------------------------------------------------|
| changelog   | Yes (already)       | `ChangeLog` table (existing, no changes)         |
| dice_roll   | Yes                 | New `CampaignEvent` table                        |
| chat        | Yes                 | New `CampaignEvent` table                        |
| command     | Yes                 | New `CampaignEvent` table (input + result)       |
| ai_message  | Yes                 | New `CampaignEvent` table                        |
| game_event  | Yes                 | New `CampaignEvent` table                        |

**New DB Models:**

```prisma
model GameSession {
  id         String    @id @default(cuid())
  campaign   Campaign  @relation(fields: [campaignId], references: [id])
  campaignId String
  number     Int       // Session 1, 2, 3...
  name       String?   // Optional session title
  startedAt  DateTime  @default(now())
  endedAt    DateTime? // Null = session in progress
  events     CampaignEvent[]

  @@unique([campaignId, number])
  @@index([campaignId])
}

model CampaignEvent {
  id            String       @id @default(cuid())
  campaign      Campaign     @relation(fields: [campaignId], references: [id])
  campaignId    String
  session       GameSession? @relation(fields: [sessionId], references: [id])
  sessionId     String?      // Null = between sessions (downtime)
  type          String       // dice_roll | chat | command | ai_message | game_event
  actor         String       // player | gm | ai_copilot | system
  actorUserId   String
  actorName     String
  characterId   String?      // Optional: which character this relates to
  characterName String?
  payload       String       // JSON: type-specific payload
  createdAt     DateTime     @default(now())

  @@index([campaignId, createdAt])
  @@index([campaignId, type])
  @@index([sessionId])
}
```

Events with `sessionId = null` are "between sessions" (downtime activity). The terminal groups events by session, with collapsible session headers. GM starts/ends sessions via commands (`/session start`, `/session end`).

**Why not merge into ChangeLog?**
- ChangeLog is specifically designed for character state changes with diff/coalescence/revert. It has `snapshotBefore`, `changes` (FieldChange[]), `revertible`, etc.
- Terminal events (chat, dice, game events) are fundamentally different — they're append-only activity, not state diffs.
- Keeping them separate preserves the ChangeLog's clean purpose and avoids polluting it with non-revertible noise.
- The Terminal UI merges both streams at display time using a unified `TerminalEvent` wrapper.

---

## 3. Terminal UI Design

### 3.1 Layout

The Terminal replaces the current ChangeLog bottom overlay. Same position (bottom of canvas), same toggle mechanism, but wider scope. **User can resize height** by dragging the top edge (persisted to localStorage per campaign). Events are **grouped by session** — collapsible session headers let users hide past activity.

```
┌─────────────────────────────────────────────────┐
│  Campaign Header (tabs: Relations / Forge / ...) │
├─────────────────────────────────────────────────┤
│                                                  │
│              Relations Canvas                    │
│         (characters, sub-panels, etc.)           │
│                                                  │
├──────────────────────┬──────────────────────────┤
│                      │                           │
│  ▲ CAMPAIGN TERMINAL │  [Filter: All ▼] [🎲] [📋]│
│                      │                           │
├──────────────────────┴──────────────────────────┤
│ [SYS] Session started                    just now│
│ [GM]  Alaric: clout spent 2 (5 → 3)        12s │
│ [PLR] Alaric rolled Persuasion vs DR 8   SUCCESS│
│       SD d8[6] + FD d6[4] + 2 effort = 12      │
│ [PLR] I try to convince the guard.          45s │
│ [GM]  Roll for it. DR 8, use Wit.          1m   │
│                                                  │
├─────────────────────────────────────────────────┤
│ > /roll persuasion dr:8 effort:2 attr:wit    [⏎]│
└─────────────────────────────────────────────────┘
```

### 3.2 Visual Styling Per Event Type

All events use the existing aesthetic (dark bg, Consolas monospace, gold/teal accents):

| Event Type   | Actor Badge Color | Icon | Highlight Style                      |
|-------------|-------------------|------|--------------------------------------|
| changelog   | Per actor (existing)| ◈ ⚠ ★ etc.| Existing ChangeLogPanel row style |
| dice_roll   | Player/GM color   | 🎲   | Gold border-left, expanded breakdown |
| chat        | Player/GM color   | —    | Neutral, no special border           |
| command     | System (#666)     | >    | Teal monospace, dimmed               |
| ai_message  | Purple (#7050A8)  | ◆    | Purple border-left, italic           |
| game_event  | System (#666)     | ═    | Teal, centered, separator-like       |

### 3.3 Filter Controls

Top-right of the terminal header. Two approaches built simultaneously:

**Quick filters (toggle buttons):**
```
[ALL] [💬 Chat] [🎲 Dice] [◈ Changes] [◆ AI]
```
Each is a toggle — multiple can be active. "ALL" enables everything.

**These map to the existing ChangeLog query params plus the new CampaignEvent type filter.** The terminal fetches from both sources and merges by timestamp.

### 3.4 Command Input

Bottom of the terminal — always visible when terminal is open. A single text input with Consolas monospace styling.

**Phase 1 commands (minimal set):**

```
/roll <skill> dr:<number> effort:<number> attr:<attribute>
  → Perform a skill check. Spends effort from the attribute pool.
  → Example: /roll persuasion dr:8 effort:2 attr:wit

/roll <die>
  → Quick die roll (no skill check, just random).
  → Example: /roll d20, /roll d6

/spend <attribute> <amount>
  → Spend from an attribute pool.
  → Example: /spend focus 3

/restore <attribute> <amount>
  → Restore to an attribute pool.
  → Example: /restore clout 2

/msg <text>
  → Send a chat message (or just type without / prefix).
```

**Command Parser Design:**

```typescript
interface ParsedCommand {
  command: string;           // "roll", "spend", "restore", "msg"
  args: Record<string, string | number>;
  raw: string;               // Original input
}

// Parser is a simple function — no need for a framework
function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null;  // Plain text = chat message
  // Split on whitespace, extract key:value pairs
  // Return structured command
}
```

**Command execution** calls the same character-actions functions used by UI buttons:
- `/roll` → `performSkillCheck()` from `lib/character-actions.ts`
- `/spend` → `spendAttribute()` from `lib/character-actions.ts`
- `/restore` → `restoreAttribute()` from `lib/character-actions.ts`

This ensures commands and UI buttons always produce identical results + changelog entries.

---

## 4. Data Flow

### 4.1 Event Creation Flow

```
User action (UI button, command input, chat)
    │
    ├── Character state change? ──→ character-actions.ts ──→ onCharacterUpdate callback
    │                                                        ├── Updates canvas state
    │                                                        ├── PATCH /api/characters/:id (triggers ChangeLog)
    │                                                        └── Emits TerminalEvent(type: 'changelog')
    │
    ├── Dice roll? ──→ dice.ts ──→ POST /api/campaigns/:id/events
    │                              └── Emits TerminalEvent(type: 'dice_roll')
    │
    ├── Chat message? ──→ POST /api/campaigns/:id/events
    │                     └── Emits TerminalEvent(type: 'chat')
    │
    └── Command? ──→ parseCommand() ──→ execute ──→ results flow through above paths
```

### 4.2 Event Fetching Flow

The terminal needs to merge two data sources into one timeline:

```
Terminal Poll (every 5s when visible)
    │
    ├── GET /api/changelog?campaignId=X&after=lastTimestamp
    │   └── Returns ChangeLogEntry[] (existing system, unchanged)
    │
    ├── GET /api/campaigns/:id/events?after=lastTimestamp
    │   └── Returns CampaignEvent[] (new endpoint)
    │
    └── Client-side merge:
        ├── Wrap ChangeLogEntry[] as TerminalEvent(type: 'changelog')
        ├── Wrap CampaignEvent[] as TerminalEvent(type: event.type)
        ├── Add ephemeral events (commands) from local state
        └── Sort all by timestamp, render unified feed
```

### 4.3 Character Context

For dice rolls and commands, the terminal needs to know **which character** the current user controls in this campaign. This is resolved by:
1. Looking up the user's character in the campaign (most players have exactly one)
2. GM commands may need a character selector (dropdown or `/as <name>` prefix)

---

## 5. Integration Points

### 5.1 Existing ChangeLog System

**Zero changes to the ChangeLog service, types, or DB model.**

The terminal wraps ChangeLogEntry into TerminalEvent at the UI layer. The ChangeLog continues to:
- Auto-create entries via `updateCharacter()`
- Support coalescence (5s window)
- Support revert with conflict detection
- Query with filters and cursor pagination

The terminal just adds a new consumer of the same data.

### 5.2 Existing Character Actions

**Zero changes to the character-actions.ts pure functions** (except the ones already added: skill CRUD + performSkillCheck).

The terminal commands call the same functions. The `onCharacterUpdate` callback in CampaignCanvas handles persistence and changelog creation identically whether triggered by a UI slider drag or a terminal command.

### 5.3 Dice System

The `lib/dice.ts` module (already created) provides pure rolling functions. The terminal's command parser calls `performSkillCheck()` from character-actions.ts which internally uses dice.ts.

Dice results are:
1. Displayed in the terminal as a DiceRollPayload event
2. Persisted to CampaignEvent table
3. The effort spend goes through `spendAttribute()` → `onCharacterUpdate` → ChangeLog

### 5.4 Future AI Integration

AI messages will:
1. Be posted via an internal API (not user-facing)
2. Create CampaignEvent entries with type `ai_message`
3. Appear in the terminal feed with purple styling
4. If the AI takes an action (e.g., applying damage), it creates both:
   - An ai_message event ("Detected damage event → applying 5 to Clout")
   - A changelog entry (via the normal character update flow with actor='ai_copilot')

---

## 6. New API Routes

### POST /api/campaigns/[id]/events
Create a new campaign event (dice roll, chat, game event).

```typescript
// Input schema
{
  type: 'dice_roll' | 'chat' | 'game_event',
  characterId?: string,
  payload: { ... }  // Type-specific
}
```

### GET /api/campaigns/[id]/events
Query campaign events with filters.

```typescript
// Query params
{
  type?: string,       // Filter by event type
  after?: string,      // ISO timestamp for incremental fetching
  limit?: number,      // Default 50, max 200
  cursor?: string,     // Cursor-based pagination
}
```

---

## 7. New Files

```
lib/dice.ts                          ← Already created (pure dice utilities)
lib/character-actions.ts             ← Already updated (skill CRUD + performSkillCheck)
lib/terminal-commands.ts             ← NEW: Command parser + executor
types/terminal.ts                    ← NEW: TerminalEvent types + payloads
services/campaign-event.ts           ← NEW: CampaignEvent CRUD service
components/terminal/CampaignTerminal.tsx  ← NEW: Main terminal component (replaces ChangeLogPanel usage)
components/terminal/TerminalEventRow.tsx  ← NEW: Renders one TerminalEvent (dispatches by type)
components/terminal/CommandInput.tsx       ← NEW: Command input with parse + submit
app/api/campaigns/[id]/events/route.ts    ← NEW: API for campaign events
prisma/schema.prisma                 ← MODIFIED: Add CampaignEvent model + Campaign relation
```

### Files Modified (existing)
```
components/CampaignCanvas.tsx        ← Replace ChangeLogPanel with CampaignTerminal
components/changelog/ChangeLogPanel.tsx ← Kept but no longer directly used (Terminal wraps it)
```

---

## 8. Implementation Order

### Step 1: Foundation (types + DB)
- Create `types/terminal.ts` with all event types
- Add `CampaignEvent` model to Prisma schema, run migration
- Create `services/campaign-event.ts` (create + query)
- Create API routes for campaign events

### Step 2: Terminal UI Shell
- Create `CampaignTerminal.tsx` — merged event feed from ChangeLog + CampaignEvent
- Create `TerminalEventRow.tsx` — renders each event type with proper styling
- Replace ChangeLogPanel in CampaignCanvas with CampaignTerminal
- Filter toggles (All / Chat / Dice / Changes / AI)
- Auto-poll both data sources, merge by timestamp

### Step 3: Command System
- Create `lib/terminal-commands.ts` — parser + executor
- Create `CommandInput.tsx` — input field with command history (up arrow)
- Wire commands to character-actions.ts + onCharacterUpdate

### Step 4: Dice Integration
- Wire `/roll` command to `performSkillCheck()` / raw die rolls
- Dice results create both a CampaignEvent (dice_roll) and ChangeLog entry (effort spend)
- SkillsCard gets a "Roll" button per skill that opens command pre-filled

### Step 5: Chat
- Wire plain text input to create chat events
- POST to `/api/campaigns/:id/events` with type 'chat'

### Step 6: Skills Editing in SkillsCard
- Add/remove/level skills directly in the SkillsCard sub-panel
- Wire to addSkill/removeSkill/updateSkillLevel from character-actions.ts

---

## 9. Decisions (Mike's answers, 2026-03-08)

1. **Terminal position**: Bottom overlay — same as current ChangeLog. **User can resize height** by dragging the top edge.

2. **Chat persistence**: Persist forever. Events are **grouped by session** (Session 1, Between Session 1 and 2, Session 2, etc.) so users can collapse past sessions to focus on current activity. Needs a Session concept — GM starts/ends sessions, events between sessions are "downtime."

3. **Character context**: Auto-detect everything. Player's character is auto-resolved from campaign membership. All actions are logged with full context. This extends the existing changelog auto-detection pattern.

4. **Default input mode**: Plain text = chat message. `/` prefix = command. Future AI systems will monitor all terminal activity (chat + commands + events) and respond/act accordingly.

5. **Revert**: Keep revert buttons on changelog entries, same as current behavior.

---

## 10. What This Replaces

The current ChangeLogPanel bottom overlay is **absorbed** into the Campaign Terminal. The ChangeLogPanel component itself can be kept as a sub-component or its rendering logic folded into TerminalEventRow. The ChangeLog service/types/API are completely untouched — the Terminal just adds a new UI consumer.

The current `showChangeLog` state in CampaignCanvas becomes `showTerminal`. The toggle button text changes from "CHANGE LOG" to "CAMPAIGN TERMINAL".
