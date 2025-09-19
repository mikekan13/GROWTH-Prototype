-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerType" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "liquid" BIGINT NOT NULL DEFAULT 0,
    "soulBound" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GMProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "signupMonth" INTEGER NOT NULL,
    "baselineActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GMProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmId" TEXT NOT NULL,
    "name" TEXT,
    "bodyPct" REAL NOT NULL DEFAULT 0.33,
    "spiritPct" REAL NOT NULL DEFAULT 0.33,
    "soulPct" REAL NOT NULL DEFAULT 0.34,
    "frequency" BIGINT NOT NULL DEFAULT 0,
    "mana" BIGINT NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityProfile_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "GMProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemPools" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmId" TEXT NOT NULL,
    "gmBodyPoolId" TEXT NOT NULL,
    "gmSpiritPoolId" TEXT NOT NULL,
    "spiritOtherHalfHoldId" TEXT NOT NULL,
    "itemRemainderHoldId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BaselineParams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lifetimeTotal" BIGINT NOT NULL,
    "windowMonths" INTEGER NOT NULL,
    "muMonths" REAL NOT NULL,
    "sigmaMonths" REAL NOT NULL,
    "ceaseFloor" BIGINT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CreativitySignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmId" TEXT NOT NULL,
    "scoreDelta" REAL NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_ownerType_ownerRef_key" ON "Wallet"("ownerType", "ownerRef");

-- CreateIndex
CREATE UNIQUE INDEX "GMProfile_userId_key" ON "GMProfile"("userId");

-- CreateIndex
CREATE INDEX "EntityProfile_gmId_idx" ON "EntityProfile"("gmId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemPools_gmId_key" ON "SystemPools"("gmId");

-- CreateIndex
CREATE INDEX "CreativitySignal_gmId_createdAt_idx" ON "CreativitySignal"("gmId", "createdAt");
