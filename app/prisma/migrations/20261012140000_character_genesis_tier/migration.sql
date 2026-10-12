-- SKETCH genesis tier (2026-10-12): improvised NPCs get a valid sheet in one
-- call; deepenRequested flags them for the deep pipeline later.
ALTER TABLE "Character" ADD COLUMN "genesisTier" TEXT;
ALTER TABLE "Character" ADD COLUMN "deepenRequested" BOOLEAN NOT NULL DEFAULT false;
