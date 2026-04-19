# GRO.WTH Production Plan

**Created:** 2026-04-19  
**Author:** Claude (from comprehensive audit of all code, docs, and repository)  
**Purpose:** Day-by-day build plan from current state to playable beta

---

## Current State Assessment

### What's Built (Production Quality)
| System | Status | Evidence |
|--------|--------|----------|
| Auth & Registration | COMPLETE | bcrypt, sessions, access codes, role-based |
| Campaign CRUD | COMPLETE | Create, join, invite codes, settings, member mgmt |
| Campaign Discovery Hub | COMPLETE | Listing, search, filtering, interest system |
| Player Onboarding | COMPLETE | Interest → Accept → Backstory → Character Creation → Active |
| Character Model | COMPLETE | 27-field GrowthCharacter JSON, 48 Seeds in catalog |
| 9 Attributes + Conditions | COMPLETE | Pool mechanics, auto-conditions at 0, augment system |
| Skill System | COMPLETE | Freeform naming, governors, level-based die (d4→d20) |
| Dice Service | COMPLETE | All roll types, crypto RNG, server-side, Godhead injection |
| SSE Real-Time | COMPLETE | Replaces polling, connection tracking, per-campaign rooms |
| Skill Checks (Standard) | COMPLETE | GM triggers → SD roll → effort wager → FD throw → result |
| Skill Checks (Contested) | COMPLETE | Attacker vs defender, governor overlap, server-orchestrated |
| KRMA Ledger | COMPLETE | 100B genesis, 4 reserves, checksummed, idempotent |
| KRMA Wallets | COMPLETE | User/campaign/character/system wallets, fund/defund |
| KRMA Evaluator | COMPLETE | TKV calculation, death split manifests |
| Canvas (RelationsCanvas) | COMPLETE | 3173 lines, drag-drop, zoom, pan, folders, tethers |
| Character Cards | COMPLETE | 1315 lines, vitals, skills, context menus, skill check trigger |
| 3D Dice Physics | COMPLETE | Three.js + Cannon, grab-and-throw, service rolls |
| Terminal | COMPLETE | Chat, events, commands, SSE streaming, session management |
| Forge System | COMPLETE | Item creation, publish/unpublish, global catalog, player requests |
| Changelog | COMPLETE | Diff-based tracking, coalescing, revert with conflict detection |
| Locations | COMPLETE | CRUD, 6 types, canvas cards |
| Campaign Items | COMPLETE | CRUD, holder assignment, drag-and-drop transfer |
| Portrait Pipeline | COMPLETE | Face lock, body gen, LoRA stack (standalone app) |
| AI Copilot | COMPLETE | Terminal tab, context assembly, rules search, action intents |

### What's Skeleton (Structure exists, needs completion)
| System | What Exists | What's Missing |
|--------|------------|----------------|
| Character Creation Wizard | Seed selection, entity wizard | Root/Branch selection, Frequency budget, attribute modification, KV calculation |
| Inventory/Equipment | GrowthItem type, InventorySection component | Equipment slots per seed, equip/unequip flow, weight enforcement |
| Combat/Encounters | Prisma model, EncounterTracker component, round/phase tracking | Action economy, turn resolution, damage application, initiative |
| Magic System | 3 pillars, 10 schools, spell type defined | Casting system, mana/frequency cost, weaving vs wild |
| Goal System | Goal CRUD, custodian assignment, resistance | Milestone tracking, custodian AI wiring, completion rewards |
| GRO.vine UI | GROvinePanel component | Limited interactions, no progress tracking, no reward flow |
| Vitals/Body Parts | 10 body parts defined, VitalsSection | No damage tracking, no wound system, no healing |
| Backstory | Collection + compile | No AI narrative generation, no GM review UX |
| Forge Authoring | Service structure | AI prompt engineering incomplete |
| Goal Custodian | System prompt defined | AI execution not wired, cascade effects unimplemented |

