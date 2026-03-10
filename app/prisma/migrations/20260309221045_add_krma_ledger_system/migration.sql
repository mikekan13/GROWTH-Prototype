/*
  Warnings:

  - Added the required column `actorId` to the `KrmaTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `checksum` to the `KrmaTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sequenceNumber` to the `KrmaTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `KrmaTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "LedgerSequence" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "current" BIGINT NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "BurnLedger" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "totalBurned" BIGINT NOT NULL DEFAULT 0,
    "cap" BIGINT NOT NULL DEFAULT 5000000000
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}'
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KrmaTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceNumber" BIGINT NOT NULL,
    "fromWalletId" TEXT NOT NULL,
    "toWalletId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "state" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "campaignId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "checksum" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_KrmaTransaction" ("amount", "createdAt", "fromWalletId", "id", "reason", "toWalletId") SELECT "amount", "createdAt", "fromWalletId", "id", "reason", "toWalletId" FROM "KrmaTransaction";
DROP TABLE "KrmaTransaction";
ALTER TABLE "new_KrmaTransaction" RENAME TO "KrmaTransaction";
CREATE UNIQUE INDEX "KrmaTransaction_sequenceNumber_key" ON "KrmaTransaction"("sequenceNumber");
CREATE UNIQUE INDEX "KrmaTransaction_idempotencyKey_key" ON "KrmaTransaction"("idempotencyKey");
CREATE INDEX "KrmaTransaction_fromWalletId_idx" ON "KrmaTransaction"("fromWalletId");
CREATE INDEX "KrmaTransaction_toWalletId_idx" ON "KrmaTransaction"("toWalletId");
CREATE INDEX "KrmaTransaction_campaignId_createdAt_idx" ON "KrmaTransaction"("campaignId", "createdAt");
CREATE INDEX "KrmaTransaction_createdAt_idx" ON "KrmaTransaction"("createdAt");
CREATE INDEX "KrmaTransaction_reason_idx" ON "KrmaTransaction"("reason");
CREATE TABLE "new_Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "walletType" TEXT NOT NULL DEFAULT 'USER',
    "ownerType" TEXT NOT NULL DEFAULT 'USER',
    "label" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "campaignId" TEXT,
    "characterId" TEXT,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Wallet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Wallet" ("balance", "id", "label", "ownerId", "ownerType") SELECT "balance", "id", "label", "ownerId", "ownerType" FROM "Wallet";
DROP TABLE "Wallet";
ALTER TABLE "new_Wallet" RENAME TO "Wallet";
CREATE UNIQUE INDEX "Wallet_ownerId_key" ON "Wallet"("ownerId");
CREATE INDEX "Wallet_walletType_idx" ON "Wallet"("walletType");
CREATE INDEX "Wallet_campaignId_idx" ON "Wallet"("campaignId");
CREATE INDEX "Wallet_characterId_idx" ON "Wallet"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditEntry_actorId_idx" ON "AuditEntry"("actorId");

-- CreateIndex
CREATE INDEX "AuditEntry_targetId_idx" ON "AuditEntry"("targetId");

-- CreateIndex
CREATE INDEX "AuditEntry_timestamp_idx" ON "AuditEntry"("timestamp");
