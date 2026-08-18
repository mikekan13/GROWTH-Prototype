# FORGE CONTENT AUDIT — 2026-08-17

Field-by-field audit of every Forge block type: what canon requires, what the app
(schemas / DB content / pricing / display) actually has, and proposed fixes.

**STATUS (overnight 2026-08-17→18):** Mike authorized fixing everything
blatantly wrong overnight. Findings marked **[FIXED]** are done, tested, and
pushed. **[Q]** items are parked for Mike's morning batch review — answer by ID.

Legend:
- **[FIXED]** = implemented overnight (canon-backed, no ruling needed).
- **[FIX]** = clear defect, fix known, but NOT applied (needs a nod or touches data).
- **[Q]** = clear defect, fix known, but needs your ruling / canon silent.

## ☀ MORNING REVIEW LIST (answer by ID)

**Rulings needed:** S2 (body-as-items migration), S8 (Human 225 spread + recompute),
R2 (ageAdded = start age vs span → unblocks R4-rest/R5), R3 (wealth/equipment/hooks
fields), R7 (requirement strings), X5 (betaDraft flags), K3 (skill blueprints KV 0
by design?), P3 (DR≥50 flag at authoring?), T3 (trait category enum — code
invention), T4 (maturity flags field), T5 (lien metadata now or post-beta),
T6 (blossom duration field), I5 (vehicle structure), M3 (bless material numbers),
I2 (retire legacy item fields), M1+L10 (ForgePanel.tsx is dead code — delete?).

**Data decisions:** re-grade the 122 published traits + 16 NULL-KV rows through
fixed Kai? Migrate stock roots/branches to the canonical shape? **Violet's 4
pending drafts are in the old freeform shape — recommend DENY them; JEWL now
re-proposes in canonical schema shape with a formula price attached.**

