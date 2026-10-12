-- CreateTable
CREATE TABLE "LawfulnessFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceNumber" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaignId" TEXT,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refTable" TEXT,
    "refId" TEXT,
    "screenHits" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LawfulnessFlag_sequenceNumber_key" ON "LawfulnessFlag"("sequenceNumber");

-- CreateIndex
CREATE INDEX "LawfulnessFlag_campaignId_createdAt_idx" ON "LawfulnessFlag"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "LawfulnessFlag_status_createdAt_idx" ON "LawfulnessFlag"("status", "createdAt");
