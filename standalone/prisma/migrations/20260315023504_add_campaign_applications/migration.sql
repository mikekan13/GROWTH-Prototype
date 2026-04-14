-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "applicationTemplate" TEXT;

-- CreateTable
CREATE TABLE "CampaignApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "responses" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "gmNotes" TEXT,
    "characterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignApplication_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CampaignMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignApplication_memberId_key" ON "CampaignApplication"("memberId");

-- CreateIndex
CREATE INDEX "CampaignApplication_campaignId_status_idx" ON "CampaignApplication"("campaignId", "status");
