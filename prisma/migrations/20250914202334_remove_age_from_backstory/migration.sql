/*
  Warnings:

  - You are about to drop the column `age` on the `CharacterBackstory` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CharacterBackstory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "worldId" TEXT,
    "playerId" TEXT NOT NULL,
    "gmId" TEXT NOT NULL,
    "characterName" TEXT,
    "hair" TEXT,
    "eyes" TEXT,
    "physicalFeatures" TEXT,
    "childhood" TEXT,
    "significantEvent" TEXT,
    "motivation" TEXT,
    "fears" TEXT,
    "relationships" TEXT,
    "goals" TEXT,
    "seedType" TEXT,
    "rootType" TEXT,
    "branches" JSONB,
    "startingItems" JSONB,
    "krmaAllocated" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "gmNotes" TEXT,
    "revisionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    CONSTRAINT "CharacterBackstory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterBackstory_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterBackstory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterBackstory_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CharacterBackstory" ("branches", "campaignId", "characterName", "childhood", "createdAt", "eyes", "fears", "gmId", "gmNotes", "goals", "hair", "id", "krmaAllocated", "motivation", "physicalFeatures", "playerId", "relationships", "reviewedAt", "revisionNotes", "rootType", "seedType", "significantEvent", "startingItems", "status", "submittedAt", "updatedAt", "worldId") SELECT "branches", "campaignId", "characterName", "childhood", "createdAt", "eyes", "fears", "gmId", "gmNotes", "goals", "hair", "id", "krmaAllocated", "motivation", "physicalFeatures", "playerId", "relationships", "reviewedAt", "revisionNotes", "rootType", "seedType", "significantEvent", "startingItems", "status", "submittedAt", "updatedAt", "worldId" FROM "CharacterBackstory";
DROP TABLE "CharacterBackstory";
ALTER TABLE "new_CharacterBackstory" RENAME TO "CharacterBackstory";
CREATE INDEX "CharacterBackstory_campaignId_status_idx" ON "CharacterBackstory"("campaignId", "status");
CREATE INDEX "CharacterBackstory_playerId_status_idx" ON "CharacterBackstory"("playerId", "status");
CREATE INDEX "CharacterBackstory_gmId_status_idx" ON "CharacterBackstory"("gmId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
