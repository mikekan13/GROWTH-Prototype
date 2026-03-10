# GRO.WTH Dice System — Design Plan

Last updated: 2026-03-09

## Overview

A unified dice system that serves three purposes:
1. **Engine** — Cryptographically strong random rolls, callable from any game system
2. **Godhead Injection** — Silent result override capability for AI/narrative systems
3. **3D Visualization** — Physics-simulated dice rendered on a WebGL canvas overlay

---

## Part 1: Dice Engine (Service Layer)

### 1.1 Cryptographic RNG

Replace `Math.random()` with `crypto.getRandomValues()` for uniform distribution with no predictable seed.

```typescript
// lib/dice.ts — upgraded core
function cryptoRandom(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / (0xFFFFFFFF + 1); // [0, 1) uniform
}

function rollDie(sides: number): number {
  // Rejection sampling to eliminate modulo bias
  const limit = Math.floor(0x100000000 / sides) * sides;
  let value: number;
  do {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);
  return (value % sides) + 1;
}
```

**Why rejection sampling?** `crypto.getRandomValues` gives uniform 32-bit integers. Naive `% sides` introduces modulo bias when `2^32` isn't divisible by `sides`. Rejection sampling discards values in the biased tail. For d4/d6/d8/d12/d20, the rejection rate is negligible (<0.0000002%).

**Server vs Client:** `crypto.getRandomValues()` works in both Node.js and browsers. Server-side rolls (API routes, services) use the same function — no environment branching needed.

### 1.2 Roll Request / Roll Result Types

```typescript
// types/dice.ts

export type DieType = 'd4' | 'd6' | 'd8' | 'd12' | 'd20';

export interface RollRequest {
  id: string;                    // Unique roll ID (nanoid)
  source: RollSource;            // What triggered this roll
  dice: DieSpec[];               // What to roll
  dr?: number;                   // Difficulty Rating (if a check)
  effort?: number;               // Effort wagered
  effortAttribute?: string;      // Which attribute pool
  flatModifiers?: number;        // Trait/condition bonuses
  metadata?: Record<string, unknown>; // Extensible context (item ID, skill name, etc.)
}

export interface DieSpec {
  die: DieType | 'flat';
  label: string;                 // "Skill Die", "Fate Die", "Item Bonus", etc.
  sides?: number;                // 0 for flat
  flatValue?: number;            // For flat bonuses (skill levels 1-3)
  color?: DieColor;              // Visual color hint for 3D renderer
}

export interface RollResult {
  id: string;                    // Matches RollRequest.id
  request: RollRequest;          // Original request preserved
  rolls: DieOutcome[];           // Individual die results
  total: number;                 // Sum of all dice + effort + flat mods
  dr?: number;
  success?: boolean;             // total >= dr
  margin?: number;               // total - dr
  timestamp: number;             // Unix ms
  injected: boolean;             // Was this result overridden by Godhead?
  injectionVisible: boolean;     // Should the injection be visible to anyone? (always false for players)
}

export interface DieOutcome {
  die: DieType | 'flat';
  label: string;
  value: number;                 // Rolled or injected value
  maxValue: number;              // Max possible (sides or flat value)
  natural: number;               // What RNG actually produced (before injection)
  wasInjected: boolean;          // This specific die was overridden
}

export type RollSource =
  | { type: 'skill_check'; skillName: string; skillLevel: number; characterId: string }
  | { type: 'unskilled_check'; characterId: string }
  | { type: 'death_save'; characterId: string }
  | { type: 'fear_check'; fearName: string; characterId: string }
  | { type: 'magic_resistance'; characterId: string }
  | { type: 'item_use'; itemId: string; characterId: string }
  | { type: 'encounter'; encounterId: string }
  | { type: 'quick_roll'; context: string }              // Terminal /roll d20
  | { type: 'contested'; attackerId: string; defenderId: string }
  | { type: 'custom'; context: string };                  // Future extensibility

export type DieColor = 'red' | 'blue' | 'purple' | 'teal' | 'gold' | 'white' | 'black';
```

### 1.3 Dice Service (`services/dice.ts`)

The central orchestrator. Every roll in the game goes through here.

