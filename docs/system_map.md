# GRO.WTH System Map

Last updated: 2026-07-10 (Contract system T13; earlier: Time system + per-object history + Location edit mode)

> NOTE: sections below lag the codebase in places (canvas folders, JEWL
> dialog, godhead runtime, subscriptions). The code wins; this doc catches
> up incrementally.

## Contract System (added 2026-07-10, T13 / INV-115)

Terminal-enforced obligations that keep the meta honest (same-mechanics
principle): parties + a predicate that must HOLD + a typed penalty.

- **Predicate DSL** (`types/contracts.ts`): typed JSON, never code —
  comparisons over `tkv(character)` (locked sheet KV via the deterministic
  evaluator + linked wallet balances), `walletBalance`, `reserveBalance`,
  `totalSupply(excludeReserves)`, arithmetic, and/or/not, `before(date)`.
- **Evaluator** (`services/contracts.ts`): fires debounced (~2s) after every
  ledger commit (dynamic-import hook at the end of `executeTransaction`) +
  manual/sweep routes. Reads only; writes = append-only `ContractEvaluation`
  audit rows + the ACTIVE→VIOLATED flip (INV-14). Kill switch:
  `CONTRACTS_ENABLED=false`.
- **Penalty pipeline**: every violation creates ONE `PenaltyAction`
  (PENDING_CONFIRMATION). ADMIN confirms → execution (KRMA_TRANSFER through
  the ledger, STATUS_CHANGE/DISSOLUTION as character status). Nothing
  destructive is automatic — Dissolution is always behind the human gate.
- **Immutable tier** (INV-101): seed-only creation; PATCH/revoke rejected at
  the service layer. `voteRef` reserved for the deferred in-game vote/Triu
  mechanism.
- **Surfaces**: ADMIN-only routes (`/api/contracts*`, `/api/penalty-actions/*`)
  and the ContractsDock on the `__PRIME__` canvas (ADMIN-only overlay).
- **Seeds**: Tara's 20% cap (threshold lives in predicate data — tunable) and
  the immutable Death-succession declaration. Acceptance: `scripts/test-contracts.ts`.

## Death Saves End-to-End (added 2026-07-11, T27 / r-2026-07-11-01/-02)

**The roll (both doors):** character's Fate Die vs Tara's CHOSEN die (full
ladder 1/2/3/d4/d6/d8/d12/d20, or she declines to reap). Ties go to Lady
Death. Her post-roll authority is one-way mercy: she can spare a failed
roll, never overrule a survived one. bodyResist plays no role.

- **Triggers** (`death_save` SSE event, phase TRIGGERED): Frequency Deplete
  crossing 0 (`services/frequency.ts`) and vital-part destruction
  (`services/damage.ts`; `isVital` on Brain/Heart in the Human baseline).
- **Service** (`services/death-save.ts`): roll resolution with injectable
  rng; trait modifiers fire via the SAME engine as skill checks
  (`skillName: 'Death Save'` matching — sources surfaced on the outcome);
  COMBAT success restores 1 Frequency / vital +1 step; FATED_AGE
  three-strike counter; failure marks `pendingDeathSplit`;
  `sparePendingDeath` = the mercy window. Routes
  `death_save.resolved` → Tara via the dispatcher.
- **Dispatcher fix**: routing table keys are GodHead.name DB values — the
  old `'Lady Death'` key silently dropped EVERY death event (her row is
  `'Tara Almswood'`).
- **UI** (black-void Mode 2): `DeathSaveDialog` (GM takeover on trigger —
  die ladder + DO NOT REAP → dramatic result → SPARE THEM / OPEN THE
  SPLIT) and `SplitConfirmDialog` (exact manifest routing preview,
  two-step confirm → GHOST). Mounted in CampaignCanvas.
- **Routes**: GET/POST/DELETE `/api/characters/[id]/death-save`; the split
  executes only through the pre-existing GM death route.
- Acceptance: `scripts/test-death-e2e.ts` (14 checks — trigger, survive+
  restore, tie dies, mercy, Nectar buff flips a loss, full death with
  ledger rows + Tara invocation).

