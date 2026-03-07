/*
  Warnings:

  - Added the required column `responses` to the `CharacterBackstory` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "CampaignMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "gmUserId" TEXT NOT NULL,
    "inviteCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxTrailblazers" INTEGER NOT NULL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_gmUserId_fkey" FOREIGN KEY ("gmUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "description", "genre", "gmUserId", "id", "inviteCode", "name", "status", "themes") SELECT "createdAt", "description", "genre", "gmUserId", "id", "inviteCode", "name", "status", "themes" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE UNIQUE INDEX "Campaign_inviteCode_key" ON "Campaign"("inviteCode");
CREATE TABLE "new_CharacterBackstory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "responses" TEXT NOT NULL,
    "narrative" TEXT,
    "gmNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterBackstory_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CharacterBackstory" ("characterId", "createdAt", "gmNotes", "id", "narrative", "status", "updatedAt") SELECT "characterId", "createdAt", "gmNotes", "id", "narrative", "status", "updatedAt" FROM "CharacterBackstory";
DROP TABLE "CharacterBackstory";
ALTER TABLE "new_CharacterBackstory" RENAME TO "CharacterBackstory";
CREATE UNIQUE INDEX "CharacterBackstory_characterId_key" ON "CharacterBackstory"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMember_campaignId_userId_key" ON "CampaignMember"("campaignId", "userId");