### What Doesn't Exist Yet
| System | Depends On | Priority |
|--------|-----------|----------|
| Character Creation Flow (Root/Branch) | Seeds (done) | CRITICAL |
| Equipment Slot System (Paperdoll) | Character Sheet, Items | CRITICAL |
| Combat Resolution | Skill Checks (done), Action Economy | HIGH |
| Damage/Healing | Vitals, Body Parts | HIGH |
| Death Mechanics (Lady Death) | Damage, KRMA | MEDIUM |
| Spell Casting | Magic types, Frequency | MEDIUM |
| Godhead AI Execution | Goals, Claude API | MEDIUM |
| Voice Capture/Transcription | SSE (done), Whisper | LOW (post-beta) |
| Portrait Expressions (LivePortrait) | Portrait pipeline | LOW (post-beta) |
| Session Recap Videos | Portrait pipeline, Wan 2.2 | LOW (post-beta) |

---

## System Dependency Graph

```
AUTH ──────────────────────────────────────── COMPLETE
  └→ CAMPAIGNS ────────────────────────────── COMPLETE
       └→ PLAYER ONBOARDING ───────────────── COMPLETE
            └→ CHARACTER CREATION ──────────── ** NEEDED **
                 ├→ Seed Selection ─────────── complete (48 seeds)
                 ├→ Root Selection ─────────── NOT BUILT
                 ├→ Branch Progression ─────── NOT BUILT
                 └→ Budget Calculator ─────── NOT BUILT
       └→ REAL-TIME (SSE) ─────────────────── COMPLETE
            └→ SKILL CHECKS ───────────────── COMPLETE
                 └→ CONTESTED CHECKS ──────── COMPLETE
                      └→ COMBAT SYSTEM ────── ** NEEDED **
                           ├→ Action Economy ── NOT BUILT
                           ├→ Initiative ────── skeleton (EncounterTracker)
                           ├→ Damage System ─── NOT BUILT
                           │    └→ DEATH ────── NOT BUILT
                           └→ Block/Redirect ── NOT BUILT
       └→ FORGE ───────────────────────────── COMPLETE
            └→ EQUIPMENT SYSTEM ───────────── ** NEEDED **
                 ├→ Slot System ────────────── NOT BUILT
                 ├→ Equip/Unequip ──────────── NOT BUILT
                 └→ Weight/Encumbrance ────── NOT BUILT
       └→ KRMA ECONOMY ───────────────────── COMPLETE
            └→ KV ON CHARACTER SHEET ──────── ** NEEDED **
       └→ GRO.VINE SYSTEM ────────────────── SKELETON
            └→ GODHEAD AI ─────────────────── ** NEEDED **
                 ├→ Goal Custodian Wiring ──── stub
                 ├→ Blossom Bestow ─────────── NOT BUILT
                 └→ Claude API Integration ─── NOT BUILT
       └→ MAGIC SYSTEM ───────────────────── SKELETON
            └→ CASTING ────────────────────── NOT BUILT
       └→ PORTRAIT PIPELINE ──────────────── COMPLETE (standalone)
            └→ MAIN APP INTEGRATION ───────── ** NEEDED **
            └→ EXPRESSIONS ────────────────── NOT BUILT (post-beta)
```

---

## MVP Definition: Playable Beta

**A group of 5 players + 1 GM can sit down and play a full 3-hour session online.**

This means:
1. Players register, find a campaign, get accepted
2. GM creates characters with them (Seed → attributes → skills)
3. Everyone connects to the campaign in real-time
4. GM narrates, calls for skill checks — the system handles the rolls
5. Players interact with their character sheets (view stats, wager effort, throw dice)
6. Items exist and can be equipped/used
7. GRO.vines track narrative goals
8. Combat works (initiative, attacks, damage, defense)
9. Characters can rest, heal, and potentially die
10. The AI Godhead provides at least basic GRO.vine oversight

**What's NOT in MVP:** Voice capture, portrait expressions, session recap videos, spell casting (basic magic only), full paperdoll UI, mobile support.

