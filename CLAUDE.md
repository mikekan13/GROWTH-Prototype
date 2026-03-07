# GRO.WTH Project — Claude Code Instructions

## What This Is
GRO.WTH is a digital-first TTRPG platform being rebuilt as a clean Next.js app. The game has been in design for 9+ years. Mike (the Godhead) is the sole developer, using AI exclusively for all coding. Session continuity is critical.

## Authority Hierarchy
**For game rules/mechanics:**
1. **Mike (Godhead)** — Ultimate authority. His verbal corrections override ALL documents.
2. **GROWTH-DESIGN-TRUTH.md** — Canonical design reference (in this folder). When in doubt, check here.
3. **GRO.WTH Repository/** — 70+ markdown files of game rules. NOTE: These do NOT reflect the Jan 2026 Soul/Spirit label swap or the Aug 2025 Thread system redesign.

**For visual identity/aesthetics/tone:**
1. **Core Rulebook v0.4.5.pdf** — The "Bible." Defines how the game should LOOK and FEEL.
2. **VISUAL-DESIGN-SPEC.md** — Extracted design tokens, color system, typography, visual modes.
3. **NOTE:** The rulebook is intentionally chaotic with glitches. Do NOT use it as a rules authority. Its mechanics are messy/incomplete by design. Use it for aesthetics and tone only.

**Reference only (do not build from):**
- **GRO.WTH Beta/** — Legacy codebase. Keep `src/types/growth.ts` and visual DNA only.

## Critical Design Facts (Do Not Get Wrong)
- **Soul/Spirit SWAPPED (Jan 2026)**: What the repository calls "Soul" (Flow/Frequency/Focus) is actually **Spirit** (Sulfur/Blue). What it calls "Spirit" (Willpower/Wisdom/Wit) is actually **Soul** (Mercury/Purple). This aligns with Orthodox anthropology (soma/psyche/pneuma).
- **Pillar Colors**: Body=Red, Spirit=Blue, Soul=Purple, Terminal=Teal, KRMA=Gold
- **Three Interfaces**: Trailblazer Portal (player), Watcher Console (GM), Terminal Admin (godhead/admin)
- **Google Sheets is DEAD** — Killed entirely. No googleapis, no Sheets integration, no fallback.
- **No MCP servers** — The old MCP integration is dead weight. Don't use it.
- **No OAuth/Google Auth** — Using bcrypt + session tokens. Simple auth that works.
- **Relations Canvas IS the vision** — Spatial web of floating/dockable panels for the GM interface.
- **Only Watchers create campaigns** — Trailblazers are invited. Subscription model: 5 seats per Watcher.
- **No placeholder characters** — Players join campaigns, collaborate on backstory, GM builds mechanics from backstory.
- **Structured backstory prompts** — NEVER a single open field. Default prompts + GM custom prompts per campaign.
- **AI portraits** — ComfyUI + FLUX.2 Dev (quantized) + PuLID for identity consistency. See PORTRAIT-PIPELINE.md.
- **WATCHER access via QR codes** — Physical rulebook includes access code. Admin generates codes via API or script. Users redeem at registration or after.
- **Manual-first development** — Manual systems → AI-assisted → full AI co-pilot. Don't build AI features prematurely.
- **KRMA limits GM power** — GM's KRMA pool constrains character creation power. Prevents inflation across the network.

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4 + Zod 4 (validation)
- Prisma 7 + SQLite (beta) -> PostgreSQL (production)
- bcrypt auth with session tokens
- No external service dependencies

## Architecture (Layered, Next.js-Adapted)
```
Interface Layer    →  app/ (pages, API routes — thin wrappers only)
Service Layer      →  services/ (business logic, Zod schemas, typed errors)
Infrastructure     →  lib/ (auth, db, permissions, errors, api utils, defaults)
AI Systems         →  ai/ (portrait pipeline, future Oracle — isolated from domain)
Data Layer         →  Prisma 7 + SQLite
Types              →  types/growth.ts (GrowthCharacter, game mechanics)
```

**Rules:**
- API routes are thin wrappers: parse input → Zod validate → call service → catch errors → return HTTP response
- Business logic lives in `services/`, never in API routes or components
- Services throw typed errors (`ValidationError`, `NotFoundError`, etc.) — caught by `errorResponse()` in routes
- Permission checks use reusable helpers from `lib/permissions.ts`
- Zod 4 quirks: use `error.issues` (not `.errors`), `z.record()` requires 2 args

## Project Structure
```
C:\Projects\GRO.WTH\
  CLAUDE.md               <- You are here
  GROWTH-DESIGN-TRUTH.md  <- Canonical game design document
  VISUAL-DESIGN-SPEC.md   <- Visual identity (colors, fonts, modes, CSS)
  PORTRAIT-PIPELINE.md    <- AI portrait pipeline research + design
  PLAN.md                 <- Build plan with phases
  Core Rulebook v0.4.5.pdf <- The "Bible" (369 pages, visual+rules reference)
  GRO.WTH Repository/    <- Game rules reference (70+ md files, some outdated)
  GRO.WTH Beta/          <- Legacy codebase (reference only)
  docs/                   <- System documentation (kept in sync with code)
    system_map.md         <- Architecture overview, data flow, key systems
    module_registry.md    <- All services, components, API routes with purposes
    database_schema.md    <- Models, fields, JSON schemas
    ai_systems.md         <- AI system designs and status
  app/                    <- The app (Next.js 16)
    src/
      app/                <- Pages + API routes (interface layer)
      components/         <- React components
      services/           <- Business logic (campaign, character, backstory, access-code)
      lib/                <- Infrastructure (auth, db, permissions, errors, api, defaults)
      ai/                 <- AI systems (portraits/, prompts/ — placeholder)
      types/              <- TypeScript types (growth.ts)
    prisma/               <- Schema + migrations
    scripts/              <- CLI utilities
```

## How to Work

### Before Starting Work
1. **Read `docs/system_map.md`** to understand current architecture and key systems
2. **Read PLAN.md** to understand what phase we're in and what to build next
3. **Check `docs/module_registry.md`** if you need to find where code lives
4. **Read GROWTH-DESIGN-TRUTH.md** if working on game mechanics

### During Work
5. **Ask Mike when uncertain** — he has the complete vision in his head. Use [QUESTION] markers for things that need his input.
6. **Don't invent game rules.** If it's not in GROWTH-DESIGN-TRUTH.md or the repository, ask.
7. **Don't add features Mike didn't ask for.** No "just in case" abstractions.
8. **Small, completable units of work.** Each session should produce something testable.
9. **Follow the architecture** — services for logic, thin API routes, typed errors, Zod validation.

### After Completing Work
10. **Update PLAN.md** with what was completed and what's next.
11. **Update `docs/` files** if you added/changed services, routes, models, or AI systems.
12. **Commit all code changes** to git.
13. **Note any unresolved [QUESTION] items** for Mike.

## Visual Identity (from Core Rulebook v0.4.5)
- **NOT dark-theme-only.** See VISUAL-DESIGN-SPEC.md for full details.
- Primary surface: Powder blue (#CBD9E8) for rules/calm state
- Black void for combat/consequence sections
- Amber (#D07818) for Terminal speak sections
- Chaotic cosmic-glitch for consciousness breaks
- Pillar colors: Body=#E8585A (coral), Spirit=#3EB89A (teal), Soul=#7050A8 (purple)
- Terminal=#2DB8A0 (teal), KRMA=#D0A030 (gold)
- Fonts: Consolas (Terminal/primary), Bebas Neue (headers), Inknut Antiqua (soul/creator), Roboto (sub-terminal), Comfortaa (mechanics/body)
- Black highlight bars behind text = signature UI pattern
- Centered, meditative layout with generous whitespace
- Left ornamental border with alchemical sigils (subtle)
- Glitch effects for reality layer transitions

## Key Design Principles
- "Discovered, not created" — Don't over-define. Patterns emerge.
- Guided Freedom — Use KRMA costs as soft guidance, not hard caps.
- The game is a parable — Orthodox themes embedded, not overt.
- "People who play GROWTH own GROWTH" — Anti-capitalist creative ownership model.

## Source Card Catalog (Deep Research)
If you need to research Mike's original design conversations:
- 1,293 source cards in WSL: `~/.openclaw/workspace-book/memory/local/book/catalog/`
- 486+ cards relate to GROWTH
- Access via: `wsl.exe -d Ubuntu-24.04 -- bash -c "cat path/to/SC-XXXX.md"`
- Key cards: SC-0003 (philosophy), SC-0010 (effort), SC-0357 (GROWTH acronym), SC-0360 (codex), SC-0405 (Lucidity), SC-0381 (Orthodox), SC-0485 (GRO.vines IRL), SC-1091 (Lady Death = Mike's stake)

## Code Standards Quick Reference
- **New API route?** → Thin wrapper. Business logic goes in `services/`.
- **New validation?** → Zod schema in the service file, not inline in the route.
- **New permission check?** → Add helper to `lib/permissions.ts`, use in service.
- **New error case?** → Throw from `lib/errors.ts` classes. Route catches via `errorResponse()`.
- **New model/migration?** → Update `docs/database_schema.md`.
- **New service/component?** → Update `docs/module_registry.md`.
- **New AI system?** → Update `docs/ai_systems.md`. Keep isolated in `ai/`.
