# Sync Strategy — Standalone ↔ Main App

The standalone character creator shares ~90% of its code with the main GRO.WTH app (`../app/`).
To keep them from drifting, these paths are **sync-managed**: changes in one side should be
mirrored to the other via the scripts below.

## Sync-managed paths (both apps MUST stay in sync for these)

```
src/components/character/              # CharacterTab, IdentityLockWizard
src/components/tapestry/EntitiesPanel.tsx  # GM entity wizard launcher
src/ai/portraits/                      # entire portrait pipeline
src/ai/copilot/
src/ai/prompts/
src/ai/providers/
src/services/character.ts
src/services/entity.ts
src/services/campaign.ts
src/lib/                               # auth, db, api, errors, permissions, etc.
src/types/                             # shared types (GrowthCharacter, etc.)
src/app/api/characters/                # character CRUD
src/app/api/portraits/                 # portrait generation
src/app/api/references/                # reference photo upload
src/app/api/auth/                      # session
src/app/api/profile/                   # user profile
src/app/api/campaigns/                 # campaign + forge (seeds) + members
prisma/schema.prisma
```

## Standalone-only paths (do NOT sync back to main)

```
src/app/page.tsx                       # standalone character-picker landing
src/app/character/                     # standalone single-character wizard page
src/app/layout.tsx                     # simpler, no DiceOverlayLoader
package.json                           # port 3001 + different name
.env                                   # points DATABASE_URL to main app's dev.db
```

## Main-app-only paths (NOT copied to standalone)

```
src/components/CampaignCanvas.tsx
src/components/dice/
src/components/canvas/
src/components/watcher/
src/components/terminal/
src/components/hub/
src/components/campaign/
src/app/campaign/
src/app/watcher/
src/app/trailblazer/
src/app/terminal/
src/app/hub/
src/app/character/                     # main app has its own with different purpose
# (any other campaign-play-specific code)
```

## How to sync

### Pull updates FROM main into standalone
When the main app team updates a sync-managed file, pull into standalone:

```shell
npm run sync:from-main
```

### Push updates FROM standalone back to main
When standalone evolves (new feature, bug fix, UX improvement), push back:

```shell
npm run sync:to-main
```

Both scripts run `powershell scripts/sync-{direction}.ps1`. Each uses `robocopy`
(or `xcopy`) to mirror only the listed sync-managed paths, leaving standalone-only
and main-only paths untouched.

## Conflict resolution

If the SAME file has been modified in both apps since the last sync, the sync script
will WARN and prompt before overwriting. Review the diff, pick the winning version,
commit in the losing app to preserve history.

Practical discipline: commit before every sync so rollback is clean if the
automatic copy picks wrong.