## JEWL Table State — Complete Present Knowledge (added 2026-07-11)

Mike's directive: content can hook ANY interaction ("a Nectar that makes
the whole party face death"), so JEWL — the effect-interpretation layer —
must SEE everyone's effect-bearing state on every dispatch, pushed rather
than mention-matched. `buildTableState` (context-assembler) injects a
TABLE STATE block: every non-draft character's attributes (current/max),
active conditions, EVERY trait with its rule text + rollModifiers, and
held/equipped items. Soft cap 15 characters (overflow announced, never
silent; deep detail via read_actors_state). See memory
`effects-route-through-one-layer-2026-07-11`.

## Inventory Paperdoll (added 2026-07-10, T26)

Three tiers — EQUIPPED / CARRIED / POSSESSIONS — with NO hardcoded slots:
equip regions are DERIVED from the character's body-part item tree
(`lib/body-tree.ts` walks `bodyAnatomy`; INV-55), so a hand-built
non-humanoid body produces its own regions with zero code changes.

- Equip state = `equippedTo: <regionKey>` on the CampaignItem's data JSON
  (single source of truth). Carried = held, not equipped. Possessions =
  `owns` EntityRelationship links (INV-62).
- **Damage integration**: `routeDamage` gained `wornLayers` — equipped
  ARMOR absorbs before the part it covers, resist × armor-category
  multiplier (Clothing 0.5 / Light 1.0 / Heavy 1.5; layer caps Soft≤3,
  Light≤1, Heavy≤1 per region, INV-52). Condition loss follows the
  VALIDATED damage-type × material matrix (`Damage_Type_Interactions.md`):
  piercing never degrades materials; bashing dents Hard / slashing cuts
  Soft at threshold; heat auto-degrades Soft (and passes through it
  unreduced); cold auto-degrades Hard; decay degrades both; energy
  bypasses all armor entirely. Overwhelming damage (≥3× resist) destroys
  the item instantly; Broken items give half resist; condition changes
  persist to the item rows (DESTROYED at 0). Non-armor equipment is not
  a damage layer.
- Encumbrance: total held lbs vs Clout×10 (INV-48) with
  Fine/Near Limit/Encumbered/Overloaded thresholds.
- Surfaces: `components/character/Paperdoll.tsx` on the character sheet;
  `GET /api/characters/[id]/inventory`, `POST/DELETE .../inventory/equip`.
- Acceptance: `scripts/test-paperdoll.ts` (15 checks, incl. armored-torso
  cascade and a serpent body tree).

## Time System (added 2026-06-10)

Each campaign is a pocket universe with its own clock, stored in META CYCLES
(`Campaign.currentCycle`, 1 cycle ≈ 1 standard year) and PRESENTED through
fully customizable calendars (`Timescale` + JSON CalendarSpec — months, week
days, hours/day, epoch, holidays; ruling r-2026-06-09-06 requires GM control
of presentation at release).

- Math + types: `types/time.ts` (cycleToLocalDate, localUnitsToCycles incl.
  6 s combat rounds, dualAge, STANDARD_CALENDAR, SECONDS_PER_META_CYCLE)
- Service: `services/time.ts` (timescale CRUD, getClock/advanceClock/setClock,
  ensureDefaultTimescale, resolveTimescaleForLocation — inheritance walks
  located_at upward, characterDualAge)
- Routes: `/api/campaigns/[id]/timescales` (+ `[timescaleId]`),
  `/api/campaigns/[id]/clock`, `/api/campaigns/[id]/history`
- UI: `components/time/CampaignClock.tsx` — clock chip in the canvas header
  (presented date + holiday + cycle count), GM advance popover (quick +1h…+1yr,
  custom amount/unit), full Calendar & Timescale editor (CtxMenuPanel chrome)
- Characters: `birthCycle` stamped at assignMechanics; `fatedAge` top-level in
  meta cycles. Fated-age death per ruling r-2026-06-09-01 (FD only vs Tara,
  escalating age-Thorns, 3rd fail = death).

## Per-Object History (added 2026-06-10)

