-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GodHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "aiActionMode" BOOLEAN NOT NULL DEFAULT false,
    "systemPrompt" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "defaultModel" TEXT,
    "walletId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GodHead_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Backfill: all godheads that existed before 2026-05-26 were AI-driven (no
-- toggle existed). Set aiActionMode = true for legacy rows so behavior is
-- preserved. New godheads minted after this migration default to false and
-- must be explicitly toggled on via the canvas character card.
INSERT INTO "new_GodHead" ("characterId", "createdAt", "defaultModel", "domain", "id", "name", "pillar", "systemPrompt", "temperature", "updatedAt", "walletId", "aiActionMode") SELECT "characterId", "createdAt", "defaultModel", "domain", "id", "name", "pillar", "systemPrompt", "temperature", "updatedAt", "walletId", true FROM "GodHead";
DROP TABLE "GodHead";
ALTER TABLE "new_GodHead" RENAME TO "GodHead";
CREATE UNIQUE INDEX "GodHead_name_key" ON "GodHead"("name");
CREATE UNIQUE INDEX "GodHead_characterId_key" ON "GodHead"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
