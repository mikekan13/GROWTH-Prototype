-- AlterTable
ALTER TABLE "DayaMemoryEntry" ADD COLUMN "firstVisibleForm" TEXT;

-- CreateTable
CREATE TABLE "FamiliarityChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "perceiverId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "aspectKind" TEXT NOT NULL,
    "fromScore" REAL,
    "fromCycle" REAL,
    "toScore" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "cycle" REAL,
    "memoryId" TEXT,
    "canonEventId" TEXT,
    "checkId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FamiliarityChange_campaignId_perceiverId_createdAt_idx" ON "FamiliarityChange"("campaignId", "perceiverId", "createdAt");

-- CreateIndex
CREATE INDEX "FamiliarityChange_perceiverId_subjectId_aspectKind_idx" ON "FamiliarityChange"("perceiverId", "subjectId", "aspectKind");