```typescript
// services/dice.ts

export class DiceService {
  /**
   * Execute a roll request. This is THE single entry point for all dice rolling.
   *
   * Flow:
   * 1. Generate cryptographic random results for all dice
   * 2. Check for Godhead injection overrides
   * 3. Compute totals, success/failure, margin
   * 4. Emit roll event (for 3D renderer + terminal log)
   * 5. Return result
   */
  static roll(request: RollRequest): RollResult { ... }

  /**
   * Convenience: Skilled check (SD + FD + effort vs DR)
   * Builds a RollRequest and calls roll().
   */
  static skilledCheck(params: {
    characterId: string;
    skillName: string;
    skillLevel: number;
    fateDie: FateDie;
    effort: number;
    effortAttribute: string;
    dr: number;
    flatModifiers?: number;
  }): RollResult { ... }

  /**
   * Convenience: Unskilled check (FD + effort vs DR)
   */
  static unskilledCheck(params: { ... }): RollResult { ... }

  /**
   * Convenience: Death save (FD + Health Level only)
   */
  static deathSave(params: {
    characterId: string;
    fateDie: FateDie;
    healthLevel: number;
    ladyDeathRoll?: number; // GM can set or let system roll
  }): RollResult { ... }

  /**
   * Convenience: Quick roll (terminal /roll d20)
   */
  static quickRoll(die: DieType, context?: string): RollResult { ... }

  /**
   * Convenience: Contested roll (attacker vs defender)
   */
  static contestedRoll(params: {
    attacker: { characterId: string; skillName: string; skillLevel: number; fateDie: FateDie; effort: number; flatModifiers?: number };
    defender: { characterId: string; skillName: string; skillLevel: number; fateDie: FateDie; effort: number; flatModifiers?: number };
  }): { attackerResult: RollResult; defenderResult: RollResult; attackerWins: boolean } { ... }
}
```

### 1.4 Event Bus

Rolls emit events that both the Terminal log and 3D renderer subscribe to.

```typescript
// lib/dice-events.ts

type DiceEventHandler = (result: RollResult) => void;

class DiceEventBus {
  private handlers: Set<DiceEventHandler> = new Set();

  subscribe(handler: DiceEventHandler): () => void { ... }
  emit(result: RollResult): void { ... }
}

export const diceEvents = new DiceEventBus();
```

**React hook:**
```typescript
// hooks/useDiceEvents.ts
export function useDiceEvents(onRoll: (result: RollResult) => void): void {
  useEffect(() => diceEvents.subscribe(onRoll), [onRoll]);
}
```

---

## Part 2: Godhead Injection System

### 2.1 Concept

The Godhead (admin/AI system) can silently override any die result before it reaches players. This enables:
- **Narrative pacing** — Ensure a critical story beat lands
- **AI Oracle** — Future system that reads narrative tension and nudges outcomes
- **Mercy/wrath** — Override death saves when dramatically appropriate
- **Testing** — Force specific outcomes for QA

### 2.2 Injection Registry

```typescript
// services/dice-injection.ts

export interface DiceInjection {
  id: string;
  priority: number;              // Higher = applied later (can override earlier injections)
  filter: InjectionFilter;       // When does this injection activate?
  override: InjectionOverride;   // What does it do?
  oneShot: boolean;              // Remove after first use?
  expiresAt?: number;            // Auto-expire timestamp
  reason: string;                // Internal audit log (never shown to players)
  createdBy: 'godhead' | 'ai_oracle' | 'system';
}

export type InjectionFilter =
  | { type: 'character'; characterId: string }       // Any roll by this character
  | { type: 'roll_source'; sourceType: string }      // e.g., all death_saves
  | { type: 'next_roll' }                            // The very next roll by anyone
  | { type: 'skill'; skillName: string }             // Any roll using this skill
  | { type: 'custom'; predicate: (req: RollRequest) => boolean };

export type InjectionOverride =
  | { type: 'set_result'; values: number[] }         // Force specific die values [SD, FD]
  | { type: 'set_total'; total: number }             // Force a specific total
  | { type: 'ensure_success' }                       // Reroll until success (max 100 tries)
  | { type: 'ensure_failure' }                       // Reroll until failure
  | { type: 'clamp_min'; min: number }               // Floor on each die
  | { type: 'clamp_max'; max: number }               // Ceiling on each die
  | { type: 'add_modifier'; bonus: number };          // Hidden flat modifier

class DiceInjectionRegistry {
  private injections: Map<string, DiceInjection> = new Map();

  register(injection: DiceInjection): string { ... }
  remove(id: string): void { ... }
  clear(): void { ... }

  /**
   * Called by DiceService.roll() after generating natural results.
   * Returns modified results if any injection matches.
   */
  apply(request: RollRequest, naturalResults: number[]): {
    results: number[];
    wasInjected: boolean;
    injectionIds: string[];
  } { ... }
}

export const injectionRegistry = new DiceInjectionRegistry();
```