---

## Day-by-Day Build Plan

### Phase 1: "Run One Session" (Days 1-12)

#### Day 1: Character Creation — Seed + Attributes
**Goal:** Player selects a Seed and gets base attributes calculated
- Wire Seed catalog to creation wizard UI
- Apply Seed baselines to attributes (from 48 Seeds CSV data)
- Apply Seed's baseFateDie, fatedAge, baseResist
- Apply Seed's starting skills array
- Apply Seed's starting nectars/thorns
- Display Seed info: description, body structure, attribute baselines
- **Test:** Select Human Seed → character has correct base stats

#### Day 2: Character Creation — Root + Frequency Budget
**Goal:** Player picks a Root (origin/background) and allocates Frequency budget
- Design Root selection UI (Root = childhood, where you came from)
- Root provides: starting skills, attribute modifiers, narrative hooks
- Frequency budget from Seed → player allocates across attributes
- Age selection within Seed's fatedAge range (age affects Frequency budget)
- Enforce nectar/thorn caps based on baseFateDie (d4=4, d6=6, etc.)
- **Test:** Create a Human Scholar with allocated stats

#### Day 3: Character Creation — Branch + KV + Finalize
**Goal:** Player selects Branches (life choices) and character is KV-calculated
- Branch selection UI (class/specialization choices)
- Each Branch adds skills, trait options
- Calculate initial TKV using KRMA Evaluator service
- Wire KV to GM's KRMA wallet (investment from campaign pool)
- Create the Character record with full data
- Status pipeline: DRAFT → GM review → ACTIVE
- **Test:** Full creation flow: Seed → Root → Branch → Active character

#### Day 4: Equipment & Inventory Foundation
**Goal:** Characters can hold and equip items
- Define equipment_slots on Seed type (HUMANOID_BODY default)
- Build equip/unequip service logic (move item to slot, validate slot availability)
- Wire Forge items → character inventory (GM assigns items to characters)
- Item weight tracking + carry capacity from Constitution
- UI: InventorySection shows equipped vs carried vs possessions
- **Test:** GM creates a sword in Forge, assigns to character, character equips it

#### Day 5: Equipment UI + Augments
**Goal:** Equipment affects character stats and is visible on the sheet
- Items with stat bonuses → augment system (augmentPositive/augmentNegative)
- Recompute augments when equipment changes
- Character sheet displays equipped items per slot
- Canvas card shows key equipment
- Changelog entries for equip/unequip
- **Test:** Equip armor → see Constitution augment change → character sheet updates

#### Day 6: GRO.vine Management
**Goal:** GM creates and tracks GRO.vines, players see their goals
- GM creates GRO.vine from Tapestry tab: Goal, Resistance, Opportunity
- Assign GRO.vine to character (max 3-4 based on Seed)
- GRO.vine shows on character sheet and canvas card
- Milestone tracking (add/complete milestones)
- Complete/fail GRO.vine → Nectar or Thorn awarded → augments recalculated
- **Test:** Create GRO.vine → add milestone → complete → Nectar awarded

#### Day 7: Combat Foundation — Action Economy
**Goal:** Turn-based combat works with action tracking
- Define 3 action types per pillar (Body/Spirit/Soul actions)
- Each phase (6 seconds) grants action tokens
- Initiative system: Time Stack ordering
- Encounter creation from canvas with character participants
- Round/phase advancement
- Action spending UI: GM or player marks actions as used
- **Test:** Start encounter → see initiative order → advance rounds

#### Day 8: Combat — Attack Resolution
**Goal:** Characters can attack and defend using existing skill check system
- Wire contested check to combat: attacker skill vs defender skill/block
- Uncontested attacks (defender has no actions → auto-hit with self-determined DR)
- Block/redirect mechanic (spend action, transfer damage to blocking item/body part)
- Multiple attacks per action based on skill level (1-5=1, 6-10=2, 11-15=3, 16-20=4)
- Range penalties for ranged attacks (doubling DR per range increment)
- **Test:** Melee attack → defender blocks → damage redirected to shield