Perspective-based history per ruling r-2026-06-09-07: events log INTO the
canvas objects involved — Locations log what happens in them; every PC/NPC
carries an experiential log. One event → N perspective entries (shared
eventGroupId), timestamped in meta cycles.

- Service: `services/history.ts` (writeHistory, queryHistory, currentCycleOf)
- Wired into: location create / re-parent (3 perspectives) / field edits /
  status flips (crystallize/dissolve), clock changes
- Route: `/api/campaigns/[id]/history` — players see only `public` entries
- Future writers: JEWL session engine (r-2026-06-09-08), combat, harvests

## Location Edit Mode (added 2026-06-10)

Right-click a Location folder → chooser (canonical CtxMenu chrome):
eDIT tHIS pLACE / cREATE inSIDE / dELETE dRAFT (PLANNING) or
dISSOLVE tO pLAnnInG (ACTIVE — active world-pieces are never hard-deleted,
ruling r-2026-06-09-09; enforced in `services/location.deleteLocation`).
Edit reuses the ONE JEWL dialog (`CanvasCreateDialog` with `existing`
payload): fields prefilled as the editable preview; JEWL runs an edit-aware
dialogue (`editLocationId` through `/api/copilot/create-dialog`). Commit
merges into the existing data JSON, preserving canvas coords etc.

## Architecture Overview

Next.js 16 App Router with layered architecture adapted for the framework:

```
Interface Layer     →  app/ (pages + API routes)
Service Layer       →  services/ (business logic, Zod validation)
Infrastructure      →  lib/ (auth, database, utilities, permissions, errors)
AI Systems          →  ai/ (portrait pipeline, future Oracle)
Data Layer          →  Prisma 7 + SQLite (beta) → PostgreSQL (production)
Types               →  types/growth.ts (GrowthCharacter, game mechanics)
```

## Data Flow

```
Client Component → API Route → Service Function → Prisma → SQLite
Server Component → Service Function (direct) → Prisma → SQLite
Server Component → Prisma (direct, simple queries)
Real-time:  Client ←SSE← /api/campaigns/[id]/stream (server pushes events)
            Client →POST→ API Route → Service → broadcast via SSE to all clients
```

API routes are thin wrappers: parse input → Zod validate → call service → catch errors → return HTTP response.

### Real-Time System (SSE)
- Server-Sent Events for real-time campaign communication (replaces polling)
- Connection manager: `lib/campaign-stream.ts` — per-campaign rooms, broadcast, heartbeat
- SSE endpoint: `/api/campaigns/[id]/stream` — auth via cookie, state sync on connect
- Client hook: `hooks/useCampaignStream.ts` — typed event subscriptions, auto-reconnect
- Event types: `types/campaign-events.ts` — skill checks, connections, state changes, terminal relay
- Events POST broadcasts: creating a campaign event also pushes it via SSE to all connected clients
- Pending checks: `lib/pending-checks.ts` — in-memory store for multi-step skill check flow
- Skill check flow: initiate (rolls SD) → effort wager prompt (SSE to player) → wager submit (rolls FD) → result broadcast

## Key Systems

### Authentication
- bcrypt password hashing (12 rounds)
- Crypto session tokens (32 bytes), stored in DB
- httpOnly cookies, 7-day expiration
- Middleware protects /trailblazer, /watcher, /terminal routes
- Files: `lib/auth.ts`, `middleware.ts`

### Access Control
- Roles: TRAILBLAZER (player) → WATCHER (GM) → ADMIN → GODHEAD
- WATCHER access via physical rulebook QR codes (AccessCode model)
- Permission helpers in `lib/permissions.ts`
- Files: `services/access-code.ts`

### Campaign System
- Watchers create campaigns with invite codes, world context, custom backstory prompts
- Trailblazers join via invite code → CampaignMember enrollment (no placeholder characters)
- Seat limit: maxTrailblazers per campaign (default 5)
- Files: `services/campaign.ts`

