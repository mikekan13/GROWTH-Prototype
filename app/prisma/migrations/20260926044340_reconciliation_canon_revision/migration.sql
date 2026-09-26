-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "kinds" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT '[]',
    "estimateKrma" INTEGER NOT NULL DEFAULT 0,
    "holdWalletId" TEXT,
    "holdTxId" TEXT,
    "settledKrma" INTEGER,
    "canonEventId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "settledAt" DATETIME
);

-- CreateTable
CREATE TABLE "CanonRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "canonEventId" TEXT NOT NULL,
    "previous" TEXT NOT NULL,
    "narration" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "reach" TEXT NOT NULL DEFAULT '{}',
    "authoredBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Reconciliation_campaignId_status_idx" ON "Reconciliation"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CanonRevision_campaignId_canonEventId_idx" ON "CanonRevision"("campaignId", "canonEventId");