#### Day 9: Damage & Body Parts
**Goal:** Damage is applied to specific body parts, wounds tracked
- Hit location targeting (attacker declares, defender redirects)
- Damage calculation: margin of success → damage amount
- Body part damage tracking on character sheet
- Wound conditions: body part at 0 → disabled
- VitalsSection updates in real-time via SSE
- **Test:** Attack hits torso → damage applied → vitals update across screens

#### Day 10: Healing & Rest Enhancement
**Goal:** Characters heal through rest and treatment
- Short rest: restore partial attributes (costs 1 Frequency)
- Long rest: full attribute restore
- Body part healing rates (based on Constitution + rest type)
- Death threshold: when does a character enter death saves?
- Basic death save (existing service) → Lady Death encounter
- **Test:** Character takes damage → rests → heals → verify attribute restoration

#### Day 11: Integration & Full Session Test
**Goal:** All Phase 1 systems work together in a simulated session
- Create test campaign with 2+ characters (different Seeds)
- Full character creation flow
- Equip items, assign GRO.vines
- Run skill checks (standard + contested)
- Run a combat encounter (initiative → attacks → damage → healing)
- Verify real-time sync across multiple browser tabs
- Fix bugs, edge cases, UI issues

#### Day 12: Polish & Bug Fixes
**Goal:** Everything from Phase 1 is solid
- Fix all bugs found in Day 11
- UI consistency pass (fonts, colors, spacing per VISUAL-DESIGN-SPEC)
- Error handling for edge cases
- Performance check with multiple simultaneous users
- Update documentation (system_map, module_registry)

---

### Phase 2: "Game Feel" (Days 13-18)

#### Day 13: Godhead AI MVP
**Goal:** At least one Godhead can interact with the game
- Wire goal-custodian.ts with Claude API
- Godheads pick up GRO.vines by domain alignment
- Basic Blossom bestow: Godhead grants temporary buff via terminal
- System prompt engineering for Lady Death, Kai, Eth'erling
- **Test:** Create a GRO.vine → Kai picks it up → awards Blossom on milestone

#### Day 14: Godhead — Resistance & Oversight
**Goal:** Godheads create resistance and GM can see their reasoning
- Resistance prompt generation → GM review → accept/modify
- Godhead monitors GRO.vine progress via context builder
- GM dashboard: see all active Godhead decisions
- Entity relationship graph: Godhead connections visible in Tapestry
- **Test:** Godhead creates resistance entity for a GRO.vine

#### Day 15: Portrait Integration
**Goal:** Portraits work in the main app, not just standalone
- Port portrait generation from standalone to main app API
- Wire portrait to character card on canvas
- Portrait generation at character creation (after persona lock)
- Basic state-diff detection (equipment changes trigger regen consideration)
- **Test:** Create character → generate portrait → see it on canvas card

#### Day 16: KV Economy in UI
**Goal:** KRMA investment and economy visible in gameplay
- TKV display on character sheet (already styled)
- GM's campaign KRMA wallet: balance, spending history
- Character creation deducts KRMA from GM wallet
- Crystallization UI: GM crystallizes entities above KRMA line
- Economy dashboard on terminal admin page
- **Test:** GM creates character → KRMA deducted → TKV shows on sheet

#### Day 17: Magic Foundation
**Goal:** Basic spellcasting works
- Spell creation through Forge (spell = ForgeItem type)
- Spell memorization/preparation on character sheet
- Weaving (skilled check with spell school skill)
- Wild casting (unskilled, higher risk, no skill die)
- Frequency as casting resource (spend/deplete/burn)
- **Test:** Character casts spell → frequency spent → effect logged

