-- CreateTable
CREATE TABLE "Provenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetType" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "campaignId" TEXT,
    "creatorUserId" TEXT,
    "creatorEntityId" TEXT,
    "creatorKind" TEXT NOT NULL,
    "tool" TEXT,
    "ingredients" TEXT NOT NULL,
    "memoryRefs" TEXT NOT NULL,
    "rights" TEXT NOT NULL,
    "contentHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'TRAILBLAZER',
    "profile" TEXT,
    "watcherProfile" TEXT,
    "aiTrainingConsent" BOOLEAN NOT NULL DEFAULT false,
    "aiTrainingConsentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerifiedAt", "id", "passwordHash", "profile", "role", "username", "watcherProfile") SELECT "createdAt", "email", "emailVerifiedAt", "id", "passwordHash", "profile", "role", "username", "watcherProfile" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Provenance_assetType_assetId_idx" ON "Provenance"("assetType", "assetId");

-- CreateIndex
CREATE INDEX "Provenance_campaignId_createdAt_idx" ON "Provenance"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "Provenance_creatorEntityId_idx" ON "Provenance"("creatorEntityId");
