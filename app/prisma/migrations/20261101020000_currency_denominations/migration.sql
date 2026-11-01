-- Denominations of a currency (Michael 2026-11-01): the faces it comes in, set by JEWL when he establishes it.
ALTER TABLE "Currency" ADD COLUMN "denominations" TEXT NOT NULL DEFAULT '[]';
