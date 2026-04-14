-- CreateTable
CREATE TABLE "ForgeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForgeItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "data" TEXT NOT NULL,
    "gmNotes" TEXT,
    "forgeItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerRequest_forgeItemId_fkey" FOREIGN KEY ("forgeItemId") REFERENCES "ForgeItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ForgeItem_campaignId_type_idx" ON "ForgeItem"("campaignId", "type");

-- CreateIndex
CREATE INDEX "ForgeItem_campaignId_status_idx" ON "ForgeItem"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ForgeItem_campaignId_name_type_key" ON "ForgeItem"("campaignId", "name", "type");

-- CreateIndex
CREATE INDEX "PlayerRequest_campaignId_status_idx" ON "PlayerRequest"("campaignId", "status");

-- CreateIndex
CREATE INDEX "PlayerRequest_requesterId_idx" ON "PlayerRequest"("requesterId");
