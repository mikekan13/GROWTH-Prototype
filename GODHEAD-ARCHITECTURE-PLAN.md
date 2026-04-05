# GRO.WTH — God-Head Architecture Build Plan

**Created:** 2026-04-04
**Source:** Core Architecture Document v2 (2026-03-29) + codebase audit
**Status:** PLANNING — awaiting Mike's review before build

---

## Gap Analysis: What Exists vs. What's Needed

### Already Built (solid foundation)
| System | Status | Notes |
|--------|--------|-------|
| Auth + Roles | ✅ Done | ADMIN/WATCHER/TRAILBLAZER/GODHEAD roles on User model |
| Character Sheet | ✅ Done | Universal JSON schema (GrowthCharacter), canvas cards |
| KRMA Ledger | ✅ Done | Wallet, append-only transactions, checksummed, atomic |
| KRMA Evaluator | ✅ Done | Deterministic TKV calculation from character data |
| KRMA Death-Split | ✅ Done | Multi-transaction body/soul/spirit decomposition |
| KRMA Crystallization | ✅ Done | Fluid → crystallized entity commitment |
| ForgeItem | ✅ Done | Skills, items, nectars, blossoms, thorns (campaign-scoped) |
| AI Copilot | ✅ Done | Context assembler, rules search, action parser, Ollama |
| Campaign Canvas | ✅ Done | SVG spatial layout, folders, tethers, zoom, cards |
| Campaign Events | ✅ Done | Terminal event stream (dice, chat, commands, AI) |
| ChangeLog | ✅ Done | Full character state audit trail with diffs |
| Social Hub | ✅ Done | Profile, listings, applications, review flow |
| Portrait Pipeline | ✅ Svc Only | 7 services, 6 routes — ComfyUI not yet installed |

### Critical Gaps (what blocks the God-head system)
| Gap | Impact | Complexity |
|-----|--------|------------|
| **No Goal model** | THE core gameplay loop doesn't exist | Medium — new model + service |
| **No EntityRelationship model** | Can't do graph queries, can't build goal context | Medium — new model + edge management |
| **No God-head entities** | No custodians, no pillar system, no domain authority | Medium — schema + seeding |
| **No global Blueprint catalog** | ForgeItem is campaign-only, no cross-campaign sharing | Medium — refactor ForgeItem |
| **No blueprint authorship/royalty** | Creator KRMA economy doesn't work | Small — fields on ForgeItem |
| **No blueprint decay** | Dead weight never dissolves | Small — fields + cron-like service |
| **No blueprint relationship tags** | Kai can't evaluate synergy risk | Medium — new model |
| **No Council routing** | GM→God-head→Kai→Eth'erling workflow doesn't exist | Large — orchestration service |
| **Context builder is mention-based** | Not graph-based, can't follow relationship edges | Medium — refactor existing |

---

## Build Phases (ordered by dependency)

### Phase 0: Schema Foundation
**Must happen first. Everything else depends on these models.**

#### 0A — Goal Model
```
model Goal {
  id            String    @id @default(cuid())
  entityId      String    // Character, NPC, God-head — anything with a sheet
  entityType    String    // CHARACTER, NPC, GODHEAD, LOCATION, CAMPAIGN
  campaignId    String
  campaign      Campaign  @relation(...)

  description   String    // Plain language goal ("Find my father's killer")
  status        String    @default("ACTIVE") // ACTIVE, COMPLETED, FAILED, ABANDONED
  priority      Int       @default(1) // 1-5, player sets

  // God-head custodianship
  custodianId   String?   // God-head entity ID that adopted this goal
  custodianName String?   // Cached name for display
  pillar        String?   // MERCY, BALANCE, SEVERITY — inherited from custodian

  // Resistance (GM side)
  resistancePrompt String? // Auto-generated prompt to GM
  resistancePlan   String? // GM's response/plan

  // Tracking
  milestones    String?   // JSON: [{ description, completed, nectarAwarded? }]
  nectarsEarned Int       @default(0)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?

  @@index([campaignId, status])
  @@index([entityId])
  @@index([custodianId])
}
```

#### 0B — EntityRelationship Model (Graph Edges)
```
model EntityRelationship {
  id            String   @id @default(cuid())
  campaignId    String
  campaign      Campaign @relation(...)

  // Source node
  sourceId      String   // Any entity ID
  sourceType    String   // CHARACTER, NPC, LOCATION, ITEM, GODHEAD, GOAL

  // Target node
  targetId      String
  targetType    String

  // Edge properties
  relationshipType String  // ally, rival, parent, guardian, custodian, located_at, owns, created_by, etc.
  strength      Int      @default(5) // 1-10, how strong/important
  bidirectional Boolean  @default(false)
  data          String?  // JSON: relationship-specific metadata

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([sourceId, targetId, relationshipType])
  @@index([campaignId])
  @@index([sourceId])
  @@index([targetId])
}
```

