-- CreateTable
CREATE TABLE "JewlMistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "copilotMessageId" TEXT NOT NULL,
    "gmUserId" TEXT NOT NULL,
    "sessionId" TEXT,
    "severity" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "bountyAmount" BIGINT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'flagged',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JewlMistake_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JewlMistake_campaignId_createdAt_idx" ON "JewlMistake"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "JewlMistake_gmUserId_createdAt_idx" ON "JewlMistake"("gmUserId", "createdAt");

-- CreateIndex
CREATE INDEX "JewlMistake_sessionId_idx" ON "JewlMistake"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "JewlMistake_copilotMessageId_gmUserId_key" ON "JewlMistake"("copilotMessageId", "gmUserId");