### 2.3 Security

- Injections are **server-side only** — never exposed to client
- The `injected` flag on RollResult is visible only to Godhead/Terminal Admin view
- Player view always sees dice as natural
- Watcher (GM) can opt-in to see injection indicators (toggle in settings)
- All injections are audit-logged with timestamp + reason

### 2.4 API Routes

```
POST /api/dice/inject       — Register an injection (Godhead only)
DELETE /api/dice/inject/:id — Remove an injection
GET /api/dice/inject        — List active injections (Godhead only)
POST /api/dice/roll         — Execute a roll (any authorized user)
```

---

## Part 3: 3D Dice Visualization

### 3.1 Technology Choice

**Three.js + Cannon-es** (lightweight physics)

| Option | Bundle Size | Physics | Maturity | Verdict |
|--------|-------------|---------|----------|---------|
| Three.js + Cannon-es | ~150KB + ~45KB | Good | Excellent | **Winner** |
| Babylon.js | ~400KB+ | Built-in | Excellent | Too heavy for dice-only use |
| @3d-dice/dice-box | ~80KB | Ammo.js WASM | Purpose-built | Less control, WASM complexity |
| CSS 3D transforms | 0KB | None | N/A | No real physics, looks fake |

**Three.js** gives us full control over materials, lighting, and camera. **Cannon-es** (ES module fork of Cannon.js) provides rigid body physics for realistic tumbling, bouncing, and settling.

### 3.2 Dice Geometry

Each die type has a distinct polyhedron:

| Die | Geometry | Faces | Implementation |
|-----|----------|-------|----------------|
| d4 | Tetrahedron | 4 | `TetrahedronGeometry` + custom UVs |
| d6 | Cube | 6 | `BoxGeometry` (standard) |
| d8 | Octahedron | 8 | `OctahedronGeometry` + custom UVs |
| d12 | Dodecahedron | 12 | `DodecahedronGeometry` + custom UVs |
| d20 | Icosahedron | 20 | `IcosahedronGeometry` + custom UVs |

**Number textures:** Canvas-rendered textures applied per-face. Numbers are rendered at build time into a texture atlas, then mapped via UV coordinates. Supports pillar-colored dice (red/blue/purple/teal/gold).

### 3.3 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   DiceOverlay                        │
│  (React component — portal to document.body)         │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │            Three.js Canvas                    │   │
│  │                                               │   │
│  │  ┌─────────┐  ┌─────────┐                    │   │
│  │  │  Skill  │  │  Fate   │                    │   │
│  │  │   Die   │  │   Die   │                    │   │
│  │  │  (d8)   │  │  (d6)   │                    │   │
│  │  └─────────┘  └─────────┘                    │   │
│  │         ▼ physics settle ▼                    │   │
│  │  ┌─────────────────────────────────────────┐ │   │
│  │  │  Result Bar: SD d8[6] + FD d6[4] = 10  │ │   │
│  │  └─────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [Skip Animation]               [auto-dismiss 3s]   │
└─────────────────────────────────────────────────────┘
```

### 3.4 Component Structure

```
components/dice/
  DiceOverlay.tsx          — Portal overlay, manages scene lifecycle
  DiceScene.ts             — Three.js scene setup (camera, lights, floor, walls)
  DicePhysics.ts           — Cannon-es world, rigid bodies, constraints
  DiceMesh.ts              — Geometry + materials for each die type
  DiceTextureAtlas.ts      — Canvas-rendered number textures (cached)
  DiceAnimator.ts          — Throw animation: initial velocity, spin, settle detection
  DiceResultBar.tsx         — Bottom bar showing roll breakdown after settle
  useDiceOverlay.ts        — Hook: subscribes to diceEvents, triggers overlay
