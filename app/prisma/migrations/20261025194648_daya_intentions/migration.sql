-- CreateTable
CREATE TABLE "DayaIntention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trigger" TEXT,
    "dueCycle" REAL,
    "dueUntil" REAL,
    "cadence" TEXT,
    "goalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceMemoryId" TEXT,
    "narrativeCycle" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayaIntention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DayaIntention_entityId_status_idx" ON "DayaIntention"("entityId", "status");
