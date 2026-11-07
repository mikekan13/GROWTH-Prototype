-- An act takes time (Michael 2026-11-07): what a being is in the middle of, and how far along.
CREATE TABLE "BeingAct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "done" REAL NOT NULL DEFAULT 0,
    "startedCycle" REAL NOT NULL,
    "updatedCycle" REAL NOT NULL,
    "endedCycle" REAL,
    "endReason" TEXT,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BeingAct_campaignId_endedCycle_idx" ON "BeingAct"("campaignId", "endedCycle");
CREATE INDEX "BeingAct_characterId_idx" ON "BeingAct"("characterId");