```

### 3.5 Roll Animation Flow

```
1. DiceService.roll() executes → emits RollResult via diceEvents
2. useDiceOverlay receives event → opens DiceOverlay with RollResult
3. DiceOverlay creates Three.js scene:
   a. Floor plane (invisible physics body, visible as subtle surface)
   b. Invisible walls (contain dice within viewport)
   c. Dice meshes spawned above "table" with random position/rotation
4. Dice are "thrown":
   a. Apply initial velocity vector (randomized angle + force)
   a. Apply initial angular velocity (randomized spin)
   b. Cannon-es simulates physics at 60fps
   c. Three.js renders each frame synced to physics
5. Settle detection:
   a. When all dice velocity < threshold for 500ms → settled
   b. CRITICAL: The visual result is cosmetic. The actual value was
      already determined by DiceService. The animator rotates the
      settled die to show the predetermined face.
6. Result bar appears with breakdown (SD + FD + effort = total vs DR)
7. Auto-dismiss after 3 seconds (configurable), or click to dismiss
8. Flat bonuses (skill levels 1-3): No die rendered, just "+2" floating text
```

### 3.6 Predetermined Results + Visual Sync

The dice values are determined by the crypto RNG **before** the 3D animation starts. The physics simulation is purely visual. When dice settle, the animator applies a final rotation to ensure the correct face is showing.

```typescript
// DiceAnimator.ts — settle logic
class DiceAnimator {
  /**
   * After physics settle, snap die rotation to show the predetermined value.
   * Uses a lookup table: faceRotations[dieType][value] → Quaternion
   */
  snapToResult(dieMesh: THREE.Mesh, physicsBody: CANNON.Body, targetValue: number): void {
    // Find the face rotation quaternion for this value
    const targetQuat = this.faceRotations[dieType][targetValue];
    // Smoothly interpolate from current rotation to target (200ms ease-out)
    this.tweenRotation(dieMesh, physicsBody, targetQuat, 200);
  }
}
```

This means:
- **No cheating via animation manipulation** — result is server-determined
- **Physics looks natural** — real simulation, just with a final nudge
- **Godhead injections are invisible** — same visual flow regardless

### 3.7 Visual Theming

Dice colors follow pillar system:

| Context | Die Color | Accent |
|---------|-----------|--------|
| Body skill check | Red (#E8585A) | Coral glow |
| Spirit skill check | Blue (#3EB89A) | Teal glow |
| Soul skill check | Purple (#7050A8) | Violet glow |
| Fate Die (always) | White/cream | Subtle gold edge |
| Death Save | Black | Red pulse glow |
| KRMA roll | Gold (#D0A030) | Amber particles |
| Quick roll | Teal (#2DB8A0) | Terminal green |

**Material:** PBR metallic material with subtle roughness. Not photorealistic — slightly stylized to match GRO.WTH aesthetic. Beveled edges, engraved numbers with faint glow.

**Lighting:** Single warm directional light + ambient. Subtle shadow on floor plane.

**Floor:** Semi-transparent dark surface with faint grid pattern (Terminal aesthetic).

### 3.8 Performance

- **Lazy load:** Three.js + Cannon-es loaded via `dynamic(() => import(...), { ssr: false })` — zero cost until first roll
- **Shared WebGL context:** Single canvas reused across rolls (not recreated)
- **Geometry cache:** Die geometries created once, instanced per roll
- **Texture atlas:** All number textures pre-rendered to a single atlas on first load
- **Auto-quality:** Detect GPU tier via `detect-gpu` package. Low-end → skip shadows, reduce physics steps
- **Skip button:** Always available to bypass animation entirely
- **User preference:** Settings toggle to disable 3D dice globally (falls back to text-only terminal display)

---

## Part 4: Terminal Integration

### 4.1 Roll Log

Every roll is logged to the campaign terminal as a `dice_roll` event. The existing `DiceRollPayload` in `terminal-commands.ts` is replaced with the richer `RollResult` type.

```typescript
// Terminal event integration
interface TerminalDiceEvent {
  type: 'dice_roll';
  rollResult: RollResult;
  displayMode: 'full' | 'compact' | 'hidden';  // GM controls visibility
}
```

**Terminal display (text fallback):**
```
┌─ SKILLED CHECK: Persuasion (Lv.8) ────────────────────┐
│  SD d8[6] │ FD d6[4] │ +3 effort (Flow) │ = 13       │
│  vs DR 12 │ SUCCESS │ margin +1                       │
└────────────────────────────────────────────────────────┘
```

### 4.2 Roll History

All rolls stored in campaign state for:
- Session review / replay
- Statistical analysis (GM tool)
- Audit trail for Godhead injections
- Future: AI Oracle reads roll history to adjust narrative tension

### 4.3 Terminal Commands (Updated)

```
/roll d20                          → Quick roll, 3D animation
/roll d8 d6                        → Roll multiple dice
/check persuasion dr:12 effort:3   → Full skill check with 3D
/check -q persuasion dr:12         → Quick check, text-only (skip 3D)
/deathsave                         → Death save with dramatic animation
/inject set 20 next               → (Godhead) Next roll = 20
/inject ensure-success char:abc    → (Godhead) Next roll by character auto-succeeds
/inject list                       → (Godhead) Show active injections
/inject clear                      → (Godhead) Remove all injections
```

---

## Part 5: Integration Points

### 5.1 How Systems Call Dice

Every game system calls `DiceService` methods. The service handles RNG, injection, events, and logging. Callers never touch `rollDie()` directly.

```
Skills        →  DiceService.skilledCheck()
Unskilled     →  DiceService.unskilledCheck()
Items         →  DiceService.roll() with source: { type: 'item_use', itemId }
Encounters    →  DiceService.roll() with source: { type: 'encounter', encounterId }
Combat        →  DiceService.contestedRoll()
Death Saves   →  DiceService.deathSave()
Fear Checks   →  DiceService.roll() with source: { type: 'fear_check', fearName }
Magic Resist  →  DiceService.roll() with source: { type: 'magic_resistance' }
Terminal      →  DiceService.quickRoll() or DiceService.skilledCheck()
Future AI     →  DiceService.roll() with any custom source
```

### 5.2 Client-Side Flow (Full Sequence)

```
Player clicks "Roll" on skill card
  → Component calls API: POST /api/dice/check
    → API route validates input (Zod)
    → Calls DiceService.skilledCheck()
      → Generates crypto-random results
      → Checks injection registry
      → Computes total, success, margin
      → Emits RollResult via diceEvents (server-side, stored)
    → Returns RollResult to client
  → Client receives RollResult
  → useDiceOverlay triggers 3D animation with predetermined values
  → DiceOverlay renders physics simulation
  → Dice settle, show correct faces
  → Result bar displays breakdown
  → Terminal log updated with roll event
  → Character state updated (effort spent, conditions applied)
