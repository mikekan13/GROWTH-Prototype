# GROWTH Prototype — Claude Code Master Plan

> **Objective:** Ship a working, table‑ready prototype that reads the existing Google Sheets templates (your live design surface), mirrors them into a structured local model, and powers gameplay (dice, rules checks, GM dashboards, sync) without hallucinating rules. Sheets remain the UI you iterate on; the app does the logic.

---

## 0) TL;DR for Claude Code

1. **Authenticate** with user’s Google account (OAuth2, desktop/localhost flow). Scopes: Drive Read/Write (files.copy, permissions), Sheets Read/Write.
2. **Mirror**: Pull the campaign’s Sheets → parse into a **local SQLite** model via a **Sheet Contract** (named ranges + optional metadata sheet). Persist revisionId + etags for change detection.
3. **Ask/Confirm**: On unknown fields or rule conflicts, **halt & ask the user** with a short, structured prompt. Cache answers in a local `decisions.jsonl` for reproducibility.
4. **Run Game**: Provide a lightweight local web UI (Next.js) for GM/Players: dice, turn log, character view, NPC/resources, condition trackers. Source of truth remains Sheets + local cache.
5. **Sync**: Poll Drive Changes API + Spreadsheet revisions every N seconds. Two‑way writes off by default.
6. **Repository Lookup & Reconcile**: Read the **GROWTH\_Repository** (latest branch) and local rule sources as a *broad lookup*. If a Sheet field conflicts with repo text, **ask the user**, then (a) fix the app mapping/logic and (b) generate a repo patch/PR to clarify the rule.

---

## Merge Review (External Spec → What’s Better / What Changes)

**Adopt:**

* **Never block play**; ambiguous items go to a **DecisionQueue** while session continues.
* **GLOBAL decisions** reused across campaigns (with optional per-campaign override).
* **Known Named Ranges** (from your v0.5 sheet) treated as first‑class signals even **without prefixes**.
* **Obsidian‑friendly backlog** (`backlog.jsonl` + `backlog.md`) and a local `docs/clarifications.md` log.
* **Drive Changes API** polling + pull‑only sync; two‑way writes opt‑in.
* **OAuth Web App** redirect to Next.js route; tokens in keychain or encrypted file.

**Adjust:**

* Keep our `GROWTH__` prefix support as a **secondary** signal for new fields; precedence is: Known Named Ranges → `GROWTH__*` → heuristics → ask.
* Decisions become **GLOBAL by default**; add optional campaign‑scoped overrides.
* Repository flow: default to local `clarifications.md` + backlog; PR generator remains **optional** (toggle) to avoid repo churn mid‑session.
* Data model expanded with **SheetRef**, **Issue**, **SessionLog**.

**Reject / Defer:**

* Real‑time write‑back to sheets during MVP (kept off by default).

---

## Ultimate MVP Build Spec (Merged)

*This section supersedes prior sections where overlapping.*

### 0) Objective

Local GM web app that authenticates with Google, reads multi‑tab PC/NPC/GM sheets **as‑is**, mirrors into SQLite, provides Character View, Dice Roller, GM Dashboard, **pull‑only** sync, **DecisionQueue**, and Obsidian‑friendly backlog — without inventing rules.

### 1) Environment & Secrets

* **Stack:** Next.js (App Router, TS) + Tailwind + Prisma/SQLite + `googleapis`.
* **Commands:** `pnpm dev`, `pnpm prisma migrate dev`.
* **.env:**

```
GOOGLE_CLIENT_ID=__FILL_ME__
GOOGLE_CLIENT_SECRET=__FILL_ME__
SESSION_SECRET=__make_something_random__
GROWTH_REPO_PATH=C:\Users\Mikek\Desktop\GROWTH\GROWTH_Repository
OBSIDIAN_VAULT_PATH=./apps/GROWTH_Vault
```

* **OAuth:** Web application client. Redirect: `http://localhost:3000/api/auth/google/callback`.
* **Scopes:** Drive + Sheets. Tokens → OS keychain else `%APPDATA%/growth/creds.json`.

### 2) Local Folders (create on first run)

```
./apps/GROWTH_Vault/
  Exports/
  .growth/
    backlog.jsonl   // rolling machine‑readable
    backlog.md      // rolling human log
  docs/
    clarifications.md
```

### 3) Data Model (Prisma)

