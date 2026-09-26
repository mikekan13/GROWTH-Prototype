# GROWTH Lexicon — Design Proposal (2026-08-26, DRAFT for Mike)

**Status:** PROPOSAL — nothing built. Source ruling: r-2026-08-24-06 ("ambiguity
itself is the defect": every mechanical scope gets exactly ONE canonical phrasing;
authors pick a phrase, readers never guess; long-game = machine-readable phrases the
modifier-gather applies without per-roll LLM interpretation). Growable-by-Godheads
aspect discussed 2026-08-23, not designed — addressed as open question below.

## 1. What the Lexicon is

A closed set of **phrase templates** for rule text. Each template names exactly one
mechanical scope and maps 1:1 to structured schema fields — so prose and structure
can never disagree, and the structure alone can drive the engine.

The key observation: **the structured `effects[]` schema already IS the semantic
model.** The Lexicon is just the canonical English for each schema shape. That means
v0 costs nothing to adopt — it's a writing standard, not a new system.

## 2. Seed lexicon v0 (derived from existing schema + rulings)

| Phrase template | Schema mapping |
|---|---|
| "raw {Attribute} checks" | modifier `{governorAttribute, scope:'raw'}` |
| "all rolls governed by {Attribute}" | modifier `{governorAttribute, scope:'governed'}` |
| "all {Pillar}-pillar checks" | modifier `{pillar}` (breadth ×2) |
| "all checks" | modifier `{allChecks:true}` (breadth ×3) |
| "{skill family} checks" | modifier `{skillNamePattern}` or condition text |
| "for {N} rounds (encounter)" | `duration {N,'rounds'}` — 1 round = 6 s |
| "for {N} hours / days / cycles" | `duration {N, unit}` |
| "while {state}" / "until {event}" | persistent `condition` (lazy, adjudicated) |
| "when {event}, {check?}, then {outcome}" | triggered `{trigger, check, appliesCondition/spawnsBlossom}` |
| "expires after {time}" / "expires when {trigger}" | blossom `expiry` |
| "once per encounter / session / in-game day" | frequency qualifier in `condition`/`trigger` (table-trackable units only) |

Banned vocabulary (already ruled): *scene*, *minutes* (as tracked durations),
bare "−2 to X rolls" without a scope word.

## 3. Where it lives

- **v0 (now):** one Repository file — `07_REFERENCE_TABLES/GROWTH_Lexicon.md`,
  #validated, the table above + examples. JEWL's authoring law points at it:
  "compose rule text only from Lexicon phrases."
- **v1 (when Godheads can propose):** DB-backed `LexiconEntry` rows
  (phrase-template, schema-mapping, status: canon|proposed, author) so entries are
  queryable by the review layer and proposable in-system.

## 4. Enforcement ladder (each step optional, in order)

1. **Authoring law** (prompt text) — free, immediate.
2. **Review-layer lint** — regex per template over `mechanicalEffect`/labels; flags
   off-lexicon phrasing as a draft defect (like the scene-sweep tonight, automated).
3. **Engine bypass** — modifier-gather consumes `effects[]` directly; prose becomes
   display-only. At this point the Lexicon is UX, and hallucinated prose can't
   touch mechanics at all. (This is where the one-effect-one-entry law was already
   heading.)

## 5. Open questions for Mike

1. **Who ratifies a new Lexicon entry?** Options: ADMIN-only; Godhead vote
   (consistent with r-2026-07-23-10 balance-council); or ADMIN-confirm on Godhead
   proposal. Recommendation: Godhead vote + ADMIN override, same as tunables.
2. **Scope of constraint:** rule text and modifier labels only — descriptions stay
   free (poetry lives there, per the name-scope ruling's spirit). Confirm?
3. **Frequency qualifiers** ("once per session"): is *session* a canonical GROWTH
   time unit alongside rounds/hours/days/cycles? Stock uses it heavily; it is
   table-trackable by definition. Recommend: yes, admit it explicitly.
4. Does the Lexicon file start #validated (it only restates ruled semantics) or
   #needs-review?
