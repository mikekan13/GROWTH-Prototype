-- CreateTable
CREATE TABLE "ManaResidue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT,
    "spellName" TEXT,
    "method" TEXT NOT NULL,
    "dr" INTEGER NOT NULL,
    "manaInitial" INTEGER NOT NULL,
    "manaRemaining" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ManaResidue_campaignId_idx" ON "ManaResidue"("campaignId");
