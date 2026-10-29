-- Speed work 2026-10-29: every model call records its wall time (and time to first token when streamed),
-- so a beat's timeline is read from the record instead of inferred from createdAt.
ALTER TABLE "DayaModelCall" ADD COLUMN "ms" INTEGER;
ALTER TABLE "DayaModelCall" ADD COLUMN "ttftMs" INTEGER;