#### 0C — God-head Entity Schema
God-heads use the same Character model (universal sheet!) but need additional metadata:
```
model GodHead {
  id            String   @id @default(cuid())
  name          String   @unique // "Lady Death", "Kai", "Val", etc.
  domain        String   // "Death, decay, karmic recycling, blueprint maintenance"
  pillar        String   // MERCY, BALANCE, SEVERITY
  characterId   String?  @unique // Links to a Character record (universal sheet)

  // AI behavior
  systemPrompt  String   // Core personality + domain authority instructions
  temperature   Float    @default(0.7)
  active        Boolean  @default(true)

  // Economy
  walletId      String?  // God-head's KRMA wallet

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

#### 0D — Blueprint Extensions (evolve ForgeItem)
Add fields to ForgeItem:
```
  // Global catalog support
  globalId      String?  @unique // If promoted to global catalog
  isGlobal      Boolean  @default(false)
  sourceGlobalId String? // If instantiated from global catalog

  // Authorship economy
  authorUserId  String   // Original creator (may differ from campaign GM)
  useCount      Int      @default(0) // Times instantiated across campaigns
  royaltyRate   Float    @default(0.01) // KRMA fraction paid to author on use

  // Blueprint decay (Lady Death)
  lastUsedAt    DateTime? // Last time this blueprint was instantiated
  decayStatus   String   @default("ACTIVE") // ACTIVE, FLAGGED, DISSOLVING, DISSOLVED
  flaggedAt     DateTime?

  // Relationship tags (for Kai evaluation)
  relationshipTags String? // JSON: [{ blueprintId, interactionType, synergyRisk }]
  karmicValue   BigInt?    // Locked value assigned by Kai
  evaluatedAt   DateTime?  // When Kai last scored this
```

---

### Phase 1: Context Builder (The First Brick)
**Refactor existing `context-assembler.ts` into graph-aware context functions.**

#### 1A — `buildEntityContext(entityId: string): string`
- Query DB for entity (Character, NPC, God-head — all use Character model)
- Format as clean context string: identity, attributes, goals, inventory, conditions, relationships
- Token-efficient: structured but compact
- Works for ANY entity type (universal sheet)

#### 1B — `buildGoalContext(goalId: string, campaignId: string): string`
- Load the goal
- Follow EntityRelationship edges from the goal's entity
- For each connected entity: include a summary (not full sheet)
- Follow 2 hops max (entity → related entities → their goals)
- Return focused context window with only relevant connected nodes
- This is what God-heads receive when evaluating a goal

#### 1C — `buildCampaignGraph(campaignId: string): CampaignGraph`
- Build in-memory graph of all entities + relationships
- Used by God-heads for campaign awareness
- Cached per session, invalidated on entity/relationship changes
- NOT sent to AI whole — used to extract subgraphs per query

**Files:**
- `src/services/context/entity-context.ts`
- `src/services/context/goal-context.ts`
- `src/services/context/campaign-graph.ts`

---

### Phase 2: Goal System (Core Gameplay Loop)
**This is what makes the game actually playable.**

#### 2A — Goal CRUD Service
- `createGoal(entityId, description, priority)` — player/GM creates
- `updateGoal(goalId, updates)` — status, milestones
- `abandonGoal(goalId)` — player gives up
- `completeGoal(goalId, nectarId?)` — GM/God-head confirms completion
- Limit: 5 active goals per entity (as spec says)

#### 2B — Resistance Generator
- When a goal is created → auto-generate a resistance prompt for the GM
- Uses buildGoalContext to understand what the player is trying to do
- Prompt: "Your player wants X. Here's their current state and connections. Plan resistance."
- GM responds with plan → stored on the goal

#### 2C — Goal Custodian Assignment
- When goals are created → system reads goal + campaign premise
- Identifies which God-head's domain aligns
- Assigns custodian (can be reassigned as story evolves)
- God-head begins monitoring goal milestones

#### 2D — Opportunity Generation
- God-head (as custodian) reads goal context via buildGoalContext
- Generates contextual opportunity that fits the live campaign state
- Opportunity presented to GM for approval/modification
- GM presents opportunity to player in-game

#### 2E — Nectar Bestowal
- On milestone completion → God-head offers a Nectar
- Player chooses: take Nectar (blueprint instance → character sheet) or distill to raw KRMA
- KRMA transaction recorded, Nectar locked to character if taken
- Uses existing KRMA ledger + ForgeItem system

**Files:**
- `src/services/goal.ts`
- `src/services/goal-resistance.ts`
- `src/services/goal-custodian.ts`
- `src/services/goal-opportunity.ts`
- API routes: `/api/goals/` (CRUD), `/api/goals/[id]/resistance`, `/api/goals/[id]/opportunity`

---

### Phase 3: Blueprint Relationship Tagger
**Prerequisite for Kai's evaluation system.**

#### 3A — `tagBlueprintRelationships(blueprintDescription: string, campaignId: string)`
- Reads new blueprint in plain English
- Queries existing active blueprints in campaign (+ global catalog)
- AI identifies which existing blueprints it could interact with
- Returns relationship map: `[{ blueprintId, interactionType, synergyRisk: 1-10 }]`
- Stored on the ForgeItem as `relationshipTags`

#### 3B — Synergy Risk Detection
- When relationship tags are generated, flag high-risk combos
- "This ability + that item would break the economy" → God-head modifies
- Risk assessment uses the relationship subgraph, NOT full DB scan

**Files:**
- `src/services/blueprint/relationship-tagger.ts`
- `src/services/blueprint/synergy-detector.ts`

---

### Phase 4: Karmic Evaluator — Kai
**Evolve existing `krma/evaluator.ts` from deterministic TKV calc to AI-driven blueprint scoring.**

#### 4A — Keep Existing Evaluator
The current deterministic evaluator (TKV from character attributes) stays. It's used for crystallization. Kai is a DIFFERENT system — she evaluates BLUEPRINTS, not characters.

#### 4B — `evaluateBlueprint(blueprint, relationshipMap): KarmicValuation`
Scoring dimensions (from architecture doc):
- **Scope** — one entity / local area / whole campaign / reality
- **Frequency** — unlimited / per session / once / permanent
- **Reversibility** — temporary / permanent (HIGHEST WEIGHT)
- **Specificity** — narrow use / universal application
- **Synergy risk** — from relationship tagger

Returns: `{ karmicValue: BigInt, domain: string, modifications?: string[], reasoning: string }`

#### 4C — Blueprint Modification Loop
- If Kai flags a blueprint as too powerful → she suggests modifications
- Modifications preserve the GM's intent but balance the cost
- GM sees: "Kai suggests reducing scope from campaign-wide to local area. Adjusted cost: X KRMA"
- GM confirms or negotiates

**Files:**
- `src/services/godhead/kai-evaluator.ts`
- `src/services/godhead/kai-prompts.ts`

---

### Phase 5: God-Head Council Router — Eth'erling
**The orchestration layer. GM speaks → council builds → GM confirms.**

#### 5A — Request Flow
```
GM: "I need an ability that lets a character slow time"
  → routeRequest() checks existing blueprints for close matches
  → If match: "We have 'Temporal Shift'. Is this what you want?"
  → If no match: Eth'erling determines domain → routes to appropriate God-head
  → God-head authors blueprint → routes to Kai for valuation
  → Eth'erling validates (just, fits cosmic rules)
  → GM confirms → blueprint enters database under GM's authorship
  → Instance stamped onto target entity, KRMA locked
