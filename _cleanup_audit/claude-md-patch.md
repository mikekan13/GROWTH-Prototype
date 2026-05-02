# CLAUDE.md Cleanup Patch — Proposed Edits

**Apply with 6 Edit calls** (5 contradictions; #2 needs 2 Edits because "Mike (Godhead)" appears in two places).

---

## ⚠ One open question for Mike before applying

**Soul's blue hex code.** MEMORY.md (Pillar Colors corrected 2026-03-10) says `Soul = Blue` but does NOT give a hex. VISUAL-DESIGN-SPEC.md is itself stale on the swap (still labels `--pillar-spirit = #3EB89A teal` and `--pillar-soul = #7050A8 purple` — pre-swap labeling). So we cannot pull the canonical post-swap Soul-blue hex from anywhere on disk.

**Options:**
- (a) Use `#142844` (Chokmah deep navy from VDS) — too dark for a pillar accent.
- (b) Use `#7A9AB8` (Chesed steel blue from VDS) — soft, readable, sits next to Body red and Spirit purple cleanly.
- (c) Mike picks a hex now and we lock it into both CLAUDE.md and VISUAL-DESIGN-SPEC.md in the same pass.

**Recommendation:** (c). The patch below uses the placeholder `#XXXXXX (TBD — Mike to confirm)` so applying without a decision is obvious. Suggest deferring fix #1's Soul line until Mike calls a hex.

---

## Fix 1 — Pillar hex codes in "Visual Identity"

**Section:** `## Visual Identity (from Core Rulebook v0.4.5)` — lines 121-122

```diff
-- Pillar colors: Body=#E8585A (coral), Spirit=#3EB89A (teal), Soul=#7050A8 (purple)
-- Terminal=#2DB8A0 (teal), KRMA=#D0A030 (gold)
+- Pillar colors (post Jan-2026 Soul/Spirit swap):
+  - Body = #E8585A (coral/red)
+  - Spirit = #7050A8 (purple) — Mercury, Willpower/Wisdom/Wit
+  - Soul = #XXXXXX (blue — TBD, Mike to confirm hex) — Sulfur, Flow/Frequency/Focus
+- Terminal = #2DB8A0 (teal), KRMA = #D0A030 (gold)
+- NOTE: VISUAL-DESIGN-SPEC.md still uses pre-swap labels for `--pillar-spirit` (#3EB89A teal) and `--pillar-soul` (#7050A8 purple). The CSS tokens haven't been renamed yet — when reading them, mentally remap. Token rename is a separate cleanup task.
```

---

## Fix 2a — "Mike (the Godhead)" in opening blurb

**Section:** `## What This Is` — line 4

```diff
-GRO.WTH is a digital-first TTRPG platform being rebuilt as a clean Next.js app. The game has been in design for 9+ years. Mike (the Godhead) is the sole developer, using AI exclusively for all coding. Session continuity is critical.
+GRO.WTH is a digital-first TTRPG platform being rebuilt as a clean Next.js app. The game has been in design for 9+ years. Mike (ADMIN — top human authority, outside the game) is the sole developer, using AI exclusively for all coding. Session continuity is critical. NOTE: GODHEAD is the in-system AI agent role; do NOT conflate with Mike.
```

## Fix 2b — Authority Hierarchy

**Section:** `## Authority Hierarchy` — line 8

```diff
-1. **Mike (Godhead)** — Ultimate authority. His verbal corrections override ALL documents.
+1. **Mike (ADMIN)** — Ultimate authority. His verbal corrections override ALL documents. (ADMIN is the top human role; GODHEAD is a separate in-system AI agent role — do not conflate.)
```

## Fix 2c — "Three Interfaces" line uses "godhead/admin"

**Section:** `## Critical Design Facts` — line 23

```diff
-- **Three Interfaces**: Trailblazer Portal (player), Watcher Console (GM), Terminal Admin (godhead/admin)
+- **Three Interfaces**: Trailblazer Portal (player), Watcher Console (GM), Terminal Admin (ADMIN-only — Mike). GODHEAD is the AI agent role with KRMA-bounded oversight, NOT a UI surface.
```

---

## Fix 3 — "No MCP servers" is wrong

**Section:** `## Critical Design Facts` — line 25

```diff
-- **No MCP servers** — The old MCP integration is dead weight. Don't use it.
+- **No legacy Beta MCP integration** — but Playwright, SQLite, and context-mode MCP servers ARE installed for Claude Code (configured in `~/.claude.json` under `projects["C:/Projects/GRO.WTH"].mcpServers`). Use them — see memory `mcp-servers-setup`.
```

---

## Fix 4 — Active codebase pointer

**Section:** `## Project Structure` — insert after the opening line `## Project Structure` and before the ` ``` ` fence (i.e., before line 61's code block)

```diff
 ## Project Structure
+
+**Active codebase = `app/`** (this is what production ships). A fork at `C:\Projects\GROWTH Character Creator\` (dev server port 3001) exists for in-progress character-creation work and will be merged back into `app/` after current cleanup. The legacy `standalone/` directory is dead — being removed in this cleanup pass. Always verify which directory the running dev server is serving from before editing files.
+
 ```
```

(Note the diff: we are adding lines BETWEEN the heading and the existing code-fence. The trailing ` ``` ` line in the diff is the existing fence, unchanged.)

---

## Fix 5 — Soul/Spirit internal consistency check

Fix #1 resolves the only remaining pre-swap labeling I found in CLAUDE.md (the "Visual Identity" hex list). The `Critical Design Facts` "Soul/Spirit SWAPPED" bullet (line 21) is already correct and stays. No additional edit needed for #5 once #1 is applied.

---

## Stale items I checked and confirmed already dead (no edit needed)

| Line | Item | Status |
|---|---|---|
| 24 | `Google Sheets is DEAD — Killed entirely. No googleapis...` | Correctly marked dead. ✓ |
| 26 | `No OAuth/Google Auth — Using bcrypt + session tokens` | Correct, current. ✓ |
| 18 | `GRO.WTH Beta/ — Legacy codebase. Keep src/types/growth.ts and visual DNA only` | Correct. ✓ |
| 10 | `...Aug 2025 Thread system redesign` | **Soft stale** — MEMORY.md says the Thread model was discarded brainstorming. The phrasing implies threads are still a thing in the redesign. Suggest a future micro-edit: change to "...does not reflect the Jan 2026 Soul/Spirit swap. (The Aug 2025 Thread system was later discarded — disregard any thread references in repo docs.)" — NOT in scope of the 5 contradictions, flag for next pass. |
| n/a | Values & Addictions | Not mentioned in CLAUDE.md at all. ✓ Already cut from code per MEMORY. |
| n/a | Health Level System | Not mentioned in CLAUDE.md. ✓ (file deleted from repo per `git status`) |

---

## Application order (suggested)

1. Apply Fix 2a, 2b, 2c, 3, 4 immediately — no Mike input needed.
2. Hold Fix 1 until Mike calls the Soul-blue hex (or accepts placeholder language).
3. Optionally do the soft Thread cleanup at the same time as Fix 1.
