-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lane" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "caller" TEXT NOT NULL,
    "campaignId" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "estUsd" REAL NOT NULL DEFAULT 0,
    "sanitized" BOOLEAN NOT NULL DEFAULT false,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AiCall_createdAt_idx" ON "AiCall"("createdAt");

-- CreateIndex
CREATE INDEX "AiCall_campaignId_createdAt_idx" ON "AiCall"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_lane_createdAt_idx" ON "AiCall"("lane", "createdAt");