```

### 5.3 Server-Side Flow (GM/Watcher Initiated)

```
GM clicks "Call for check" in Watcher Console
  → Sends roll request to all relevant players
  → Each player sees prompt: "Roll [Skill] vs DR [X]"
  → Player sets effort, clicks "Roll"
  → Same flow as 5.2
  → GM sees all results in real-time on Relations Canvas
```

---

## Part 6: File Structure

```
app/src/
  types/
    dice.ts                    — All dice types (RollRequest, RollResult, etc.)
  lib/
    dice.ts                    — Core RNG functions (crypto-based rollDie, etc.)
    dice-events.ts             — Event bus for roll notifications
  services/
    dice.ts                    — DiceService (main orchestrator)
    dice-injection.ts          — Godhead injection registry
  hooks/
    useDiceEvents.ts           — Subscribe to roll events
    useDiceOverlay.ts          — Trigger 3D overlay from events
  components/dice/
    DiceOverlay.tsx             — Portal overlay container
    DiceScene.ts               — Three.js scene setup
    DicePhysics.ts             — Cannon-es physics world
    DiceMesh.ts                — Geometry + materials per die type
    DiceTextureAtlas.ts        — Number texture rendering
    DiceAnimator.ts            — Throw + settle + snap-to-result
    DiceResultBar.tsx           — Post-settle result display
  app/api/dice/
    roll/route.ts              — POST: execute a roll
    check/route.ts             — POST: execute a skill/unskilled check
    inject/route.ts            — POST/DELETE/GET: manage injections (Godhead)
