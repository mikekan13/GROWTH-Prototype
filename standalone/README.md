# GRO.WTH Standalone Character Creator

A focused Next.js app containing JUST the character creation pipeline from GRO.WTH.
Evolves independently from the main app (`../app/`) and syncs changes both ways.

## Why this exists

- Rapid iteration on character creation without booting the full main app
- Path to a future "standalone character creator" product (browser app / desktop app)
- Keeps the wizard as the **single source of truth** used by both main app and standalone
- When the main app's wizard improves, port the changes back here. And vice versa.

## Quick start

```shell
cd standalone
npm install
npx prisma generate
npm run dev
```

Standalone runs at **http://localhost:3001**.

## Prerequisites

1. **Main app must be set up first.** The standalone shares `../app/dev.db` via the
   DATABASE_URL in `.env`, so the main app's Prisma migrations must be applied.
2. **Log in via main app at http://localhost:3000.** Session cookies are shared across
   `localhost` domain, so a session at port 3000 authenticates the standalone at 3001.
3. **ComfyUI must be running** at the URL in `.env` (default http://127.0.0.1:8188) if
   you want portrait generation to work. Only one app can use the GPU at a time.

## What's included

- Character creation wizard (CharacterTab) — the full flow
- Identity Lock wizard (IdentityLockWizard) — face/body/angles/body/tests
- Portrait generation pipeline — ComfyUI provider, prompt builder, all workflows
- Reference photo upload
- Character + campaign + entity APIs (everything the wizard calls)
- Auth/session (shared cookies with main app)
- GM entity editing (Tapestry's EntitiesPanel component reachable by GM via character list)

## What's NOT included

- Campaign canvas / in-game play UI
- Dice system
- Tapestry, Watcher Console, Terminal UI (the surrounding campaign infrastructure)
- GRO.vines, Forge authoring UI
- Most of the main app's navigation

## Sync strategy

See **[SYNC.md](./SYNC.md)** for full details. TL;DR:

```shell
npm run sync:from-main    # pull main's updates INTO standalone
npm run sync:to-main      # push standalone's updates INTO main
```

Sync-managed paths are enumerated in SYNC.md. Anything not listed is app-specific
and won't be touched by the scripts.

## Known issues / TODO

- [ ] Dev-mode auth relies on shared localhost cookies. For production deployment
      (different origin), need proper SSO or token exchange.
- [ ] ComfyUI single-instance contention — if main app and standalone both fire a
      gen simultaneously, one queues behind the other. A future "managed ComfyUI
      pool" would fix this.
- [ ] Some imports from standalone-only components may pull in dice/canvas code that
      was stripped. Watch for import errors on first `npm run dev`; add stub files
      or delete the offending import.
- [ ] Reference photo paths use `/uploads/references/...` which is served by the
      main app's `public/` dir. Standalone's references API uploads to its OWN
      `public/uploads/`, creating two separate reference stores. TODO: unify by
      pointing standalone to main's `public/uploads/` via config, OR migrating
      references to cloud storage (S3).

## Architecture note

**This is NOT a package/monorepo.** It's a copy-with-sync. Deliberate — the main
app keeps working even if standalone breaks something, and Mike can deploy/iterate
either app independently.

If this approach proves painful over time, formalize as a pnpm workspace with a
shared `packages/character-creator/` — the sync-managed paths list in SYNC.md is
already the list of what would move into that package.
