-- AlterTable
ALTER TABLE "DayaMemoryEntry" ADD COLUMN "truthRef" TEXT;

-- CreateTable
CREATE TABLE "CanonEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "cycle" REAL NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "locationId" TEXT,
    "actorId" TEXT,
    "targetId" TEXT,
    "narration" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "consequences" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "parentId" TEXT,
    "provenanceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CanonEvent_campaignId_cycle_seq_idx" ON "CanonEvent"("campaignId", "cycle", "seq");

-- CreateIndex
CREATE INDEX "CanonEvent_campaignId_actorId_idx" ON "CanonEvent"("campaignId", "actorId");

-- CreateIndex
CREATE INDEX "CanonEvent_campaignId_targetId_idx" ON "CanonEvent"("campaignId", "targetId");

-- CreateIndex
CREATE INDEX "CanonEvent_parentId_idx" ON "CanonEvent"("parentId");
