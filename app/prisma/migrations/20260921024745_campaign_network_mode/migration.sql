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
    "networkMode" TEXT NOT NULL DEFAULT 'META',
    "maxTrailblazers" INTEGER NOT NULL DEFAULT 5,
    "aiSettings" TEXT,
    "currentCycle" REAL NOT NULL DEFAULT 0,
    "defaultTimescaleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_gmUserId_fkey" FOREIGN KEY ("gmUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("aiSettings", "applicationTemplate", "createdAt", "currentCycle", "customPrompts", "defaultTimescaleId", "description", "genre", "gmUserId", "id", "inviteCode", "listingDescription", "listingStatus", "listingTags", "maxTrailblazers", "name", "requiredFields", "status", "themes", "worldContext") SELECT "aiSettings", "applicationTemplate", "createdAt", "currentCycle", "customPrompts", "defaultTimescaleId", "description", "genre", "gmUserId", "id", "inviteCode", "listingDescription", "listingStatus", "listingTags", "maxTrailblazers", "name", "requiredFields", "status", "themes", "worldContext" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE UNIQUE INDEX "Campaign_inviteCode_key" ON "Campaign"("inviteCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