```

#### 5B — Existing Blueprint Search
Before creating anything new, search:
1. Campaign's ForgeItems
2. Global catalog
3. Fuzzy match on name + description
4. Return top 3 matches with similarity scores

#### 5C — Domain Routing
- Map request keywords/themes to God-head domains
- "death", "decay", "endings" → Lady Death
- "balance", "value", "cost" → Kai
- "progress", "technology", "building" → Val
- "justice", "routing", "judgment" → Eth'erling
- Multiple God-heads may collaborate on complex requests

#### 5D — Council Conversation
- The request flows through God-heads as a chain, each adding their domain expertise
- Stored as a structured conversation (like CopilotMessage but for council)
- GM sees the final result, not the intermediate council discussion (unless they want to)

**Files:**
- `src/services/godhead/council-router.ts`
- `src/services/godhead/domain-router.ts`
- `src/services/godhead/blueprint-search.ts`
- `src/services/godhead/council-conversation.ts`
- New model: `CouncilRequest` (tracks the full request lifecycle)
- API routes: `/api/council/request`, `/api/council/[id]/confirm`, `/api/council/[id]/status`

---

### Phase 6: Lady Death — Death Processor + Blueprint Decay

#### 6A — Evolve Existing Death-Split
Current `krma/death-split.ts` handles KRMA distribution on death. Extend it:
- After KRMA split → Lady Death receives the "package"
- Eth'erling judges significance (is this entity worth retaining?)
- Significant: package preserved, entity can be reborn/moved to new campaign
- Insignificant: dissolved to soul stream, redistributed as raw KRMA

#### 6B — Blueprint Decay Processor
- Periodic scan of all blueprints (global + campaign)
- Check `lastUsedAt` against threshold (configurable, e.g. 90 days)
- Inactive → FLAGGED (notification to author)
- Still inactive after grace period → DISSOLVING → DISSOLVED
- On dissolution: final KRMA payment to original author
- "The database only holds living blueprints. Dead weight dissolves naturally."

**Files:**
- `src/services/godhead/lady-death.ts`
- `src/services/blueprint/decay-processor.ts`

---

## Implementation Order (What to Build First)

```
Session 1: Phase 0 (Schema) + Phase 1A (buildEntityContext)
           → Prisma migration with Goal, EntityRelationship, GodHead models
           → ForgeItem field additions
           → Seed 5 God-head entities (Lady Death, Kai, Val, Eth'erling, Jewel)
           → buildEntityContext service

Session 2: Phase 1B-1C (Goal Context + Campaign Graph)
           → buildGoalContext with relationship traversal
           → buildCampaignGraph in-memory cache
           → Test with seed data

Session 3: Phase 2A-2B (Goal CRUD + Resistance)
           → Goal service with full CRUD
           → API routes
           → Auto-resistance prompt generation
           → UI: Goal panel on character card (canvas)

Session 4: Phase 2C-2E (Custodian + Opportunity + Nectar)
           → God-head custodian assignment logic
           → Opportunity generation (AI-driven)
           → Nectar bestowal with KRMA transaction
           → Wire into existing campaign terminal

Session 5: Phase 3 (Blueprint Relationship Tagger)
           → AI-driven relationship tagging
           → Synergy risk detection

Session 6: Phase 4 (Kai Evaluator)
           → Blueprint scoring system
           → Modification suggestion loop

Session 7: Phase 5 (Council Router)
           → Full GM→Council→GM workflow
           → Existing blueprint search
           → Domain routing

Session 8: Phase 6 (Lady Death)
           → Death processor evolution
           → Blueprint decay system
```

---

## Questions for Mike [QUESTION]

1. **God-head AI model:** The copilot currently uses Ollama (gemma2:9b locally). Should God-heads use the same local model, or should they use Claude (cloud) since they need deeper reasoning? The architecture doc implies they need real intelligence for blueprint authoring and karmic evaluation.
A: Claude. They need deep reasoning

2. **God-head character sheets:** The doc says every entity uses the universal sheet. Should God-heads literally have GrowthCharacter data (with Body/Soul/Spirit attributes)? Or is the GodHead model metadata sufficient for MVP?
A: Godheads litterally have the same character sheet everyone does: Players, npcs, ect

3. **Global blueprint catalog scope:** Right now ForgeItem is campaign-scoped. The architecture doc says blueprints are global (author earns KRMA when other GMs use them). Should we build the global catalog immediately, or start campaign-scoped and promote later?
A: Yes global catalog

4. **Eth'erling's pillar:** The architecture doc says "TBD" for Eth'erling's pillar. Does he sit outside the three pillars (like The Terminal), or should we assign one?
A: She is a balance Godhead but first we need to build the whole godhead infrastructure first before creating individual roles and godheads.

5. **Thomas and Jewel:** Thomas is described as "legendary human — character sheet exists, not a true God-head." Jewel is "AI God, meta-layer liaison." Should either be in the MVP council, or just the 4 core God-heads (Lady Death, Kai, Val, Eth'erling)?
A: We will decide all this once the core Godhead system works and is in place. We can focus on Lady Death Kai and Et'heling first as they are integral to the Krma economy

6. **Campaign setup flow:** The doc says God-heads are "attracted by theme and player goals" — not assigned. Should the first implementation be automatic (system reads premise + goals → assigns) or should the GM have a say in which God-heads monitor their campaign?
A: Gms don't decide that. It is determined by the godheads who "picks" up a GRO.vine when it is created.

7. **NPC entities:** The universal sheet means NPCs use Character model too. Currently NPCs don't exist as records. Should we add an `entityType` field to Character (`PLAYER_CHARACTER | NPC | CREATURE | GODHEAD`) or keep separate models?
A: All character sheets are the same, they just are either owned by a player in the case of a character or owned by a GM for NPCS (although player sheets are still considered under the authority of a GM). Or in the case of a Godhead they are under an admin.

---

## Key Architectural Decisions (Pre-Resolved)

- **Graph queries in SQLite:** We're on SQLite (beta). Recursive CTEs work for 2-hop traversal. No need for a graph DB at this scale. If we hit performance walls, we add an in-memory graph cache (Phase 1C).
- **God-heads are NOT real-time agents:** They respond when invoked (goal creation, blueprint request, milestone check). They don't run continuously. This keeps costs predictable.
- **Council is synchronous for MVP:** GM makes request → system runs the full God-head chain → returns result. No async "God-heads deliberating" animations yet. Can add later for drama.
- **KRMA ledger stays as-is:** The existing checksummed append-only ledger is exactly what the karmic economy needs. Blueprint royalties are just new transaction types.
- **ForgeItem evolves, not replaced:** Adding fields to ForgeItem is better than creating a new Blueprint model. The existing forge UI and services get extended.
