-- Prods carry an audience (2026-10-16): gm | player | player:<characterId> — whoever owns the answer.

-- AlterTable
ALTER TABLE "GenesisProd" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'gm';
