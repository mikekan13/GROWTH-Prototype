-- AlterTable
ALTER TABLE "GodHead" ADD COLUMN "domainKey" TEXT;
ALTER TABLE "GodHead" ADD COLUMN "parentId" TEXT;

-- CreateTable
CREATE TABLE "VineEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "custodianId" TEXT,
    "custodianPillar" TEXT,
    "side" TEXT NOT NULL,
    "canonEventId" TEXT NOT NULL,
    "cycle" REAL NOT NULL,
    "reading" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "VineEntry_goalId_cycle_idx" ON "VineEntry"("goalId", "cycle");

-- CreateIndex
CREATE INDEX "VineEntry_custodianId_cycle_idx" ON "VineEntry"("custodianId", "cycle");

-- CreateIndex
CREATE INDEX "VineEntry_canonEventId_idx" ON "VineEntry"("canonEventId");