```prisma
model Campaign {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  sheets    SheetRef[]
  characters Character[]
  sessions  SessionLog[]
}

model SheetRef {
  id               String   @id @default(cuid())
  campaignId       String
  kind             SheetKind
  spreadsheetId    String
  title            String?
  lastModifiedTime DateTime?
  Campaign         Campaign @relation(fields: [campaignId], references: [id])
}

enum SheetKind { GM PC NPC DATA }

model Character {
  id            String   @id @default(cuid())
  campaignId    String
  name          String
  playerEmail   String?
  spreadsheetId String
  json          Json
  revId         String?
  updatedAt     DateTime @updatedAt
  Campaign      Campaign @relation(fields: [campaignId], references: [id])
}

model Decision {
  id        String   @id @default(cuid())
  scope     String   // "GLOBAL" | "CAMPAIGN:<id>"
  key       String   // e.g. map.header.Strength
  value     Json
  createdAt DateTime @default(now())
}

model Issue {
  id        String   @id @default(cuid())
  severity  String   // info | warn | error
  source    Json     // { spreadsheetId, sheetTitle, a1Range, namedRange? }
  sample    Json
  proposed  Json
  status    String   // open | queued | resolved
  createdAt DateTime @default(now())
}

model SessionLog {
  id         String   @id @default(cuid())
  campaignId String
  startedAt  DateTime @default(now())
  endedAt    DateTime?
  logMd      String
  Campaign   Campaign @relation(fields: [campaignId], references: [id])
}
```

### 4) Sheet Signals & Heuristics

**Signal precedence:** 1) **Known Named Ranges** (v0.5) → 2) `GROWTH__*` named ranges → 3) Heuristics → 4) Ask.

**Known Named Ranges (authoritative examples):**

* **Identity**: `CharacterName` → `identity.name`.
* **Attributes (9)**: Clout, Celerity, Constitution, Focus, Flow, Frequency, Willpower, Wisdom, Wit.

  * `current<Attr>` → `attributes.<attr>.current:number`
  * `<Attr>Level` → `attributes.<attr>.level:number`
  * `<Attr>Augment` → `attributes.<attr>.augment:number`
* **Vitals/Body parts**: uppercase named ranges (e.g., `HEAD`, `RIGHTUPPERLEG`, …) → `vitals.bodyParts.<NAME>` (no assumptions; store raw).
* **Nectars by category (column ranges)**: `CombatNectars`, `LearningNectars`, `MagicNectars`, `SocialNectars`, `UtilityNectars`, `SupernaturalNectars`, `SuperTechNectars`, `NegativeNectars`, `NaturalNectars` → `rulesData.nectars.<category>[]`.
* **Inventory**: `WEIGHT` → `inventory.weight:number`; table on Inventory sheet parsed by header row.
* **Dice Roller (FYI)**: `DiceRollInput`, `rollingSkill`, `Effort`, `rollMana`, `rollFrequency` are **read‑only**.
* **Known gotchas**: `PORTRAITURL` appears twice → first encounter enqueues a **dedupe** decision. `BEAUTY` resolves to `#REF!` → log **Issue(warn)**.

**Heuristics:** label‑value pairs (left label → right value), first non‑empty row as headers, global reuse of confirmed header mappings.

**Traceability:** every `character.json` field carries `sources[] = { spreadsheetId, sheetTitle, a1Range|namedRange }`.

### 5) Rules Authority & Repository

* **Authority order:** (1) Sheet (Known Ranges / `GROWTH__*`) + approved Decisions → (2) **Repository as broad lookup only**.
* **Never block play.** If confidence < 1.0, enqueue a **Clarification Card** (one‑screen: cell refs, sample, proposed path/type, top 3 repo excerpts with filename\:line).
* On approval: persist **GLOBAL decision**, update UI immediately, append to `docs/clarifications.md` + `.growth/backlog.*`. Optional: open repo PR (toggle).

### 6) Sync

* **Pull‑only** via Drive Changes API (timer + backoff). Two‑way writes remain disabled by default. Conflict modal if user attempts a push on stale rev.

### 7) UI Routes (App Router)

`/` (campaign picker) → `/campaign/[id]` (summary + attached sheets) →
`/campaign/[id]/characters` → `/campaign/[id]/character/[charId]` →
`/campaign/[id]/dice` → `/campaign/[id]/dashboard` →
`/campaign/[id]/queues/decisions` & `/queues/issues`.

### 8) Features (MVP)