Canon authorities used: `00_CANON_CORE.md`, `Seed_KV_Formulas.md` (LOCKED),
`Seeds_Roots_Branches_System.md`, `Material_System.md` (#validated),
`Equipment_Conditions.md` (#validated), rulings r-2026-04-22-xx / r-2026-05-19-xx,
and the 2026-08-04 content-generation balance reference.

---

## 0. CROSS-CUTTING (affects every type)

**X1 [FIXED] — JEWL's drafts are never schema-validated.** `propose_forge_blueprint`
only checks the payload is valid JSON. His genesis root/branch drafts use a shape
(`mechanicalEffects.attributeModifiers` + prose skills) that matches NEITHER the
canonical Zod schemas (`validateForgeData`) NOR the stock catalog shape. Three
different root shapes now coexist in the DB.
*Fix:* run `validateForgeData(type, data)` inside `propose_forge_blueprint` and
surface violations back to JEWL so drafts arrive chain-ready; update the genesis
prompt law so JEWL authors in the canonical schema shape.

**X2 [FIXED-partial] — Kai's chain doesn't actually run on JEWL's drafts.**
*(Done: drafts now arrive pre-priced by the locked formulas, stamped as
"Formula price (awaiting Kai)" and shown in the Workshop grade panel. The full
async Kai dispatch stays as designed — his evaluate now uses the same fixed
formulas, so when the chain runs its number supersedes cleanly.)* Per your ruling
(godheads decide hard mechanics), every draft should get `evaluate_blueprint`
(price + balance score) before you see it. Today `blueprint.submitted` is emitted
but in dev the dispatcher just enqueues a PENDING invocation — drafts reach your
Forge with **no KV** (Violet's four all show blank KV).
*Fix:* run Kai's evaluator synchronously on propose (deterministic pricing is
cheap), stamp `karmicValue` + balance score on the draft, show both as
"Kai's grade" in the Workshop next to JEWL's suggestion.

**X3 [FIXED] — Kai's pricer diverges from the LOCKED formulas**
*(New `services/forge-pricing.ts` + 9 tests incl. the Elven 626 worked example.)* (details per type
below): missing the frequency-budget component for seeds, prices thorns +5
instead of negative liens, no magic-skill 2× rate, no root/branch breakeven rule.
*Fix:* rewrite `priceBlueprint` per type against the locked formulas.

**X4 [FIXED] — `spell` exists in FORGE_ITEM_TYPES but has no Workshop tab.**
Spells are authorable content with a signed-off schema (r-2026-07-23-01).
*Fix:* add the Spells tab with the same treatment.

**X5 [Q] — stale `betaDraft: true` flags** sit on many published global rows
(Wayfarer, Centuries of Watch, Time Drift...). Meaningless to the UI today.
Keep as provenance metadata, or strip?

---

## 1. SEEDS

### Canon requires (Seed_KV_Formulas.md LOCKED + CANON_CORE §4)
- Starting Frequency Budget (1 KRMA/pt) · Base Fate Die d4/d6/**d8 default**/d12/d20
  (KV 5/10/20/40/80; also caps nectar+thorn slot count) · Fated Age
  (KV = ceil(age × 0.5)) · Base Resist 0-50 (KV = 2×) · Attribute **AUGS only,
  never levels** (1 KRMA/pt; aug totals vary by seed identity, balance at
  TKV-tier level) · Starting skills rare (default 0, cap level 4 = d4, 1 KRMA ×
  level, 2× magic) · Starting Nectars/Thorns (Kai-graded; thorns negative liens)
  · Body structure · seedKV total.
- TKV tiers: Low 130-220 · Medium 220-350 · High 350-550 · Premium 550+.
  Locked worked example: Elven = **476**.

### Findings

**S1 [FIXED] — `forgeSeedDataSchema` silently DROPS `bodyStructure`.** The published
Human has `bodyStructure`; the Zod schema doesn't know the field, and z.object
strips unknown keys — any seed re-authored through the chain loses its anatomy.
*Fix:* add `bodyStructure` to the schema (current parts/vitals shape for now; see S2).

**S2 [Q] — Body model is the superseded one.** Canon locked body-as-items
2026-05-19 (`GrowthWorldItem` with `isBodyPart`, nested `contains`, per-part
condition + material). App-wide (`GrowthSeed.bodyStructure`, seed data, schema)
still uses the old `{parts: string[], vitals: string[]}` model. This is a
structural migration, not a display fix. Do we (a) migrate seeds to body-as-items
now, (b) keep the string-list as the *template* that lazy-spawns items at
character creation (arguably matches "only core parts baseline, finer anatomy
lazy-spawns"), or (c) defer?

**S3 [FIXED] — No `size` field anywhere.** *(Added as optional {width,length,height}; no values invented — existing seeds show nothing until backfilled.)* Canon (r-2026-05-19-05): numeric
`width×length` grid footprint + descriptive height, no categories. Blocks the
creature-size gap flagged since May.
*Fix:* add `size: { width, length, height: string }` to seed schema + display.
(Existing seeds get Human defaults 1×1.)

**S4 [FIXED] — `seedKV` missing from data; UI reads it and shows "?".** KV lives
only in the `karmicValue` column; `SeedDetail` reads `data.seedKV`.
*Fix:* display from `karmicValue` everywhere; keep data lean.

**S5 [FIXED] — Seed detail misrepresents attributes.** The UI grid titles them
"ATTRIBUTES" and includes FRQ (always "—", since frequency isn't an attribute
aug — it's the Starting Frequency Budget, stored top-level). Canon: seeds give
AUGS on 8 attributes; Frequency is `level + current`, never augged.
*Fix:* retitle "ATTRIBUTE AUGMENTS" showing +N per attribute (8, no FRQ), and
show "STARTING FREQUENCY: 40" as its own stat with the other seed stats. Show
the KV breakdown math (augs + freq + resist×2 + fate die + age/2 + traits) so
you can eyeball a seed's price at a glance.

**S6 [FIXED-minimal] — Nectars/thorns on seeds are bare name-strings.**
*(Done: slot-cap validation at authoring + "traits N/M slots" display. The
"store trait references with KV" upgrade remains your scope call.)* No KV grade, no
pillar, no link to real trait blocks; the fate-die trait-slot cap
(nectars+thorns ≤ die size) is not validated anywhere.
*Fix (minimal):* validate slot cap at authoring; display "traits 2/8 slots".
*Fix (right):* store trait references `{name, forgeItemId?, kv}` so seed traits
resolve to actual graded trait blocks. Your call on scope.

**S7 [FIXED] — Stale pre-lock seeds pollute the global catalog.**
*(Elven/Dwarven/Halfling/Cambion un-globaled — isGlobal=0, rows intact and
reversible. Human 225 + Altered Human 350 left as anchors pending S8.)* Elven KV 35
(locked worked example says 476), Dwarven 29, Halfling 22, Cambion 32 — all
paper-era junk you already flagged 2026-08-04. They're actively harmful as
grading anchors for JEWL.
*Fix:* unpublish (or delete) the four; re-author later under the locked formula.

**S8 [Q] — Human (225) attribute spread looks like a character, not a species.**
Augs: willpower 13, focus 7, everything else 5. For the baseline-species anchor,
that reads odd (and 50 aug KV + 40 freq + 30 resist + 20 die + 40 age = 180;
the published 225 implies +45 net from Ambitious − Bounded Potential, which as
a nectar-minus-lien doesn't obviously work out). Was the 225 Human's spread
intentional? Should Human be re-derived cleanly under the locked formula?

**S9 [FIXED] — Kai's `evaluate_blueprint` seed pricing omits the Frequency-budget
component** (+1/pt; Human's is worth 40 KV) and prices each nectar AND thorn at
flat +5 (thorns must be NEGATIVE liens).
*Fix:* add frequency term; thorn = negative Kai-graded lien; nectar graded (5 KV
anchor per +1 flat mod as the default until Kai overrides).

**S10 [FIXED] — Kai's auto-score heuristic flags every legitimate seed.**
"maxAttr ≥ 6 → score 4" — Human has willpower 13; Elven has 60 total augs. Canon
says aug totals vary by tier; balance lives at the TKV-tier level.
*Fix:* score seeds by TKV-tier fit (does total land in a tier band; is any
single aug > ~half the total), not per-attribute ≥6.

---

## 2. ROOTS & BRANCHES

### Canon requires (CANON_CORE §4, r-2026-04-22-10/-11)
- Attribute **LEVELS** (1 KRMA/level) — this is where levels come from
  (Pool Max = level + augPos − augNeg).
- Skills with levels ({name, level}; 1 KRMA/level, 2× magic; die starts at d4 at
  level 4; creation soft cap ~10-12, hard 20).
- Nectars/thorns (Kai-graded; net into block KV).
- KV = levels + skill levels + net trait KV. **No formulaic age term.**
- Frequency cost = max(0, RootKV − breakeven), breakeven = 100 + (age−18)×5.
  Anchor: plain 18yo Human Root ≈ 100 KV. **Max Root start age 25** — older
  belongs in Branches.
- Kai's grading gauge for branches: **3-15 KV per year spanned**.
- **Generic archetypes by law (2026-08-10)** — no campaign lore/proper nouns.

### Findings

**R1 [FIXED-partial] — Three incompatible root/branch data shapes in the wild.**
*(Done: the schema gate now rejects freeform drafts, and JEWL's genesis law
spells out the canonical shapes — no NEW divergent rows. NOT done: migrating
the existing stock rows and Violet's 4 pending drafts — see morning notes.)*
(a) Zod schema: `frequency` + `ageAdded` + `attributes` levels + `skills[{name,level}]`;
(b) stock rows ("Wayfarer"): no `frequency`, no `ageAdded`, skills carry
governors+descriptions (would FAIL the schema);
(c) JEWL's genesis drafts: `mechanicalEffects.attributeModifiers` + prose skills
(match nothing).
*Fix:* one canonical shape = the Zod schema, extended per R2/R3; migrate stock
rows; validate JEWL's drafts (X1). Skills inside blocks should carry
`{name, level, governors?, description?}` — governors/description belong on the
skill *definition* block, but keeping a denormalized copy in the grant is fine
for display; your call.

**R2 [Q] — `ageAdded` means two different things.** Stock "College Degree":
ageAdded=4 (duration). JEWL's "First Lease": ageAdded=19 (start age). Canon
implies a life-stage SPAN ("contents matching those years", KV/yr gauge needs a
span to divide by).
*Fix:* make it explicit: `ageFrom` + `ageTo` (branch) / `ageTo` (root, implicit
from 0). Migrate existing rows. This also unlocks automatic KV/yr display.

**R3 [Q] — Where do "starting wealth / equipment / narrative hooks" live?**
Canon prose lists them as root/branch effects; the schema has no field. Route
through possessions/items at character-assembly time, or add fields?

**R4 [FIXED-partial] — Breakeven/frequency-cost rule not implemented anywhere.**
*(Done: pricer computes root frequency cost per r-2026-04-22-10 and shows it in
the grade panel; `frequency` no longer required from authors (chain computes).
NOT done: migrating stock `frequency` values like College Degree's −7, and the
max-root-age-25 validator — blocked on R2's ageAdded semantics ruling.)* The
schema has a raw `frequency` int (stock rows omit it; College Degree has −7,
which as a *cost* shouldn't be negative — negatives only in thorns). Kai's
pricer has no breakeven logic; max-root-age-25 is unenforced.
*Fix:* compute frequency cost from the locked formula at evaluation time
(display it, stamp it); validate root ageTo ≤ 25; migrate stock `frequency`
values.

**R5 [FIX, blocked on R2] — Kai's KV/yr 3-15 gauge is invisible.** Not computed, not shown.
*Fix:* once R2 lands, compute KV/(span years) and show it on branch detail with
an out-of-band warning chip (<3 pale, >15 hot). Keep it a grading signal, not a
hard block (per canon it's Kai's judgment).

**R6 [FIXED-partial] — Display (Workshop detail) for roots/branches:** the
human-first renderer + grade panel now cover most of it; die-tier labels on
skill levels (level 4 → d4) still pending.
"Attribute Levels" (not augs), skills with their die tier (level 4 → d4),
age span, KV/yr chip, frequency cost, seed requirement. Currently the generic
renderer shows whatever keys exist.

**R7 [Q] — `seedRequirement`/`requirements` are free text.** Should they
eventually validate against real seed/branch names (e.g. "Age 18+", "requires
Elven")? Fine as text for beta?

---

## 3. ITEMS

### Canon requires (item-fields corrections 2026-05-14 + rulings + CANON_CORE §6-7)
- `primaryMaterial` + `subordinateMaterials[]`, `materialClass` **Soft|Hard only**
  (no Hybrid) · `baseResist` 1-50 on ALL items · `weightLbs` real pounds ·
  `condition` **0-4 five-level** (4 Indestructible / 3 Undamaged / 2 Worn /
  1 Broken=resist halved / 0 Destroyed) · `properties[]` universal ·
  `quality` 1-10 flavor-only · `rarity` 1-10 numeric · KV graded (never
  formulaic; material+damage+resist+mods+abilities, Kai case-by-case) ·
  `itemAbilities[]` each with own KV · weapons: named ATTACKS each with damage
  string + **required targetAttribute** · armor: category Clothing/Light/Heavy
  → 0.5×/1×/1.5× resist.
- Explicitly CUT: combatSkill, per-item layerCount, coverage[], per-item
  mobilityPenalty, weapon size category, crafting-quality enum, Tech Level.

### Findings

**I1 [FIXED] — `condition` schema says 1-4; canon is 0-4 five levels.**
Widened; UI shows the level name ("condition 2 · Worn").

**I2 [FIX] — Legacy fields the corrections memo explicitly killed still live in
the schema:** `weightLevel` 0-10, 6-bucket string rarity, `armorLayer`
(duplicate of `armorCategory`), `resistance` (duplicate of `baseResist`),
`value` vs KV ambiguity, `material` vs `primaryMaterial` duplication.
*Fix:* keep parsing them for old rows (back-compat) but stop authoring them:
new-content validation warns; migrate stock where trivial (weightLevel→lbs is
already done for stock).

**I3 [FIXED-partial] — Weapons: no ATTACKS structure.**
*(Done: optional `attacks[]` in schema — name/damage/targetAttribute/range —
plus an Attacks section on item detail. NOT done: hard-requiring
targetAttribute on weapons, which would invalidate existing stock rows.)* Schema has a single `damage`
breakdown + `targetAttribute` (optional!). Canon: multiple named attacks, each
with its own damage string and a REQUIRED targetAttribute.
*Fix:* add `attacks[{name, damage, targetAttribute, range?, notes?}]`; keep
single `damage` as legacy read; require targetAttribute when itemType=weapon.

**I4 [FIXED] — Armor resist multiplier not surfaced.**
Item detail now shows "resist 12×1.5 (Heavy) = 18". `armorCategory` exists but
nothing computes/displays effective resist (0.5×/1×/1.5×).
*Fix:* show "Resist 12 × 1.5 (Heavy) = 18" on armor detail.

**I5 [Q] — Vehicles/electronics: single item with abilities vs multi-part
container is still your open Q4 from 08-04. The `contains` field exists and is
loose. Rule now or leave loose for beta?

**I6 [FIXED-partial] — Item detail display (Workshop):** condition names,
quality, attacks, effective resist done; possession component tree ('contains')
still pending.
Original scope: now decent after the redesign,
but should add: condition name (not just number), quality label (1 Crude…10
Divine), attacks table for weapons, effective resist for armor, itemAbilities
with per-ability KV, and the possession component tree when `contains` is
present.

---

## 4. MATERIALS

### Canon requires (Material_System.md #validated + 08-05 wave-3 anchors)
- Base Resist 1-50, Rarity 1-10, fractional KV per raw unit (<1); stock
  quantities KV 1-12 = crafting price floor · Hard/Soft only · material mods
  (Protective, Flammable, Flexible X, Sharp, Brittle...) · combine rule:
  Final Resist = (Primary + Subordinate) / 2 · Tech Level dead · every item's
  materials must resolve to catalog stock (your 08-05 standing rule; seeder
  gate enforces).

### Findings

**M1 [FIX] — "Materials" is a filter view, not a type (by design), but the
Workshop's Material Designer section (in the old ForgePanel) works from a
hard-coded TS `MATERIAL_CATALOG`, disconnected from the DB stock.** Two sources
of truth.
*Fix:* point material-designer reads at the catalog (`type=material` view);
retire the hard-coded list or make it the seeder's source only.

**M2 [FIX] — Material detail display should show material-specific fields:**
baseResist (as the raw-material ceiling), stock quantity semantics ("KV is for
the stock unit — sheet/bolt/bag"), mods as chips, and the combine rule hint.
Currently they render via the generic item path.

**M3 [Q] — `Complete_Materials_Reference.md` is #needs-review but its numbers
are what's seeded (steel 35, kevlar 25, titanium 34, leather 17...). Bless
those values as validated, or keep the #needs-review flag and revisit?

---

## 5. SKILLS

### Canon requires (Skill_System_Overview.md + Skill_Level_Progression.md #validated)
- Freeform names (no fixed categories) · **1-3 governors** (CANON_CORE §5;
  supersedes old "as many as you wish" archive text) from the 8 non-Frequency
  attributes · die ladder: levels 1-3 flat bonus, 4-5 d4, 6-7 d6, 8-11 d8,
  12-19 d12, 20 d20 · creation soft cap ~10 (12 extreme), lifetime 20 ·
  1 KRMA/level, 2× magic · no magic boolean on skills (magic skills live in
  MagicPillar) · trainable mechanic (failed check → Long Rest advance).

### Findings

**K1 [FIXED] — governors uncapped in schema.** Canon says 1-3; schema allowed
unlimited. → `.max(3)` added. (Stock "Athletics" has exactly 3 — fine.)

**K2 — schema is otherwise canonical.** Skill blueprints = definition only
(governors + description); levels attach at grant time. Matches canon. ✓

**K3 [Q] — skill blueprint KV.** Stock skills carry KV 0 (Athletics). Is a
skill *definition* free by design (you pay per level at grant), so KV 0 is
correct? Assume yes; confirm.

## 6. SPELLS

### Canon requires (r-2026-07-23-01 signed-off schema)
- school + schools[] (multi-school → weakest die) · additive DR breakdown
  (total must equal sum — schema enforces ✓) · manaCost · kv (required before
  teachable) · failureConditions · persistentEffects · DR≥50 system review.

### Findings

**P1 — the Zod schema matches the signed-off shape.** Including the additive-DR
refine. Nothing wrong found. ✓

**P2 [FIXED] — no Spells tab in the Workshop** despite spell being a valid
authorable type. → Tab added with school/DR/mana/KV facts on the detail card.

**P3 [Q] — `requiresSystemReview` (DR≥50 flag) exists in the character-side
type but not in the forge spell schema. Should the Forge stamp it at authoring
(dr.total ≥ 50), or is that learn-time only?

## 7. NECTARS / THORNS / BLOSSOMS

### Canon requires (CANON_CORE §3 + trait memories)
- **pillar REQUIRED** (r-2026-05-19-03; drives death routing: body→stripped,
  soul→half, spirit→kept) · bearer-agnostic rule text · Kai-graded KV
  (+1 flat ≈ 5 KV anchor; synergy-aware) · thorns = NEGATIVE liens collected
  at death · nectars/thorns must be play-defining exploits; blossoms are
  explicitly LIGHTER and may be negative (r-2026-06-11-05), don't count
  against fate-die slots · easy-to-track: binary triggers, no mid-combat math
  or percentage thresholds.

### Findings

**T1 [FIXED] — pillar was optional in the authoring schema** despite the
ruling. → Now required for new authoring (legacy rows unaffected — reads
don't re-validate; death engine still defaults untagged to spirit).

**T2 [FIX applied to NEW content only] — trait KV signs are inconsistent in
existing data:** thorn "Time Drift" +1, blossom "The Flu" −10, nectar
"Centuries of Watch" +2 (vs the ≈5 anchor for its +1 wisdom mod). The new
pricer outputs thorns negative / nectars positive going forward; **existing
rows were NOT re-graded** (Kai's job, and grading is synergy-aware).
*Morning call:* want a Kai re-grade sweep over the 122 published traits?

**T3 [Q] — `category` enum is a code invention.** `combat|learning|magic|
social|utility|supernatural|supertech|natural` traces to NO canon doc, and the
Forge schema doesn't even enforce it (free string). Bless it, replace it, or
drop it?

**T4 [Q] — maturity flags** (your 2026-08-04 ruling for MI/disability thorns
etc.) have no schema field yet. Add `maturityFlags: string[]` to traits?

**T5 [Q] — lien/binding metadata** (`bound`, `permanence`, `origin_godhead`,
`lien_amount`, `lien_recipient`) is named in Nectars_and_Thorns_System.md as
the intended post-beta schema — not built. Beta-relevant (death engine already
routes by pillar) or defer?

**T6 [Q] — blossom duration** is prose-only ("a scene/encounter/situation").
The blossom custody model has durationCycles at bestowal. Should *authored*
blossom blueprints carry a suggested duration field?

**T7 — note:** "Fault Line Quiet"'s trigger ("Willpower below 25% of max")
is exactly the percentage-threshold pattern your easy-to-track law rejects
("zero-thresholds not percentage thresholds"). Kai/you may want the trigger
reworked to a binary state at approval time. Not auto-fixed — judgment call.

---

## 8. GLOBAL VIEW DISPLAY (your note)

**G1 [FIXED] — The campaign/global detail panel is shared, so the new human-first
renderer already applies to global entries.** Stock badge ("STOCK · free ·
pre-graded") added to global cards; seed detail reworked per S5.

---

## 9. ULTRACODE BUG HUNT (overnight, 17 agents, adversarially verified)

12 confirmed findings (8 unique after dedup), **all fixed**:

**B1 [FIXED] — BigInt 500s on every KV-stamped mutation.** `karmicValue` is a
Prisma BigInt; confirm/update/publish/unpublish returned it raw and
`NextResponse.json` throws on BigInt — the write succeeded, the GM got a 500,
and the retry hit the unique constraint for another 500. All mutation paths now
serialize through one helper. This alone explains a class of "forge felt
broken" moments.

**B2 [FIXED] — the GM authoring PUT had zero validation.** `confirmForgeAuthoring`
persisted any type/data verbatim (bogus type → row permanently uneditable).
Now: type checked against FORGE_ITEM_TYPES, data through `validateForgeData`,
non-integer KV rounded (BigInt threw RangeError), duplicate-name P2002 → readable
error. The chain's own balanced draft is also schema-gated mid-run now.

**B3 [FIXED] — pulled stock lost its stamps.** `pullFromGlobalCatalog` dropped
karmicValue/evaluatedAt/authorUserId/royaltyRate — every pulled blueprint had
NULL KV and broken royalty attribution. Stamps now travel with the copy;
name-collision and concurrent-pull P2002s return readable errors.

**B4 [FIXED] — the ADMIN stock library was one sweep from Lady Death.**
`sweepUnusedBlueprints` had no isGlobal filter; 460+ never-instantiated stock
rows (published, useCount 0) qualified for decay flagging. Stock is free
forever — sweep now excludes global rows.

**B5 [FIXED] — chain fund charged with no refund.** The 30-KRMA chain fund was
debited before any stage ran; a stage failure ate the money, and the
Date.now() idempotency key made each retry a fresh charge. Stages now run in a
try/catch that refunds the GM's fund on failure (godhead-internal handoffs stay
where they landed).

**B6 [FIXED] — approve-request was two writes, no transaction.** A name
collision could approve the player request while the item create failed.
Now one transaction + readable duplicate error.

**B7 [FIXED] — GM edits silently deleted unknown data keys.** Zod strip-mode +
overwrite dropped `_proposalNote`/`betaDraft`/provenance on every edit.
Edits now merge validated fields over the stored row.

**B8 [FIXED] — assorted:** global catalog now filters drafts out and returns
isGlobal/status/createdAt (the stock badge needed it); pull route 400s on
missing id; publish batch-watch keys to the item's own campaign; Workshop
loading state covers campaign fetches; stale selection cleared on pull; FORGE
button disables until description present; spells authorable through the chain
(input enum was missing 'spell').

**Open low-severity notes:** ForgePanel.tsx confirmed dead code (M1/L10 —
morning call to delete); 16 published rows have NULL karmicValue (L14 — Kai
re-grade sweep candidate, morning call); seed skill grants price at 0 in the
formula (documented — Kai grades manually when present). Remaining global-specific gaps:
seed rows still use the old SeedDetail (gets the S5 rework); the list card shows
"N campaigns" but not WHO authored it or its status; stock entries should show a
"STOCK — free, pre-graded" badge so they read as anchors.
*Fix:* apply per-type renderers uniformly + stock badge + author line.
