-- CreateTable
CREATE TABLE "DayaWorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "goal" TEXT NOT NULL,
    "plan" TEXT,
    "progress" TEXT NOT NULL DEFAULT '[]',
    "blockedReason" TEXT,
    "continueUnattended" BOOLEAN NOT NULL DEFAULT false,
    "cycleCount" INTEGER NOT NULL DEFAULT 0,
    "lastCycleAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdBy" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "DayaWorkSession_status_lastCycleAt_idx" ON "DayaWorkSession"("status", "lastCycleAt");

-- CreateIndex
CREATE INDEX "DayaWorkSession_campaignId_status_idx" ON "DayaWorkSession"("campaignId", "status");
