-- CreateTable
CREATE TABLE "Timescale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitName" TEXT NOT NULL DEFAULT 'year',
    "unitsPerMetaCycle" REAL NOT NULL DEFAULT 1,
    "calendar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Timescale_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "timestampCycle" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "actorId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'gm',
    "eventGroupId" TEXT,
    "realTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoryEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "genre" TEXT,
    "themes" TEXT,
    "description" TEXT,
    "worldContext" TEXT,
    "customPrompts" TEXT,
    "applicationTemplate" TEXT,
    "listingStatus" TEXT NOT NULL DEFAULT 'UNLISTED',
    "listingDescription" TEXT,
    "listingTags" TEXT,
    "requiredFields" TEXT,
    "gmUserId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxTrailblazers" INTEGER NOT NULL DEFAULT 5,
    "aiSettings" TEXT,
    "currentCycle" REAL NOT NULL DEFAULT 0,
    "defaultTimescaleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_gmUserId_fkey" FOREIGN KEY ("gmUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("aiSettings", "applicationTemplate", "createdAt", "customPrompts", "description", "genre", "gmUserId", "id", "inviteCode", "listingDescription", "listingStatus", "listingTags", "maxTrailblazers", "name", "requiredFields", "status", "themes", "worldContext") SELECT "aiSettings", "applicationTemplate", "createdAt", "customPrompts", "description", "genre", "gmUserId", "id", "inviteCode", "listingDescription", "listingStatus", "listingTags", "maxTrailblazers", "name", "requiredFields", "status", "themes", "worldContext" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE UNIQUE INDEX "Campaign_inviteCode_key" ON "Campaign"("inviteCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Timescale_campaignId_idx" ON "Timescale"("campaignId");

-- CreateIndex
CREATE INDEX "HistoryEntry_campaignId_subjectType_subjectId_timestampCycle_idx" ON "HistoryEntry"("campaignId", "subjectType", "subjectId", "timestampCycle");

-- CreateIndex
CREATE INDEX "HistoryEntry_campaignId_eventGroupId_idx" ON "HistoryEntry"("campaignId", "eventGroupId");
