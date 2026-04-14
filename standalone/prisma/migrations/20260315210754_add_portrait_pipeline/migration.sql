-- CreateTable
CREATE TABLE "PortraitGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "pulidWeight" REAL,
    "styleLoraName" TEXT,
    "styleLoraWeight" REAL,
    "generationTimeMs" INTEGER NOT NULL,
    "stateSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "isCurrentPortrait" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortraitGeneration_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonaLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "referenceImagePath" TEXT NOT NULL,
    "embeddingPath" TEXT NOT NULL,
    "lockedPrompt" TEXT NOT NULL,
    "lockedSeed" INTEGER NOT NULL,
    "bodyDescription" TEXT NOT NULL DEFAULT '',
    "styleLora" TEXT,
    "loraStrength" REAL NOT NULL DEFAULT 0.6,
    "pulidWeight" REAL NOT NULL DEFAULT 0.8,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "previousLockId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonaLock_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PortraitGeneration_characterId_idx" ON "PortraitGeneration"("characterId");

-- CreateIndex
CREATE INDEX "PortraitGeneration_characterId_isCurrentPortrait_idx" ON "PortraitGeneration"("characterId", "isCurrentPortrait");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaLock_characterId_key" ON "PersonaLock"("characterId");
