/*
  Warnings:

  - You are about to drop the `CharacterDisposition` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CharacterDisposition";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "DayaEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "introspection" REAL NOT NULL DEFAULT 0.5,
    "personaProfile" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DORMANT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayaEntity_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayaBelievedSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "lastRevisedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayaBelievedSheet_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayaMemoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "narrativeCycle" REAL NOT NULL,
    "realTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "valence" REAL NOT NULL DEFAULT 0,
    "arousal" REAL NOT NULL DEFAULT 0,
    "salience" REAL NOT NULL DEFAULT 0,
    "entityRefs" TEXT NOT NULL DEFAULT '[]',
    "classification" TEXT NOT NULL DEFAULT '{}',
    "clusterId" TEXT,
    "parentMemoryId" TEXT,
    CONSTRAINT "DayaMemoryEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayaAffect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "morale" REAL NOT NULL DEFAULT 0,
    "stress" REAL NOT NULL DEFAULT 0,
    "grief" REAL NOT NULL DEFAULT 0,
    "lastCycle" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayaAffect_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayaRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "aboutCharacterId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayaRelationship_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DayaSpiritTie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentEntityId" TEXT NOT NULL,
    "childEntityId" TEXT NOT NULL,
    "forkedAtCycle" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayaSpiritTie_parentEntityId_fkey" FOREIGN KEY ("parentEntityId") REFERENCES "DayaEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DayaSpiritTie_childEntityId_fkey" FOREIGN KEY ("childEntityId") REFERENCES "DayaEntity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "establishedAtCycle" REAL NOT NULL,
    "supersededById" TEXT
);

-- CreateTable
CREATE TABLE "DayaModelCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT,
    "subsystem" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "usd" REAL NOT NULL DEFAULT 0,
    "krma" REAL NOT NULL DEFAULT 0,
    "sanitized" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DayaModelCall_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DayaEntity_characterId_key" ON "DayaEntity"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "DayaBelievedSheet_entityId_key" ON "DayaBelievedSheet"("entityId");

-- CreateIndex
CREATE INDEX "DayaMemoryEntry_entityId_narrativeCycle_idx" ON "DayaMemoryEntry"("entityId", "narrativeCycle");

-- CreateIndex
CREATE INDEX "DayaMemoryEntry_entityId_salience_idx" ON "DayaMemoryEntry"("entityId", "salience");

-- CreateIndex
CREATE UNIQUE INDEX "DayaAffect_entityId_key" ON "DayaAffect"("entityId");

-- CreateIndex
CREATE INDEX "DayaRelationship_entityId_idx" ON "DayaRelationship"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DayaRelationship_entityId_aboutCharacterId_key" ON "DayaRelationship"("entityId", "aboutCharacterId");

-- CreateIndex
CREATE INDEX "DayaSpiritTie_parentEntityId_idx" ON "DayaSpiritTie"("parentEntityId");

-- CreateIndex
CREATE INDEX "DayaSpiritTie_childEntityId_idx" ON "DayaSpiritTie"("childEntityId");

-- CreateIndex
CREATE INDEX "WorldFact_campaignId_subjectKey_idx" ON "WorldFact"("campaignId", "subjectKey");

-- CreateIndex
CREATE INDEX "DayaModelCall_entityId_createdAt_idx" ON "DayaModelCall"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "DayaModelCall_subsystem_tier_idx" ON "DayaModelCall"("subsystem", "tier");