```

---

## Part 7: Dependencies to Add

```json
{
  "three": "^0.172.0",
  "cannon-es": "^0.20.0",
  "@types/three": "^0.172.0",
  "nanoid": "^5.1.0"
}
```

- **three** (~150KB gzipped) — 3D rendering
- **cannon-es** (~45KB gzipped) — Physics simulation (ES module, tree-shakeable)
- **nanoid** (~130 bytes) — Roll ID generation
- No WASM, no heavy dependencies, all tree-shakeable

---

## Part 8: Implementation Phases

### Phase 1: Engine Foundation
- [ ] Create `types/dice.ts` with all type definitions
- [ ] Upgrade `lib/dice.ts` with crypto RNG + rejection sampling
- [ ] Build `services/dice.ts` with all convenience methods
- [ ] Build `lib/dice-events.ts` event bus
- [ ] Build `services/dice-injection.ts` registry
- [ ] API routes: `/api/dice/roll`, `/api/dice/check`, `/api/dice/inject`
- [ ] Update terminal commands to use DiceService
- [ ] Tests for RNG distribution, injection, and check calculations

### Phase 2: 3D Renderer
- [ ] Install three + cannon-es
- [ ] Build `DiceScene.ts` (camera, lights, floor, walls)
- [ ] Build `DiceMesh.ts` (all 5 die geometries + materials)
- [ ] Build `DiceTextureAtlas.ts` (number rendering)
- [ ] Build `DicePhysics.ts` (world setup, rigid bodies)
- [ ] Build `DiceAnimator.ts` (throw, settle detection, snap-to-result)
- [ ] Build `DiceOverlay.tsx` (React portal, lifecycle)
- [ ] Build `DiceResultBar.tsx` (breakdown display)
- [ ] Hook into `useDiceEvents` for automatic triggering

### Phase 3: Polish & Integration
- [ ] Pillar-colored dice materials
- [ ] Death save dramatic animation (slow-mo, red glow, heartbeat sound)
- [ ] Contested roll split-screen (attacker left, defender right)
- [ ] Skip animation button + user preference toggle
- [ ] Performance optimization (GPU detection, quality tiers)
- [ ] Accessibility: screen reader announces results, reduced motion mode
- [ ] Roll history panel in Terminal view

### Phase 4: Godhead AI (Future)
- [ ] AI Oracle reads roll history + narrative context
- [ ] Suggests injections to Godhead based on dramatic tension
- [ ] Auto-injection rules (e.g., "first death save always succeeds")
- [ ] Narrative tension meter influences injection probability

---

## Design Decisions & Rationale

### Why crypto RNG over Math.random()?
`Math.random()` uses xorshift128+ which is fast but predictable if you can observe enough outputs. For a TTRPG this matters less than a casino, but:
1. It's trivially easy to use `crypto.getRandomValues()` instead
2. Players trust the system more knowing it's cryptographic
3. It eliminates any theoretical manipulation via browser devtools
4. The performance difference is negligible (~0.1μs vs ~0.01μs per call)

### Why predetermine results before animation?
1. **Authority lives server-side** — client can't manipulate outcomes
2. **Injection works transparently** — override happens before any visual
3. **Animation is purely cosmetic** — decoupled from game logic
4. **Network-friendly** — result is known immediately, animation is local sugar
5. **Skip button works** — can dismiss animation without waiting for physics

### Why not @3d-dice/dice-box?
Purpose-built dice library but:
1. Uses Ammo.js (Bullet physics compiled to WASM) — 1.5MB+ download
2. Less control over materials/theming to match GRO.WTH aesthetic
3. Harder to integrate Godhead injection (result snapping)
4. Three.js + Cannon-es gives us full creative control at lower weight

### Why an event bus instead of React context?
1. DiceService runs server-side — can't use React context
2. Event bus works across service/component boundary
3. Multiple subscribers (Terminal log + 3D overlay + future roll history)
4. Simpler than context + reducer for this fire-and-forget pattern
