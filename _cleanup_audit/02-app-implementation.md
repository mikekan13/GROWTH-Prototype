# GRO.WTH App Implementation Audit

**Scope:** `C:\Projects\GRO.WTH\app\` (Next.js 16 + React 19 + Prisma 7 + SQLite)
**Date:** 2026-05-02
**Note:** Character creation work is being done in a fork at `C:\Projects\GROWTH Character Creator\` and will merge back later. Gaps in the wizard flow below are presumed filled there.

---

## 1. Pages / Routes (18 page files)

| Route | Purpose |
|---|---|
| `/` | Landing / login entry |
| `/layout.tsx` | Root layout |
| `/hub` | Public campaign hub (campaign listings) |
| `/hub/[id]` | Hub campaign detail |
| `/hub/[id]/apply` | Apply to a hub campaign |
| `/trailblazer` | Trailblazer (player) dashboard |
| `/watcher` | Watcher (GM) dashboard |
| `/watcher/campaign/[id]` | Watcher campaign view |
| `/watcher/campaign/[id]/settings` | Campaign settings |
| `/watcher/characters/new` | GM character creation |
| `/watcher/review/[id]` | GM review queue |
| `/terminal` | ADMIN-only terminal console |
| `/campaign/[id]` | In-canvas campaign view (CampaignCanvas host) |
| `/campaign/[id]/apply` | Apply to a campaign |
| `/character/[id]` | Character sheet view |
| `/character/[id]/backstory` | Backstory editor |
| `/profile/[username]` | Public profile |
| `/profile/edit` | Edit own profile |

**Observations:** Three top-level dashboards (terminal/watcher/trailblazer) align with role hierarchy. `/hub` and `/campaign/[id]/apply` look duplicative — two paths into the same apply flow.

---

## 2. API Routes (86 total)

**Auth (5)** — `/api/auth/{login,logout,me,register,view-as}`. bcrypt + session cookies, no OAuth. `view-as` enables admin role impersonation. ✅ Complete.

**Access codes (2)** — `/api/access-codes`, `/api/access-codes/redeem`. WATCHER QR-driven signup. ✅ Complete.

**Campaigns (38)** — Bulk of the API surface. Covers lifecycle (CRUD, sessions, stream, regenerate-invite, listing, ai-settings), members (interest, members, members/me, requests), applications (template, suggest, expand), copilot (route, history), forge (CRUD, author, pull, publish), encounters, entities, events, items, locations, rest, contested-check, skill-check (+wager).

**Characters (3)** — list, detail, backstory.

**Hub (3)** — public campaign hub.

**Dice (4)** — `/check`, `/roll`, `/deathsave`, `/inject`. Server-authoritative rolling per memory. ✅ Complete.

**KRMA (10)** — `/audit/verify`, `/metrics`, `/wallets/me`, `/wallets/me/transactions`, `/campaigns/[id]/{balance,fund,defund,crystallize,economy,transactions}`. ✅ Complete (matches memory's "9 routes" + 1 economy).

**Portraits (7)** — `/accept`, `/existing`, `/generate`, `/history`, `/lock`, `/provider`, `/status`. Wiring exists; quality work happens in the fork.

**Forge (1)** — `/forge/global` (cross-campaign catalog).

**Goals (3)** — `/goals`, `/goals/[id]`, `/goals/[id]/resistance`.

**Godhead (1)** — `/godhead/[name]/invoke`. Single agent invocation endpoint.

**Changelog (2)** — `/changelog`, `/changelog/[id]/revert`.

**Profile (3)** — list, `[username]`, `/avatar`.

**References (2)** — `/references`, `/references/describe` (image refs for portraits).

**Auth coverage:** 79 of 86 route files reference `getSession`/`requireAuth`/`requireRole`. The 7 unprotected routes are likely public (login/register/hub listing) — worth a follow-up sweep.

---

## 3. Services (28 files)

| Service | Owns |
|---|---|
| `access-code.ts` | Code generation + redemption |
| `application.ts` | Player application lifecycle |
| `auth.ts` | Registration, login, session helpers (paired with `lib/auth.ts`) |
| `backstory.ts` | Character backstory CRUD |
| `campaign.ts` | Campaign CRUD, listing, invite codes |
| `campaign-event.ts` | Event log entries |
| `campaign-item.ts` | World items per campaign |
| `changelog.ts` | Change tracking + revert |
| `character.ts` | Character CRUD, status pipeline |
| `context/entity-context.ts` | Co-pilot entity context assembly |
| `context/goal-context.ts` | Co-pilot goal context |
| `context/index.ts` | Context aggregator |
| `dice.ts` | Server-side roll resolution |
| `dice-injection.ts` | GM dice injection (terminal commands) |
| `encounter.ts` | Combat encounter persistence |
| `entity.ts` | NPC / entity CRUD |
| `forge.ts` | Forge item CRUD |
| `forge-authoring.ts` | 3-stage authoring chain (Selva→Creator→Kai) |
| `goal.ts` | Goal CRUD (1 TODO: KRMA cost for abandonment) |
| `goal-custodian.ts` | Goal ownership transfer |
| `goal-resistance.ts` | Goal opposition mechanics |
| `hub.ts` | Public hub listings |
| `krma/crystallization.ts` | KRMA crystallization (state transition) |
| `krma/death-split.ts` | Death KRMA distribution |
| `krma/evaluator.ts` | Karmic value scoring |
| `krma/ledger.ts` | Atomic ledger writes + sequence |
| `krma/reconciliation.ts` | Audit + drift detection |
| `krma/wallet.ts` | Wallet ops + balance |
| `location.ts` | Location CRUD |
| `profile.ts` | User profile + avatar |

**Observations:** Clean layering. KRMA fully decomposed. Goal subsystem has 3 services (goal, custodian, resistance) — heavyweight relative to UI; check if all are exercised.

---

## 4. Components (~70 files, 13 sub-areas + 11 top-level)

| Area | Count | Key files |
|---|---|---|
| `canvas/` | 16 | `RelationsCanvas`, `CharacterCard`, `FolderGroup`, `EncounterTracker`, `RestPanel`, `GROvinePanel`, plus per-card components (Vitals, Skills, Traits, Magic, Inventory, Harvest, Goal, Backstory, Location, WorldItem) |
| `character/` | 10 | `CharacterSheet`, `CharacterTab`, `CharacterBuilder`, `IdentityLockWizard`, `PortraitPanel`, section components |
| `dice/` | 9 | 3D dice (`DiceScene`, `DicePhysics`, `DiceMesh`, `DiceAnimator`, `DiceTextureAtlas`, `DiceOverlay`, `DiceOverlayLoader`, `DiceResultBar`, `DiceToggle`) |
| `ui/` | 4 | Shared primitives |
| `terminal/` | 4 | Campaign terminal + admin terminal pieces |
| `hub/` | 4 | Hub listing UI |
| `profile/` | 3 | Profile cards/forms |
| `tapestry/` | 2 | `TapestryTab` + sub-component |
| `forge/` | 2 | Forge panel pieces |
| `campaign/` | 2 | `CampaignSettingsForm`, `EffortWagerModal` |
| `entity/` | 1 | `EntityCreationWizard` (3 TODOs) |
| `changelog/` | 1 | `ChangeLogPanel` |
| `application/` | 1 | `PlayerApplicationForm` |
| top-level | 11 | `CampaignCanvas`, `CampaignCreator`, `AuthForm`, `BackstoryEditor`, `BackstoryReview`, `DashboardShell`, `EyetehrnetLogo`, etc. |

`CampaignCanvas` is the spatial-web GM interface (Relations Canvas vision). Canvas + Character + Dice are the three biggest investments.

---

## 5. Prisma Schema (32 models)

`User, Campaign, CampaignMember, CampaignApplication, Character, CharacterBackstory, Wallet, KrmaTransaction, LedgerSequence, BurnLedger, AuditEntry, Session, ChangeLog, GameSession, CampaignEvent, ForgeItem, PlayerRequest, Location, CampaignItem, Encounter, CopilotMessage, PortraitGeneration, PersonaLock, Goal, EntityRelationship, GodHead, GodHeadMemory, GodHeadInvocation, GodHeadActionLog, GodHeadTokenUsage, GodHeadMessage, AccessCode`

**JSON-blob fields (SQLite-driven):**
- `User.profile`, `User.watcherProfile` — JSON
- `Campaign.themes`, `customPrompts` (legacy), `applicationTemplate`, `listingTags`, `requiredFields`, `aiSettings`
- `Character.data` — full GrowthCharacter JSON (the big one)
- `ChangeLog.changes`, `snapshotBefore`
- `KrmaTransaction.metadata`
- `EntityRelationship.data`, `relationshipTags`
- Encounter/Location/CampaignItem all have JSON metadata fields

**Flags:**
- `Campaign.customPrompts` is marked legacy in the schema — application template replaced it.
- `GodHead*` models (5 models, last 3 migrations) form a substantial agent infrastructure that has only ONE API endpoint (`/godhead/[name]/invoke`). Heavy schema, light surface — likely partially built.
- `BurnLedger` and `AuditEntry` exist but only `audit/verify` route uses them.

**Migrations:** 15 total, latest `20260501173633_godhead_default_model` (yesterday).

---

## 6. AI Systems (`src/ai/`)

| File | Status |
|---|---|
| `application-ai.ts` | ✅ Working — application prompt suggest/expand |
| `campaign-ai.ts` | ✅ Working — co-pilot helpers |
| `copilot/copilot-service.ts` | ✅ Working — no TODOs/stubs found |
| `copilot/context-assembler.ts` | ✅ Working — pre-retrieval entity context |
| `copilot/rules-search.ts` | ✅ Working — keyword search across rules MD |
| `copilot/action-parser.ts` | ✅ Working — parses action intents |
| `copilot/types.ts` | ✅ |
| `portraits/portrait-service.ts` | 🟡 Working entrypoint, "persona lock stub" comment |
| `portraits/character-adapter.ts` | ✅ |
| `portraits/prompt-builder.ts` | ✅ |
| `portraits/state-diff.ts` | ✅ |
| `portraits/style-config.ts` | ✅ |
| `portraits/providers/{cloud,local,index}.ts` | ✅ — provider abstraction |
| `portraits/workflows/*.json` | 5 ComfyUI workflows + README |
| `prompts/application.ts` | ✅ |
| `providers/{claude,ollama,index}.ts` | ✅ — text provider abstraction |

**No abandoned files in `ai/`.** Memory says portrait pipeline mostly lives in the standalone fork — main app has the wiring/storage, the active R&D is elsewhere.

---

## 7. Stub / TODO / FIXME Hunt

Total markers found: **10 across 7 files** — remarkably clean.

| Count | File |
|---|---|
| 3 | `components/entity/EntityCreationWizard.tsx` (PC backstory import, campaign context wiring, prompt-driven step generation) |
| 2 | `types/encounter.ts` (Time Stack ordering, environmental effects) |
| 1 | `types/location.ts` (ley line / mana sourcing) |
| 1 | `services/goal.ts` (KRMA abandonment cost) |
| 1 | `components/tapestry/TapestryTab.tsx` (player messaging "coming soon") |
| 1 | `components/character/CharacterTab.tsx` (submit to Watcher button no-op) |
| 1 | `ai/portraits/portrait-service.ts` (persona lock stub comment) |

---

## 8. Dead Code Signals

- **No `.bak` / `.old` / `.disabled` / `_deleted` files** anywhere in `src/`.
- Schema flags `Campaign.customPrompts` as legacy.
- `CharacterTab.tsx` has a non-wired "submit to Watcher" button.
- Heavy `GodHead*` schema with 1 API route — surface mismatch suggests in-progress, not dead.
- `goal-custodian.ts` and `goal-resistance.ts` exist but no UI surfaces in the canvas component list reference them by name — verify before assuming dead.

---

## 9. Lib (Infrastructure, 17 files)

`api.ts`, `auth.ts`, `campaign-stream.ts`, `changelog-utils.ts`, `character-actions.ts`, `db.ts`, `defaults.ts`, `dice.ts`, `dice-events.ts`, `dice-utils.ts`, `errors.ts`, `kv-calculator.ts`, `materials.ts`, `pending-checks.ts`, `permissions.ts`, `seed-catalog.ts`, `terminal-commands.ts`.

`auth.ts` is clean bcrypt + session-cookie (7-day TTL). `permissions.ts` is small (~5 helpers — `canManageCampaign`, `canViewCharacter`, `canEditCharacter`, `isAdminRole`, `isWatcherOrAbove`).

---

## 10. Beta Readiness Matrix

| Feature | Status | Notes |
|---|---|---|
| Auth (bcrypt + sessions) | ✅ done | 79/86 routes guarded; no OAuth as designed |
| Access codes (QR signup) | ✅ done | List + redeem routes, role grant on redeem |
| Role hierarchy (ADMIN/GODHEAD/WATCHER/TRAILBLAZER) | ✅ done | Permissions + role-based dashboards |
| KRMA ledger / wallets / economy | ✅ done | 5 services + 10 routes + audit + reconciliation |
| Server-side dice (roll/check/deathsave/inject) | ✅ done | Matches memory; lib/services/api all isolated |
| Canvas folders + Relations Canvas | ✅ done | 16 canvas components, FolderGroup polished |
| Campaigns CRUD + invite + listing | ✅ done | Full lifecycle, listing → hub flow |
| Forge + 3-stage authoring chain | ✅ done | Per recent commits, chain mandatory |
| Changelog + revert | ✅ done | Service + route + UI panel |
| Skill check flow (SD → wager → FD) | ✅ done | API routes + EffortWagerModal |
| Encounter system | 🟡 partial | Service + 2 routes + tracker UI; types have PLACEHOLDER for Time Stack ordering & environmental effects |
| Goal system | 🟡 partial | 3 services exist; KRMA-cost for abandonment is TODO; custodian/resistance UI presence unclear |
| Co-pilot (Ollama gemma2 + actions) | 🟡 partial | All wiring complete; quality/coverage of actions and rules-search depth not validated by static read |
| Tapestry tab (Trailblazers/Entities/GRO.vines) | 🟡 partial | Tab exists; player messaging "coming soon"; EntityCreationWizard has 3 TODOs (PC backstory import, context wiring, multi-step generation) |
| Portrait pipeline (storage + provider) | 🟡 partial | 7 routes + provider abstraction + 5 workflows; persona-lock has stub comment; active dev in standalone fork |
| Character creation wizard | 🟡 partial | `CharacterBuilder` + `IdentityLockWizard` exist in main app; primary work moved to fork pending merge |
| GodHead agent infrastructure | 🟡 partial | 5 Prisma models + 3 recent migrations + 1 API route — schema-heavy, surface-light |
| Hub (public listings + apply) | ✅ done | Pages + routes + service |
| Profiles + avatars | ✅ done | Routes + service + UI |
| Locations | 🟡 partial | CRUD + canvas card; ley-line/mana TODO |
| References (image refs for portraits) | ✅ done | List + describe routes |
| Player messaging in Tapestry | 🔴 missing | "coming soon" placeholder |
| Submit-character-to-Watcher button | 🔴 missing | TODO placeholder in CharacterTab |
| WebSocket / live updates | 🟡 partial | `campaign-stream.ts` + `/stream/route.ts` exist (likely SSE) |
| Mobile/responsive | unknown | Out of static-audit scope |
