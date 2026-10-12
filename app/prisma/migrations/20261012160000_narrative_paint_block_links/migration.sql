-- CreateTable
CREATE TABLE "CharacterBlockLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "forgeItemId" TEXT NOT NULL,
    "localName" TEXT,
    "story" TEXT NOT NULL,
    "history" TEXT NOT NULL DEFAULT '[]',
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "CampaignItem" ADD COLUMN "sourceForgeItemId" TEXT;
ALTER TABLE "CampaignItem" ADD COLUMN "story" TEXT;
ALTER TABLE "CampaignItem" ADD COLUMN "history" TEXT NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "CharacterBlockLink_characterId_forgeItemId_key" ON "CharacterBlockLink"("characterId", "forgeItemId");

-- CreateIndex
CREATE INDEX "CharacterBlockLink_campaignId_characterId_idx" ON "CharacterBlockLink"("campaignId", "characterId");

-- CreateIndex
CREATE INDEX "CharacterBlockLink_forgeItemId_idx" ON "CharacterBlockLink"("forgeItemId");

-- CreateIndex
CREATE INDEX "CharacterBlockLink_sessionId_idx" ON "CharacterBlockLink"("sessionId");
