-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT,
    "actor" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "source" TEXT,
    "revertible" BOOLEAN NOT NULL DEFAULT true,
    "revertedAt" DATETIME,
    "revertedBy" TEXT,
    "snapshotBefore" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChangeLog_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChangeLog_campaignId_createdAt_idx" ON "ChangeLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeLog_characterId_createdAt_idx" ON "ChangeLog"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeLog_groupId_idx" ON "ChangeLog"("groupId");
