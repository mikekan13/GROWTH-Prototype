-- CreateTable
CREATE TABLE "Familiarity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "perceiverId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "aspectKind" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "lastSource" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Familiarity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Familiarity_perceiverId_fkey" FOREIGN KEY ("perceiverId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Familiarity_campaignId_idx" ON "Familiarity"("campaignId");

-- CreateIndex
CREATE INDEX "Familiarity_perceiverId_subjectKind_idx" ON "Familiarity"("perceiverId", "subjectKind");

-- CreateIndex
CREATE INDEX "Familiarity_subjectId_idx" ON "Familiarity"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Familiarity_perceiverId_subjectId_aspectKind_key" ON "Familiarity"("perceiverId", "subjectId", "aspectKind");

