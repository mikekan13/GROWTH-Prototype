/*
  Warnings:

  - You are about to drop the column `soulBound` on the `Wallet` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "liquidKrmaInvested" BIGINT NOT NULL DEFAULT 0,
    "totalKrmaInvested" BIGINT NOT NULL DEFAULT 0,
    "lushnessFactor" REAL NOT NULL DEFAULT 1.0,
    "worldType" TEXT NOT NULL DEFAULT 'MATERIAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "World_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "regionType" TEXT NOT NULL DEFAULT 'LAND',
    "krmaValue" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldRegion_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldFaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "factionType" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "krmaValue" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldFaction_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldNPC" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "npcType" TEXT NOT NULL DEFAULT 'HUMANOID',
    "krmaValue" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldNPC_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterBackstory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "worldId" TEXT,
    "playerId" TEXT NOT NULL,
    "gmId" TEXT NOT NULL,
    "characterName" TEXT,
    "hair" TEXT,
    "eyes" TEXT,
    "physicalFeatures" TEXT,
    "age" INTEGER,
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "folderId" TEXT,
    "genre" TEXT,
    "themes" JSONB,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Campaign" ("createdAt", "folderId", "id", "name", "updatedAt") SELECT "createdAt", "folderId", "id", "name", "updatedAt" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE TABLE "new_Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "liquid" BIGINT NOT NULL DEFAULT 0,
    "crystalized" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Wallet" ("createdAt", "id", "liquid", "ownerRef", "ownerType", "updatedAt") SELECT "createdAt", "id", "liquid", "ownerRef", "ownerType", "updatedAt" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE UNIQUE INDEX "Wallet_ownerType_ownerRef_key" ON "Wallet"("ownerType", "ownerRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "World_campaignId_isActive_idx" ON "World"("campaignId", "isActive");

-- CreateIndex
CREATE INDEX "WorldRegion_worldId_isActive_idx" ON "WorldRegion"("worldId", "isActive");

-- CreateIndex
CREATE INDEX "WorldFaction_worldId_isActive_idx" ON "WorldFaction"("worldId", "isActive");

-- CreateIndex
CREATE INDEX "WorldNPC_worldId_isActive_idx" ON "WorldNPC"("worldId", "isActive");

-- CreateIndex
CREATE INDEX "CharacterBackstory_campaignId_status_idx" ON "CharacterBackstory"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CharacterBackstory_playerId_status_idx" ON "CharacterBackstory"("playerId", "status");

-- CreateIndex
CREATE INDEX "CharacterBackstory_gmId_status_idx" ON "CharacterBackstory"("gmId", "status");
