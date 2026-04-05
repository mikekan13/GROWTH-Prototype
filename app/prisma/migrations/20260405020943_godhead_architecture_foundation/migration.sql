-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "campaignId" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "custodianId" TEXT,
    "custodianName" TEXT,
    "pillar" TEXT,
    "resistancePrompt" TEXT,
    "resistancePlan" TEXT,
    "milestones" TEXT,
    "nectarsEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Goal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Goal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 5,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "data" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityRelationship_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GodHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "walletId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GodHead_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'PLAYER_CHARACTER',
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "data" TEXT NOT NULL,
    "portrait" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("campaignId", "createdAt", "data", "id", "name", "portrait", "status", "updatedAt", "userId") SELECT "campaignId", "createdAt", "data", "id", "name", "portrait", "status", "updatedAt", "userId" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE INDEX "Character_entityType_idx" ON "Character"("entityType");
CREATE TABLE "new_ForgeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "sourceGlobalId" TEXT,
    "authorUserId" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "royaltyRate" REAL NOT NULL DEFAULT 0.01,
    "lastUsedAt" DATETIME,
    "decayStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "flaggedAt" DATETIME,
    "relationshipTags" TEXT,
    "karmicValue" BIGINT,
    "evaluatedAt" DATETIME,
    CONSTRAINT "ForgeItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ForgeItem" ("campaignId", "createdAt", "createdBy", "data", "id", "name", "status", "type", "updatedAt") SELECT "campaignId", "createdAt", "createdBy", "data", "id", "name", "status", "type", "updatedAt" FROM "ForgeItem";
DROP TABLE "ForgeItem";
ALTER TABLE "new_ForgeItem" RENAME TO "ForgeItem";
CREATE INDEX "ForgeItem_campaignId_type_idx" ON "ForgeItem"("campaignId", "type");
CREATE INDEX "ForgeItem_campaignId_status_idx" ON "ForgeItem"("campaignId", "status");
CREATE INDEX "ForgeItem_isGlobal_type_idx" ON "ForgeItem"("isGlobal", "type");
CREATE INDEX "ForgeItem_authorUserId_idx" ON "ForgeItem"("authorUserId");
CREATE INDEX "ForgeItem_decayStatus_idx" ON "ForgeItem"("decayStatus");
CREATE UNIQUE INDEX "ForgeItem_campaignId_name_type_key" ON "ForgeItem"("campaignId", "name", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Goal_characterId_status_idx" ON "Goal"("characterId", "status");

-- CreateIndex
CREATE INDEX "Goal_campaignId_status_idx" ON "Goal"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Goal_custodianId_idx" ON "Goal"("custodianId");

-- CreateIndex
CREATE INDEX "EntityRelationship_campaignId_idx" ON "EntityRelationship"("campaignId");

-- CreateIndex
CREATE INDEX "EntityRelationship_sourceId_sourceType_idx" ON "EntityRelationship"("sourceId", "sourceType");

-- CreateIndex
CREATE INDEX "EntityRelationship_targetId_targetType_idx" ON "EntityRelationship"("targetId", "targetType");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRelationship_sourceId_targetId_relationshipType_key" ON "EntityRelationship"("sourceId", "targetId", "relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "GodHead_name_key" ON "GodHead"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GodHead_characterId_key" ON "GodHead"("characterId");