### Character System
- GrowthCharacter data stored as JSON in SQLite
- Character lifecycle: DRAFT → SUBMITTED → APPROVED → ACTIVE → DEAD/RETIRED
- 4-step GM builder: Identity → Origin → Attributes → Review
- Files: `services/character.ts`, `components/character/`

### Backstory System
- Structured prompts (8 defaults + GM custom per campaign)
- Player submits → GM reviews (approve/revision with notes)
- Files: `services/backstory.ts`

### Relations Canvas (Watcher Console)
- SVG infinite canvas with pan, zoom, node dragging, viewport culling
- CharacterCard: expanded (full sheet) / compact views, drag-to-move, dynamic name sizing
- Sub-panels: InventoryCard, SkillsCard, VitalsCard, TraitsCard, MagicCard, BackstoryCard, GROvinePanel, HarvestCard — draggable with gold tether lines, 2000px max distance
- LocationCard: expandable location nodes on canvas (compact 280px / expanded 480px)
- WorldItemCard: expandable world item nodes on canvas (compact 240px / expanded 400px)
- EncounterTracker: combat encounter management card with three-phase tracking
- KRMA Line: horizontal line at Y=0 separating fluid/crystallized zones. Guitar string deformation effect, direction-aware glow, sub-panel clamping
- Canvas create buttons: character, location, and item creation in toolbar
- ComplexTooltip: 500ms lock-on-hover, nested tooltips via createPortal
- All canvas state persisted to localStorage per campaign (debounced 300ms)
- Persisted state: viewBox, zoom, positions, z-indices, expanded/collapsed, sub-panels, offsets
- Files: `components/canvas/RelationsCanvas.tsx`, `CampaignCanvas.tsx`, all `*Card.tsx` / `*Panel.tsx` / `*Tracker.tsx` in `components/canvas/`, `ui/ComplexTooltip.tsx`

### Change Log System
- Character updates trigger changelog entries via automatic diffing of before/after data
- Event architecture: `services/character.ts` `updateCharacter` calls `createChangeLogEntry` with before/after snapshots; `lib/changelog-utils.ts` diffs the objects, infers the category, and summarizes changes into human-readable descriptions
- Coalescence: 5-second server-side window groups rapid changes by the same actor on the same character into a single entry (prevents spam from multi-field edits)
- Auto-polling UI: `ChangeLogPanel` polls every 5 seconds when the panel is visible (bottom overlay on the Relations Canvas)
- Revert: any revertible entry can be reverted with conflict detection — the system compares the current field value against the expected "after" value before applying the rollback
- **Integration rule:** ALL future features that modify character data should wire into the changelog by calling `createChangeLogEntry` from `services/changelog.ts` with before/after data. The `updateCharacter` function already does this automatically for any character data updates routed through it.
- Files: `services/changelog.ts`, `lib/changelog-utils.ts`, `types/changelog.ts`, `components/changelog/ChangeLogPanel.tsx`, `app/api/changelog/route.ts`, `app/api/changelog/[id]/revert/route.ts`

### Campaign Terminal
- Unified activity feed replacing the ChangeLog bottom overlay
- Merges two data sources at display time: ChangeLog entries (character state diffs) + CampaignEvent entries (dice rolls, chat, commands, game events)
- Resizable bottom panel (drag top edge, height persisted to localStorage per campaign)
- Events grouped by GameSession (collapsible session headers, "between sessions" for downtime)
- Filter toggles: All / Chat / Dice / Changes / Events
- Command input bar (bottom): plain text = chat, / prefix = command
- Commands: `/roll <skill> dr:<n> effort:<n> attr:<attr>`, `/roll <die>`, `/spend <attr> <n>`, `/restore <attr> <n>`, `/session start [name]`, `/session end`
- Commands execute via same `character-actions.ts` pure functions as UI buttons
- Auto-poll 5s when visible, auto-scroll to bottom on new events
- Design doc: `docs/campaign-terminal-design.md`
- Files: `components/terminal/CampaignTerminal.tsx`, `TerminalEventRow.tsx`, `CommandInput.tsx`, `lib/terminal-commands.ts`, `types/terminal.ts`, `services/campaign-event.ts`

