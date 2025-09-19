-- CreateTable
CREATE TABLE "PlayerInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmId" TEXT NOT NULL,
    "playerEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inviteToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerInvitation_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "GMProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerProfile_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "GMProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitation_inviteToken_key" ON "PlayerInvitation"("inviteToken");

-- CreateIndex
CREATE INDEX "PlayerInvitation_inviteToken_idx" ON "PlayerInvitation"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitation_gmId_playerEmail_key" ON "PlayerInvitation"("gmId", "playerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");

-- CreateIndex
CREATE INDEX "PlayerProfile_gmId_isActive_idx" ON "PlayerProfile"("gmId", "isActive");
