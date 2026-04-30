/*
  Warnings:

  - You are about to drop the column `active` on the `GodHead` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "aiSettings" TEXT;

-- CreateTable
CREATE TABLE "GodHeadMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "godHeadId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GodHeadMemory_godHeadId_fkey" FOREIGN KEY ("godHeadId") REFERENCES "GodHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GodHeadInvocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "godHeadId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerData" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "error" TEXT,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GodHeadInvocation_godHeadId_fkey" FOREIGN KEY ("godHeadId") REFERENCES "GodHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GodHeadActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invocationId" TEXT NOT NULL,
    "godHeadId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GodHeadActionLog_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "GodHeadInvocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GodHeadActionLog_godHeadId_fkey" FOREIGN KEY ("godHeadId") REFERENCES "GodHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GodHeadTokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "godHeadId" TEXT NOT NULL,
    "invocationId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costEstimate" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GodHeadTokenUsage_godHeadId_fkey" FOREIGN KEY ("godHeadId") REFERENCES "GodHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GodHeadTokenUsage_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "GodHeadInvocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GodHeadMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "godHeadId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "invocationId" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GodHeadMessage_godHeadId_fkey" FOREIGN KEY ("godHeadId") REFERENCES "GodHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GodHeadMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GodHeadMessage_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "GodHeadInvocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampaignMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTERESTED',
    "characterDesc" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CampaignMember" ("campaignId", "id", "joinedAt", "userId") SELECT "campaignId", "id", "joinedAt", "userId" FROM "CampaignMember";
DROP TABLE "CampaignMember";
ALTER TABLE "new_CampaignMember" RENAME TO "CampaignMember";
CREATE UNIQUE INDEX "CampaignMember_campaignId_userId_key" ON "CampaignMember"("campaignId", "userId");
CREATE TABLE "new_GodHead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "walletId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GodHead_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GodHead" ("characterId", "createdAt", "domain", "id", "name", "pillar", "systemPrompt", "temperature", "updatedAt", "walletId") SELECT "characterId", "createdAt", "domain", "id", "name", "pillar", "systemPrompt", "temperature", "updatedAt", "walletId" FROM "GodHead";
DROP TABLE "GodHead";
ALTER TABLE "new_GodHead" RENAME TO "GodHead";
CREATE UNIQUE INDEX "GodHead_name_key" ON "GodHead"("name");
CREATE UNIQUE INDEX "GodHead_characterId_key" ON "GodHead"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GodHeadMemory_godHeadId_idx" ON "GodHeadMemory"("godHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "GodHeadMemory_godHeadId_key_key" ON "GodHeadMemory"("godHeadId", "key");

-- CreateIndex
CREATE INDEX "GodHeadInvocation_godHeadId_status_idx" ON "GodHeadInvocation"("godHeadId", "status");

-- CreateIndex
CREATE INDEX "GodHeadInvocation_status_createdAt_idx" ON "GodHeadInvocation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GodHeadActionLog_invocationId_idx" ON "GodHeadActionLog"("invocationId");

-- CreateIndex
CREATE INDEX "GodHeadActionLog_godHeadId_createdAt_idx" ON "GodHeadActionLog"("godHeadId", "createdAt");

-- CreateIndex
CREATE INDEX "GodHeadTokenUsage_godHeadId_idx" ON "GodHeadTokenUsage"("godHeadId");

-- CreateIndex
CREATE INDEX "GodHeadTokenUsage_invocationId_idx" ON "GodHeadTokenUsage"("invocationId");

-- CreateIndex
CREATE INDEX "GodHeadMessage_campaignId_godHeadId_createdAt_idx" ON "GodHeadMessage"("campaignId", "godHeadId", "createdAt");

-- CreateIndex
CREATE INDEX "GodHeadMessage_godHeadId_readAt_idx" ON "GodHeadMessage"("godHeadId", "readAt");

-- CreateIndex
CREATE INDEX "GodHeadMessage_invocationId_idx" ON "GodHeadMessage"("invocationId");