### Dice / Resolution System
- **Core rolling**: Crypto RNG (rejection sampling via `crypto.getRandomValues()`) in `lib/dice.ts`: rollDie, rollSkillDie, rollFateDie, skilledCheck, unskilledCheck
- Implements GRO.WTH resolution: Skilled (SD + FD + Effort + mods vs DR) and Unskilled (FD + Effort + mods vs DR)
- Skill Die progression: levels 1-3 = flat bonus, 4-5 = d4, 6-7 = d6, 8-11 = d8, 12-19 = d12, 20 = d20
- **DiceService** (`services/dice.ts`): Single entry point for all rolling — skilledCheck, unskilledCheck, deathSave, fearCheck, contestedRoll, quickRoll, customRoll. All game systems call DiceService, never `rollDie()` directly
- **Event bus** (`lib/dice-events.ts`): Pub/sub for roll results. Terminal log and 3D overlay subscribe independently
- **Godhead injection** (`services/dice-injection.ts`): Silent result override system. Filter by character/source/skill/next-roll. Override types: set values, ensure success/failure, clamp, hidden modifier. Audit-logged
- `performSkillCheck()` in `character-actions.ts` combines dice rolling with effort spending (auto-depletion, overflow to Frequency)
- Effort always spent regardless of success/failure
- **3D visualization**: Three.js + Cannon-es physics simulation. Lazy-loaded overlay (portal to body). Pillar-colored dice, death save dramatic effects, snap-to-result after physics settle. 9 component files in `components/dice/`. DiceOverlayLoader in root layout, DiceToggle for user preference (localStorage)
- **API routes**: `POST /api/dice/roll` (quick roll), `POST /api/dice/check` (full skill check), `GET/POST/DELETE /api/dice/inject` (Godhead injections)
- **Terminal commands**: `/roll`, `/check`, `/deathsave`, `/inject`
- Files: `lib/dice.ts`, `lib/dice-events.ts`, `services/dice.ts`, `services/dice-injection.ts`, `types/dice.ts`, `hooks/useDiceEvents.ts`, `components/dice/*`

### Skills System
- **Freeform** — name defines context, no predefined categories, no combat flag
- Skills have: name, level (1-20), governors (1+ attribute names, not Frequency), description
- Governors: clout, celerity, constitution, flow, focus, willpower, wisdom, wit
- Modifiers come from external sources (gear, nectars, buffs) — not stored on skill
- Skill specificity affects DR adjustment (-2 to +2) — evaluated by GM or AI copilot
- Skills stored inline in character JSON (GrowthSkill[] array)
- CRUD via pure functions in `character-actions.ts`: addSkill, removeSkill, updateSkillLevel, updateSkill
- SkillsCard: governor badges (pillar-colored), +/- level, Roll button, Request button (player)
- Max output readout in tooltip: max roll, skill cap, effort to cap
- Files: `types/growth.ts` (SkillGovernor, SKILL_GOVERNORS), `lib/character-actions.ts`, `components/canvas/SkillsCard.tsx`

### Forge System
- Campaign-level design workshop where GM creates templates and players submit requests
- ForgeItem: campaign-scoped design (skill/item/nectar/blossom/thorn), draft → published lifecycle
- PlayerRequest: player-submitted request, GM approves/denies/modifies → creates ForgeItem
- Players can request skills from SkillsCard (name, governors, description) — appears in Forge + Terminal
- Published ForgeItems are available in the campaign for assignment to characters
- KRMA cost: creating a template is free, assigning to a character at a level costs KRMA (future)
- Files: `services/forge.ts`, `app/api/campaigns/[id]/forge/`, `app/api/campaigns/[id]/requests/`

### Location System (skeleton)
- Campaign-scoped locations: settlement, wilderness, dungeon, building, POI, region
- GM-only CRUD with Zod validation
- LocationCard canvas component (compact 280px / expanded 480px) with description, tech/wealth/danger levels, features, ley lines, tags
- Files: `services/location.ts`, `types/location.ts`, `components/canvas/LocationCard.tsx`, `app/api/campaigns/[id]/locations/`