#### Day 18: UI Polish Pass
**Goal:** The app looks and feels like GROWTH
- Apply VISUAL-DESIGN-SPEC: fonts (Consolas, Bebas Neue, Inknut Antiqua, Comfortaa)
- Pillar colors throughout (Body=Red, Spirit=Blue, Soul=Purple)
- Terminal styling (teal, scanlines, context menu standard)
- Black highlight bars behind text
- Centered meditative layout with generous whitespace
- Canvas visual polish
- **Test:** Visual review against Core Rulebook aesthetic

---

### Phase 3: "Production Ready" (Days 19-25)

#### Day 19: Database Migration
- SQLite → PostgreSQL migration
- Test all queries and relations
- Data migration script for existing test data
- Connection pooling setup

#### Day 20: Deployment
- Vercel or similar hosting setup
- PostgreSQL hosting (Supabase, Neon, or Railway)
- File storage for portraits (S3/R2)
- Domain and SSL
- Environment variables configuration

#### Day 21: Auth Hardening
- Rate limiting on auth endpoints
- CSRF protection
- Session management improvements
- Password reset flow
- Email verification (optional for beta)

#### Day 22: Subscription System
- Stripe integration for GM subscription ($25-30/month)
- Seat limit enforcement
- Access code system for beta testers
- Billing management page

#### Day 23: Monitoring & Admin
- Error tracking (Sentry or similar)
- Usage analytics
- Admin dashboard enhancements
- Cost monitoring for AI/GPU usage

#### Day 24: Beta Onboarding
- Beta tester invite system
- Getting started guide / tutorial flow
- Known issues documentation
- Feedback collection (GitHub Issues or in-app)

#### Day 25: Launch Prep
- Final testing with beta testers
- Performance optimization
- Security audit
- Backup and recovery procedures
- Launch checklist

---

## Risk Areas & Unknowns

### Technical Risks
1. **SQLite → PostgreSQL migration** — May surface query differences, especially JSON operations
2. **Real-time at scale** — SSE works for 5 players, but 100+ concurrent campaigns needs testing
3. **Portrait generation costs** — $4-7/month per group estimated, needs validation at scale
4. **FLUX licensing** — FLUX Dev is non-commercial. Must resolve before launch (pay BFL or migrate to Schnell)

### Design Unknowns
1. **Root/Branch definitions** — Seeds are defined (48), but Roots and Branches need design work
2. **Damage calculation formula** — Margin of success → damage amount not fully specified
3. **Material damage resistance codes** — R/P/V/D notation undefined in repository
4. **Action economy details** — 3 action types confirmed, but specific rules for action generation per round need clarification from Mike
5. **Mana/Frequency for casting** — Spend vs Deplete vs Burn for spells needs clarification

### Process Risks
1. **Solo developer** — All coding through AI, no code review process
2. **Feature spiral** — Character sheet interconnections cause scope creep (identified in session)
3. **Testing gap** — No automated tests, no CI/CD pipeline
4. **Git push blocked** — 122MB file in history needs cleanup before pushing to GitHub

---

## Immediate Next Steps (First 3 Days)

1. **Fix git push** — Remove large file from history with `git filter-repo`, force push
2. **Character Creation Day 1** — Seed selection wizard with attribute calculation
3. **Character Creation Day 2** — Root selection + Frequency budget allocation

The critical path is clear: **Character Creation → Equipment → GRO.vines → Combat → Godheads → Production.** Everything else builds on having playable characters with functional mechanics.

---

## Cost Estimate to Production

| Category | Estimate |
|----------|----------|
| **Development time** | ~25 focused sessions (100-150 hours) |
| **Cloud GPU (portraits)** | ~$50-100 during development (RunPod H100) |
| **Hosting (beta)** | ~$20-50/month (Vercel + PostgreSQL + file storage) |
| **AI API costs** | ~$30-50/month (Claude API for Godheads during dev) |
| **Domain/SSL** | ~$15/year |
| **Stripe fees** | 2.9% + $0.30 per transaction |
| **Total to beta launch** | ~$200-500 in infrastructure + 100-150 hours of sessions |
