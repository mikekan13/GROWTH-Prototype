-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JewlMistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "copilotMessageId" TEXT NOT NULL,
    "gmUserId" TEXT NOT NULL,
    "sessionId" TEXT,
    "severity" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "bountyAmount" BIGINT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'flagged',
    "resolution" TEXT,
    "adjudicationInvocationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JewlMistake_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JewlMistake" ("bountyAmount", "campaignId", "copilotMessageId", "createdAt", "gmUserId", "id", "note", "sessionId", "severity", "status", "transactionId") SELECT "bountyAmount", "campaignId", "copilotMessageId", "createdAt", "gmUserId", "id", "note", "sessionId", "severity", "status", "transactionId" FROM "JewlMistake";
DROP TABLE "JewlMistake";
ALTER TABLE "new_JewlMistake" RENAME TO "JewlMistake";
CREATE INDEX "JewlMistake_campaignId_createdAt_idx" ON "JewlMistake"("campaignId", "createdAt");
CREATE INDEX "JewlMistake_gmUserId_createdAt_idx" ON "JewlMistake"("gmUserId", "createdAt");
CREATE INDEX "JewlMistake_sessionId_idx" ON "JewlMistake"("sessionId");
CREATE UNIQUE INDEX "JewlMistake_copilotMessageId_gmUserId_key" ON "JewlMistake"("copilotMessageId", "gmUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