### World Item System (skeleton)
- Campaign-scoped items: weapon, armor, accessory, consumable, tool, artifact, prima_materia, misc
- Holder/location assignment, GM-only CRUD
- WorldItemCard canvas component (compact 240px / expanded 400px) with damage (P:S:H/D\C:B:E), armor resistance, prima materia, material modifiers, condition
- Files: `services/campaign-item.ts`, `types/item.ts`, `components/canvas/WorldItemCard.tsx`, `app/api/campaigns/[id]/items/`

### Encounter System (skeleton)
- Campaign-scoped encounters: combat, social, exploration, puzzle, event
- Three-phase tracking (Intention/Resolution/Impact), round counter, per-pillar action pools, participant tracking by side
- GM-only CRUD
- Files: `services/encounter.ts`, `types/encounter.ts`, `components/canvas/EncounterTracker.tsx`, `app/api/campaigns/[id]/encounters/`

### GROvine System
- GROvinePanel canvas component: add/complete/fail/abandon GRO.vines, G/R/O detail view, capacity tracking
- Essence tab in CampaignCanvas: GROvine overview, Nectars/Blossoms/Thorns summary, Harvest log across all characters
- Files: `components/canvas/GROvinePanel.tsx`, `components/canvas/HarvestCard.tsx`

### AI Systems (planned)
- Portrait pipeline: ComfyUI + FLUX.2 Dev + PuLID (see PORTRAIT-PIPELINE.md)
- Oracle (future): AI co-GM, separate service
- Rule Arbiter (future): AI copilot for session mechanics

### KRMA Economy
- **Core ledger** (`services/krma/ledger.ts`): Append-only transaction engine with SHA-256 checksum chain, idempotent, atomic single + batch execution
- **Wallets** (`services/krma/wallet.ts`): USER, CAMPAIGN, CHARACTER, BURN, LADY_DEATH types. Fund/defund campaigns, transaction history, global metrics
- **Genesis**: 100B KRMA seeded across 4 reserves (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%)
- **TKV evaluator** (`services/krma/evaluator.ts`): Deterministic character value calculator (pillar breakdown, skills, bodyResist, fate die, traits, age floor). Versioned + hashable
- **Death split** (`services/krma/death-split.ts`): Multi-transaction death process — Body (incl. bodyResist)→GM, Soul→50/50, Spirit→player, Frequency→Lady Death. Atomic batch
- **Reconciliation** (`services/krma/reconciliation.ts`): Balance reconciliation, global supply invariant check, checksum chain verification, full audit
- **Crystallization** (`services/krma/crystallization.ts`): Crystallize/dissolve entities across KRMA line. Ledger stored as campaign events. Prevents double-crystallization. Pool tracking
- **KV Calculator** (`lib/kv-calculator.ts`): Client-side KV calculation utilities
- **UI**: KRMA readouts on all 3 interfaces — canvas header (GM-only, 30s poll, fluid/crystallized/total), watcher console (total/self/camp with per-campaign breakdown), terminal admin (total/circ/burn with reserve breakdown). Canonical display: gold gradient bar + Bebas Neue + Inknut Antiqua Ҝ
- **Canvas effects**: Guitar string deformation on KRMA line when cards dragged through, direction-aware card glow (red=crystallize, blue=dissolve), sub-panel constraint clamping
- **API routes**: 9 routes under `/api/krma/` (wallets, campaigns, balance, fund/defund, transactions, economy, crystallize, metrics, audit)
- Files: `services/krma/*`, `lib/kv-calculator.ts`, `types/krma.ts`, `types/crystallization.ts`

## Three Interfaces

| Interface | Role | Route | Purpose |
|-----------|------|-------|---------|
| Trailblazer Portal | Player | /trailblazer | View characters, join campaigns, write backstories |
| Watcher Console | GM | /watcher | Manage campaigns, review backstories, build characters |
| Terminal | Admin | /terminal | System administration, access code management |

## External Dependencies

- **Zero external services** during alpha/beta
- SQLite for data (file-based, no server needed)
- ComfyUI for portraits (local, optional — system works without it)
