-- ORDINARY COMPETENCE 2026-10-30: procedural memory — a being's routines, with
-- their ends derived once from its own words; the means are planned per beat.
CREATE TABLE "DayaRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggers" TEXT NOT NULL DEFAULT '[]',
    "cadence" TEXT,
    "ends" TEXT NOT NULL DEFAULT '[]',
    "sourceIntentionIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "startedCycle" REAL,
    "lastDoneCycle" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayaRoutine_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DayaRoutine_entityId_status_idx" ON "DayaRoutine"("entityId", "status");