* Characters list, read‑only Character View with **diff badges**.
* Dice roller: `xdy+z`, adv/dis, comparison expressions; session log.
* GM dashboard: PCs/NPCs glance, notes, turn order, local resource pips.
* Queues: **DecisionQueue** (approve/edit/reject), **IssueQueue** (#REF!, dupes, parse errors).
* Exports: session logs to `Exports/` (Markdown).

### 9) Acceptance Criteria

* Attach GM + PC/NPC sheets → parsed `character.json` with identity + **all 9 attributes** (current/level/augment).
* Vitals body parts ingested when present. Nectars arrays populated per category. Inventory weight mapped; table parsed.
* Edits/new fields never pause play; clarifications queued, then reused **globally** after approval.
* Drive polling refreshes UI on sheet edit. Broken ranges surface in IssueQueue & backlog.
* Approval writes `docs/clarifications.md` entry + JSONL/MD backlog; optional PR when toggle is on.

### 10) Task Plan (Order)

1. Scaffold app + Prisma schema → migrate.
2. Google OAuth + token store.
3. Drive/Sheets services; attach SheetRefs UI.
4. Parser: Known Named Ranges → `GROWTH__*` → heuristics; build `character.json` with traceability.
5. DecisionQueue + GLOBAL decisions; IssueQueue.
6. Drive Changes poller; invalidation on change.
7. GM UI, Dice, Dashboard.
8. Repo indexer + `clarifications.md` + backlog writers; PR toggle.
9. QA vs real sheets; meet Acceptance.

---

## 1) Success Criteria (Acceptance)

* **Pull**: Given a valid Google Sheet template, app parses named ranges and at least one table and shows a live character in the UI.
* **Confirm**: Unknown fields trigger a single, clear confirmation dialog; response is persisted and reused.
* **Dice**: xdy+z roller with advantage/disadvantage and a simple rule check runs entirely in‑app.
* **GM View**: List of PCs/NPCs, simple resource tallies, and a notes/turn log.
* **Copy & Share**: GM can duplicate the Character Sheet to a Player and grant access via Google Drive.
* **No Hallucination**: All rules logic uses either confirmed sheet semantics or user‑approved decisions; no hidden assumptions.

---

## 2) Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                      Local App (Next.js + Node)                   │
│  UI (React)  ───►  API Routes  ───►  Services (Sheets/Drive/DB)   │
│      ▲                         │                  │               │
│      │                         ▼                  ▼               │
│   GM/Player             Sheet Mapper          SQLite (Prisma)     │
│      │                         │                  │               │
│      └──────► Rules Gate (LLM ask/confirm) ◄─────┘               │
└───────────────────────────────────────────────────────────────────┘
                 │                                 ▲
                 ▼                                 │
        Google OAuth2 (user)               Decisions Cache (.jsonl)
                 │                                 ▲
                 ▼                                 │
    Google Sheets API + Drive API           Rulebook Index (optional)
```

**Stack**

* UI: **Next.js (App Router) + React** (local web on [http://localhost:3000](http://localhost:3000))
* Auth/Google: **googleapis** (OAuth2 installed-app flow)
* DB: **SQLite + Prisma** (portable, versioned migrations)
* Lang: **TypeScript** end‑to‑end
* Dice/Rules: local TypeScript library `@growth/core`

---

## 3) Google Setup (Claude Code: automate as much as possible)

1. Create a GCP project; enable **Drive API** and **Sheets API**.
2. OAuth2 client (Desktop). Redirect URI: `http://localhost:3000/api/auth/google/callback`.
3. Scopes (minimal viable):

   * `https://www.googleapis.com/auth/drive`
   * `https://www.googleapis.com/auth/spreadsheets`
4. Store tokens encrypted in `%APPDATA%/growth/creds.json` (Windows). Use OS keychain if available.

---

## 4) Campaign & Drive Conventions

**Drive Structure (recommended, not enforced):**

```
/GROWTH/
  Campaigns/
    <CampaignName>/
      Templates/
        CharacterSheet_vX
        GM_Control_vX
      Players/
      Exports/
```

* App stores a local `campaign.json` with `{ spreadsheetId, sheetMappingsVersion, playerEmails[] }`.

**Copy & Share flow:**

* `files.copy` CharacterSheet template → `Players/<name> - CharacterSheet`.
* `permissions.create` (role: writer) for player’s email.

---

## 5) The Sheet Contract (How parsing works without breaking your flow)

**Goal:** You keep editing Sheets freely. We add just enough structure so the app can parse reliably.

### 5.1 Named Ranges (primary)

* Prefix: `GROWTH__` (double underscore).
* Examples:

  * `GROWTH__character_name` → single cell
  * `GROWTH__attr_body` → single cell number
  * `GROWTH__inventory_table` → rectangular range with header row
* App pulls all named ranges; anything without the prefix is ignored.

### 5.2 Header Annotations (optional)

If a named range is a table, the **first row is headers**. Each header may include a type hint:

* `name:text`, `qty:int`, `weight:number`, `tag:enum(Consumable|Weapon|Armor)`
* If no type hint is present, default `text`.

### 5.3 Metadata Sheet (optional, advanced)

A hidden sheet named `_contract` can specify extras in YAML‑like blocks:

```
entity: character
version: 0.1
id: GROWTH__character_id
fields:
  - name: health.max
    source: GROWTH__health_max
    type: int
  - table: inventory
    source: GROWTH__inventory_table
    path: inventory.items[]
    key: name
```

Use only if you need overrides beyond named ranges.

### 5.4 Inference + Confirmation

* If the app finds **unprefixed** but obvious headers (e.g., `Strength`, `Dexterity`) it will **ask**: *“Map `Strength` to `attributes.strength:int`?”* Your **Yes/No + edit** is cached.

---

## 6) Local Data Model (SQLite via Prisma)

```prisma
model Campaign {
  id           String  @id @default(cuid())
  name         String
  spreadsheetId String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  decisions    Decision[]
}

model Character {
  id          String  @id @default(cuid())
  campaignId  String
  name        String
  playerEmail String?
  json        Json     // mirror of parsed sheet
  revId       String?  // Drive revision to detect drifts
  updatedAt   DateTime @updatedAt
  Campaign    Campaign @relation(fields: [campaignId], references: [id])
}

model Decision {
  id         String  @id @default(cuid())
  campaignId String
  key        String  // e.g., "map.header.Strength"
  value      Json    // user-approved mapping/semantics
  createdAt  DateTime @default(now())
  Campaign   Campaign @relation(fields: [campaignId], references: [id])
}
```

**Character JSON minimal shape (example)**

```json
{
  "identity": {"name": "Al’thrick", "player": "michael@…"},
  "attributes": {"body": 3, "soul": 4, "spirit": 2},
  "resources": {"health": {"max": 10, "current": 8}},
  "inventory": {"items": [{"name":"Dagger","qty":1}]}
}
```

---

## 7) Sync Strategy

* **Pull loop** (default):

  * Track Drive `revisionId` for the spreadsheet and per‑sheet `properties.sheetId` + `properties.title`.
  * If changed, refresh named ranges + changed ranges only.
* **Write‑back** (feature‑flagged): Only when user explicitly clicks “Push to Sheet”.
* **Conflict policy**: App warns if sheet changed since last pull; require user choice.

---

## 8) Rules Authority Gate (No Hallucinations)

**Contract:**

1. Use only the following as authority in this order:

   * (a) Named ranges with `GROWTH__` prefix and `_contract` sheet,
   * (b) Cached Decisions approved by the user,
   * (c) **Sheet-as-Truth** for play if a conflict exists (prototype favors the live sheet),
   * (d) **GROWTH\_Repository + local rule texts** as a *broad lookup/reference* (never silently authoritative).
2. If a rule is needed but ambiguous or conflicts with repo text, **ask one clear question**. Include the sheet cell/range, the conflicting repo excerpt (with file+line), and a proposed mapping.
3. On user confirmation, **persist** the decision and immediately apply it to the local model and UI logic.
4. **Reconciliation**: auto‑draft a repo change (markdown edit or clarification note) and open a PR for the user to approve. Link the PR to the decision ID and sheet range in the commit body.

**Prompt Template (for Claude Code to ask):**

```
I detected a potential mismatch.
Sheet: {{sheetTitle}}!{{a1Range}} → "{{header}}" sample: "{{sample}}"
Repo excerpt ({{file}}:{{lines}}):
"""
{{repo_excerpt}}
"""
Proposed mapping: {{json_path}} : {{type}}
Use this mapping and create a repo clarification PR? (Yes / No → provide correction)
```

---

## 9) Minimal Gameplay Features (MVP)

* **Character view**: Read‑only mirror + colored hints (diffs vs. sheet).
* **Dice roller**: `xdy+z`, advantage/disadvantage, history log.
* **GM dashboard**: list PCs, add simple NPCs, track scene notes, turn order.
* **Resource pips**: quick adjustors (HP/Stress/etc.) in‑app only.
* **Export**: Save session log to Drive `Exports/` as Markdown.

*Nice‑to‑have (Phase 2):*

* Conditions/effects with timers
* Simple conflict/resolution macros
* Two‑way writes for selected named ranges

---

## 10) Module Breakdown (Claude Code tasks)

1. **Project Bootstrap** – Next.js, Prisma (SQLite), Tailwind.
2. **OAuth Service** – Google installed‑app flow; token store.
3. **Drive Picker** – Select Spreadsheet by URL/ID; persist campaign.
4. **Sheet Mapper** – Named ranges, table parser, type hints.
5. **Decisions Cache** – Prompt/confirm unknowns; reuse.
6. **Sync Engine** – Revision polling; diff refresh.
7. **GM UI** – PCs/NPCs, notes, turn log.
8. **Dice Library** – xdy+z with adv/dis; log.
9. **Copy & Share** – Duplicate template; grant permission.
10. **Export Logs** – Markdown to Drive/Exports.
11. **Repository Indexer** – Read **GROWTH\_Repository** and local rule files (txt/md/pdf) into a searchable index (filenames + headings + anchors). No embeddings required for MVP; simple full‑text with context windows.
12. **Reconciliation Service** – Detect mismatches between parsed sheet semantics and repo text; build "Clarification Card" and route to prompt.
13. **PR Generator** – Create markdown patch/PR (branch naming: `clarify/<slug>`), include links to sheet ranges and decision IDs in commit body.

---

## 11) Developer Commands

* `pnpm dev` – run Next.js
* `pnpm prisma migrate dev` – DB migrations
* `.env` keys: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`

---

## 12) Risks & Mitigations

* **Service account limits** → Use user OAuth (installed app flow).
* **Loose headers** → Named range prefix + decisions cache.
* **Rule drift** → All rule logic gated behind Sheet/Decisions; no silent defaults.
* **Write conflicts** → Pull‑first policy; push disabled by default.

---

## 13) User‑Facing Guidance (for Sheet authors)

* Add **named ranges** for any cell/range you want the app to read. Prefix with `GROWTH__`.
* For tables, put **types in headers** where helpful: `field:int`, `tag:enum(A|B)`.
* (Optional) Use `_contract` sheet for advanced mappings.

---

## 14) Milestones (deliver in order)

1. **Auth + Drive Picker + DB** → can connect; campaign saved.
2. **Named Range Parser** → character JSON appears in UI.
3. **Decisions Flow** → confirm unknowns; cache works.
4. **Dice + GM Dashboard** → basic play loop possible.
5. **Copy & Share + Export Logs** → table‑ready quality.
6. **Repo Lookup + Reconciliation PRs** → mismatches produce a single prompt and an auto‑drafted PR.

---

## 15) QA Checklist

* Pull from a sheet with only single‑cell ranges → OK.
* Pull from a sheet with at least one table range → OK.
* Rename a header; app asks once; remembers → OK.
* Copy template to new player and grant access → OK.
* Roll dice; log persists across reloads → OK.
* Introduce a deliberate repo mismatch → app shows the conflicting excerpt and proposes a mapping → user approves → PR is created with clear commit message and links → OK.

---

## 16) Repository Integration & Reconciliation Loop

**Sources:**

* **GROWTH\_Repository** (latest branch) – canonical but incomplete.
* Local rule texts bundled with the app for reference:

  * `RB Summary.txt`, `Lady Death.txt`, `GROWTHLLMRuleUnderstanding.txt`,
  * `GROWTH MATERIAL AND ITEM LLM PRIMER.txt`, `growthdesigndoc.txt`,
  * `GROWTH RULEBOOK v0.4.4.pdf`, `GROWTH Style Guide.pdf` (PDFs parsed to text for search only).

**Indexer (MVP):**

* Full‑text scan with per‑file anchors (e.g., `file.md#Section Title`).
* Return 3–5 highest‑relevance excerpts with ±6 lines of context.
* Provide **exact filename + line span** in prompts/UI, never summary only.

**Reconciliation Workflow:**

1. **Detect**: New/changed Sheet field or mapping lacks explicit contract or conflicts with best‑match repo excerpt.
2. **Clarify**: Present a one‑screen "Clarification Card" (sheet cell, sample value, proposed JSON path/type, top repo excerpt).
3. **Decide**: On approval, immediately update the local Decisions cache and mapping.
4. **Patch**: Generate a repo markdown edit (add/clarify the rule) and open a PR in a new branch `clarify/<short-slug>`.
5. **Traceability**: Include sheet range(s), decision ID, and app version in the PR body for audit.

**Policy:**

* During prototyping, **Sheet = immediate truth for play**; repo is updated to match after approval.
* No silent changes. All divergences produce a prompt and a patch.

**Developer Notes:**

* Keep the indexer simple; embeddings optional later.
* PDF parsing via robust text extractor; for screenshots/figures, add a TODO note into the PR rather than hallucinating.
