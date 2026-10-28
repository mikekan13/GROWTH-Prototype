-- CreateTable
CREATE TABLE "LastKnown" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "known" TEXT NOT NULL,
    "x" REAL,
    "y" REAL,
    "roomId" TEXT,
    "state" TEXT,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "LastKnown_viewerId_subjectId_key" ON "LastKnown"("viewerId", "subjectId");

-- CreateIndex
CREATE INDEX "LastKnown_campaignId_viewerId_idx" ON "LastKnown"("campaignId", "viewerId");
