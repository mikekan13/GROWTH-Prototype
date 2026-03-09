# Skeleton Systems Pass — Report
**Date:** 2026-03-09
**Build:** Clean (Next.js 16, TypeScript, Prisma 7)

---

## Systems Added

### 3 New Database Models (Full CRUD Stack)

| System | Model | Types | Service | API Routes | Canvas Component |
|--------|-------|-------|---------|------------|-----------------|
| **Locations** | `Location` | `types/location.ts` | `services/location.ts` | 2 routes (list/create + get/update/delete) | `LocationCard.tsx` |
| **World Items** | `CampaignItem` | `types/item.ts` | `services/campaign-item.ts` | 2 routes | `WorldItemCard.tsx` |
| **Encounters** | `Encounter` | `types/encounter.ts` | `services/encounter.ts` | 2 routes | `EncounterTracker.tsx` |

### 4 New Canvas Components

- **LocationCard** — Compact (280px) and expanded (480px) views. Shows description, tech/wealth/danger levels, features, ley lines, tags, GM notes. Color-coded by location type.
- **WorldItemCard** — Compact (240px) and expanded (400px) views. Displays damage in canonical `P:S:H/D\C:B:E` format, armor resistance/layer, prima materia details, material modifiers, condition tracking, holder/location assignment.
- **GROvinePanel** — Full GROvine management: add new goals, expand to see G/R/O details, complete/fail/abandon actions, capacity tracking (default 3 slots), completed/failed history.
- **EncounterTracker** — Three-phase combat tracker (Intention -> Resolution -> Impact), round counter, phase advance button, per-participant action pools (Body/Spirit/Soul), participant grouping by side (ally/enemy/neutral), status controls (start/pause/resume/resolve).

### Canvas Integration

- Locations and items render as **expandable foreignObject cards** on the canvas (same pattern as CharacterCard)
- Create buttons for locations and items added to the canvas toolbar
- Canvas `CanvasNode` type extended with `item` type and location/item-specific data fields

### 2 New/Updated Tabs in CampaignCanvas

- **Encounters** — Encounter management surface with create button and placeholder for list
- **Essence** (was placeholder, now populated) — Campaign-wide view of active GROvines, Nectars/Blossoms/Thorns summary, and Harvest log across all characters

---

## Files Created (24)

- `prisma/migrations/20260309..._add_locations_items_encounters/` — Schema migration
- `src/types/location.ts`, `src/types/item.ts`, `src/types/encounter.ts` — Type definitions
- `src/services/location.ts`, `src/services/campaign-item.ts`, `src/services/encounter.ts` — Business logic + Zod
- `src/app/api/campaigns/[id]/locations/route.ts` + `[locationId]/route.ts` — Location API
- `src/app/api/campaigns/[id]/items/route.ts` + `[itemId]/route.ts` — Item API
- `src/app/api/campaigns/[id]/encounters/route.ts` + `[encounterId]/route.ts` — Encounter API
- `src/components/canvas/LocationCard.tsx` — Location card component
- `src/components/canvas/WorldItemCard.tsx` — World item card component
- `src/components/canvas/GROvinePanel.tsx` — GROvine management panel
- `src/components/canvas/EncounterTracker.tsx` — Encounter tracker component

## Files Modified (7)

- `prisma/schema.prisma` — 3 new models + Campaign relations
- `src/components/canvas/RelationsCanvas.tsx` — New node type rendering, imports, create buttons
- `src/components/CampaignCanvas.tsx` — Location/item CRUD handlers, Encounters tab, Essence tab content
- `src/app/campaign/[id]/page.tsx` — Queries locations + items from DB, builds canvas nodes
- `docs/module_registry.md` — Updated with new services and components
- `docs/database_schema.md` — Documented 3 new models
- `PLAN.md` — Marked skeleton systems complete

---

## Placeholders & Ambiguities

### Placeholders Marked in Code

- `[PLACEHOLDER] Ley line data for mana sourcing` — Location type has ley line fields but no mechanical integration with the magic system yet
- `[PLACEHOLDER] Time Stack ordering` — Encounter system tracks phases but doesn't implement the full Time Stack resolution (Flow priority > Focus priority ordering)
- `[PLACEHOLDER] Environmental effects` — Encounter has no terrain/weather/lighting modifier system yet

### Ambiguities Discovered

1. **NPC rendering** — NPCs are defined in `CanvasNode.type` but still render as simple circles. They could use the Character model with an `isNPC` flag, but no flag exists yet. Currently no distinction between PC characters and NPCs in the data model.
2. **Item-to-character binding** — `CampaignItem.holderId` references a character, but there's no automatic sync between world items and a character's `inventory.items[]` JSON. These are two separate representations.
3. **Encounter participants** — Stored in the JSON `data.participants` array, but there's no foreign key linking to Character records. Participants are identified by name/id string only.
4. **Harvest mechanics** — The HarvestCard exists but has no service/API. Harvests are stored in character JSON only, with no campaign-level tracking.
5. **Wealth/Tech/Health level advancement** — Types exist, displayed in character cards, but no service logic for level checks, advancement, or age-gating.
6. **Connection lines** — The canvas supports `CanvasConnection` but no connections are ever created from the DB. The `connections` prop is always `[]`.

---

## Recommendations for Next Refinement Pass

1. **NPC system** — Add `isNPC: Boolean` flag to Character model, render NPC characters with a lightweight card variant
2. **Encounter wiring** — Load encounters from DB in the Encounters tab, render EncounterTracker for each, add/remove participants from canvas characters
3. **Item assignment flow** — When a world item is assigned to a character (holderId), optionally sync to their inventory JSON
4. **Connection creation UI** — Allow GM to draw connection lines between any two nodes (character <-> location, character <-> character, etc.)
5. **GROvine persistence** — Wire GROvinePanel callbacks through character-actions -> changelog so vine changes are tracked and saved
6. **Editable location/item data** — Add inline editing to LocationCard and WorldItemCard (currently display-only)
7. **Combat resolution** — Implement Time Stack ordering, contested vs uncontested attack resolution, damage application through armor layers
