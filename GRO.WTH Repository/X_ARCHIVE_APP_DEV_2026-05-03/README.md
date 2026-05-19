# X_ARCHIVE_APP_DEV_2026-05-03

**Archived:** 2026-05-03

The contents of this folder were the former `08_APP_DEVELOPMENT/` section of the rules repository. They are **superseded** by the live application documentation in the main app repository:

- `C:\Projects\GRO.WTH\app\docs\` — current architecture, services, schemas, API design
- `C:\Projects\GRO.WTH\docs\` — system map, module registry, database schema, AI systems

These archived files are **stale** with respect to current canon:

- **Dice_Rolling_API.md** — predates the server-side dice rewrite (2026-03-11). All rolling now happens server-side with `DiceApiIntent` objects; see `app/src/services/dice.ts`.
- **Character_Sheet_JSON_Schema.md** — predates the post-Jan-2026 Soul/Spirit swap, the WTH retirement (2026-04-05), and the Values/Addictions/Fears cuts (2026-04-19). Schema source of truth is now `app/src/types/growth.ts` and Prisma schema.
- **Research_Needed_Items.md** — entries for Tech Level / Wealth Level / Health Level are obsolete (WTH retired 2026-04-05).
- **Oracle_Scribe_System.md / Oracle_Technical_Architecture.md** — Oracle is on the future roadmap; current AI design is in `docs/ai_systems.md`.
- **Attribution_Chain_Technical_Implementation.md** — supplanted by the KRMA evaluator and creative-attribution work in the live app.
- **Design_Philosophy_and_Visual_Guidelines.md** — superseded by `C:\Projects\GRO.WTH\VISUAL-DESIGN-SPEC.md` and the Core Rulebook v0.4.5 PDF.

Kept here for historical reference only. Do not consult for current implementation guidance.
