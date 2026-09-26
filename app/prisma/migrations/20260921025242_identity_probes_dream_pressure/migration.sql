-- CreateTable
CREATE TABLE "DayaIdentityProbe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "probeVersion" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DayaEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "introspection" REAL NOT NULL DEFAULT 0.5,
    "personaProfile" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DORMANT',
    "dreamPressure" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayaEntity_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DayaEntity" ("characterId", "createdAt", "id", "introspection", "personaProfile", "status", "updatedAt") SELECT "characterId", "createdAt", "id", "introspection", "personaProfile", "status", "updatedAt" FROM "DayaEntity";
DROP TABLE "DayaEntity";
ALTER TABLE "new_DayaEntity" RENAME TO "DayaEntity";
CREATE UNIQUE INDEX "DayaEntity_characterId_key" ON "DayaEntity"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DayaIdentityProbe_entityId_runId_idx" ON "DayaIdentityProbe"("entityId", "runId");

-- CreateIndex
CREATE INDEX "DayaIdentityProbe_runId_idx" ON "DayaIdentityProbe"("runId");
