Task: Set up MCP servers for ChatGPT Developer Mode (GROWTH + Campaign)

Goal
Create two local MCP servers (stdio) that ChatGPT Developer Mode can connect to:

growth-rules-mcp → writes to the GROWTH repo (rules/lore source of truth).

campaign-mcp → writes to a per-campaign repo/db (sessions, events, NPCs, items).

No changes to existing repo structures; all paths are provided via env vars or per-call inputs.

Requirements
A. Tech & I/O

Use Node 20+ (TypeScript preferred).

Transport: stdio (simple, local).

Config via .env:

GROWTH_REPO=/abs/path/to/growth

CAMPAIGN_REPO=/abs/path/to/campaign

Don’t create new top-level folders unless explicitly passed in inputs. Default behavior is path-agnostic: write only where told.

B. Tools (MCP procedures)
growth-rules-mcp

rules.open_issue(record)

Input (JSON):

{
  "title": "string",
  "location": "string",
  "observed": "string",
  "expected": "string",
  "severity": "note|low|med|high|blocking",
  "tags": ["string"],
  "source": "voice|hotkey|oracle|manual"
}


Action: Append a single-line JSON record with ts added to <GROWTH_REPO>/<ISSUES_FILE>.

Use default ISSUES_FILE = corrections/issues.jsonl unless the caller passes an absolute/relative path override in record.__path.

Output: {"ok": true, "path": "<relative path>", "line": <int>}

rules.propose_change({ target, title, rationale, before, after, related_issues })

Action: Write a Markdown proposal with YAML frontmatter (status: proposed) and sections Before/After/Diff to a path (default proposals/YYYY-MM-DD-<slug>.md, override allowed via __path).

Output: {"ok": true, "proposalPath": "<relative path>"}

rules.apply_patch({ proposalPath, mode, commitMessage })

Action: Read the proposal, extract target (e.g., rules/combat.md#anchor) and the After text.

If mode==="staging", write the patched section to staging/<target-with-anchor-replaced>.md (no direct canonical edits).

If mode==="direct", replace the anchor section inside the actual file (use simple anchor-aware heuristic; do not reformat surrounding content).

Output: {"ok": true, "changedFiles": ["<target>"]}

campaign-mcp

campaign.events.append(record)

Input:

{
  "ts": "ISO8601",
  "type": "scene|roll|ruling|lore|npc|item|system|meta",
  "actors": ["string"],
  "summary": "string",
  "source": "companion|oracle|player|system",
  "data": { "raw": "string", "refs": ["string"] },
  "__path": "optional override to events file"
}


Action: Append as JSONL to default events.jsonl at repo root, or to __path if provided.

Output: {"ok": true, "path": "<relative path>", "line": <int>}

campaign.npc.upsert(card)

Input:

{
  "id": "string",
  "name": "string",
  "firstSeen": "string",
  "summary": "string",
  "tags": ["string"],
  "stats": { },
  "notes": "string",
  "__dir": "optional dir override (default npcs/)"
}


Action: Write/merge JSON to <__dir or "npcs/">/<slug(id||name)>.json.

Output: {"ok": true, "path": "npcs/<slug>.json", "created": true|false}

(Optional for later)
6. sheets.read_character_sheet({ path|sheetId })

Stub only: return a normalized Character JSON (v0) from a local XLSX path. Do not assume any column moves; mapping lives in code. We’ll flesh mappings after we align on the workbook.

Project Structure
/mcp/
  /growth-rules-mcp/
    src/index.ts
    src/tools/rulesOpenIssue.ts
    src/tools/rulesProposeChange.ts
    src/tools/rulesApplyPatch.ts
    package.json
    tsconfig.json
    .env.example
  /campaign-mcp/
    src/index.ts
    src/tools/eventsAppend.ts
    src/tools/npcUpsert.ts
    package.json
    tsconfig.json
    .env.example
/shared/
  src/fsUtils.ts          # safe append, mkdirp, atomic writes
  src/anchors.ts          # anchor-aware replace helpers
  src/slug.ts
package.json              # workspace root with npm scripts

Implementation Notes

MCP stdio shim: Simple JSON-per-line protocol is fine; later we can swap to the official SDK.

Atomic writes: Use fs.promises.writeFile to a temp file then rename.

JSONL append: always add ts (ISO string) if missing; return computed line number.

Anchor-aware replace: split file on heading anchors; only replace the matching section. If anchor not found, write to staging/ instead and return a warning field: {"ok": true, "changedFiles": [], "warning": "anchor not found; wrote to staging"}.

Path overrides: Respect __path or __dir if provided; otherwise use conservative defaults.

Commands & Scripts

Root package.json (workspaces):

{
  "name": "growth-mcp",
  "private": true,
  "workspaces": ["mcp/growth-rules-mcp", "mcp/campaign-mcp"]
}


Each server package.json:

{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {},
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.5.0",
    "@types/node": "^20.11.0"
  }
}


.env.example (both):

GROWTH_REPO=/abs/path/to/growth
CAMPAIGN_REPO=/abs/path/to/campaign

ChatGPT Developer Mode: Connector Registration (manual step for Michael)

Add connector growth-rules-mcp: command = npm --prefix mcp/growth-rules-mcp run dev

Add connector campaign-mcp: command = npm --prefix mcp/campaign-mcp run dev

Confirm both toolsets appear in ChatGPT tools list.

Acceptance Tests (run from ChatGPT after connecting)

Open Issue

Call rules.open_issue with:
{
  "title":"Ambiguity: improvised action cost",
  "location":"rules/combat.md#improv",
  "observed":"Treated as free action.",
  "expected":"Costs 1 Nectar.",
  "severity":"med",
  "tags":["combat","improv"],
  "source":"oracle"
}
Expect: ok:true + path 'corrections/issues.jsonl' + line >= 1


Propose Change

Call rules.propose_change with target "rules/combat.md#improv",
minimal before/after strings.
Expect: ok:true + proposalPath in proposals/


Apply Patch (staging)

Call rules.apply_patch with the proposalPath and mode:"staging".
Expect: ok:true + changedFiles includes the target (or warning if anchor missing).


Append Event

Call campaign.events.append with type:"scene", a summary, refs.
Expect: ok:true + path 'events.jsonl' + line >= 1


Upsert NPC

Call campaign.npc.upsert with id or name.
Expect: ok:true + npcs/<slug>.json created or updated.

Stretch (only if time permits)

Add sheets.read_character_sheet that reads a local .xlsx path and returns normalized JSON (v0). Mapping will be configured later; for now, read tab names and surface a few key cells without altering workbook.

Deliverables

Source code for both servers (TypeScript).

Build scripts and .env.example.

Minimal README with how to run and how to register in ChatGPT Developer Mode.

Verified acceptance tests above executed successfully in a local ChatGPT Developer Mode session.

End of brief.
Claude: please implement exactly as specified. If an assumption is required, choose the most conservative, path-agnostic option and note it in the README.