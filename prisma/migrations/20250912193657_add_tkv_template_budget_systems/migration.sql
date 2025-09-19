-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "namedRanges" JSONB NOT NULL,
    "krmaMapping" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CharacterKrma" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "totalKrmaValue" BIGINT NOT NULL,
    "krmaBreakdown" JSONB NOT NULL,
    "lastCalculated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterKrma_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TemplateVersion_templateId_isActive_idx" ON "TemplateVersion"("templateId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterKrma_characterId_key" ON "CharacterKrma"("characterId");

-- CreateIndex
CREATE INDEX "CharacterKrma_totalKrmaValue_idx" ON "CharacterKrma"("totalKrmaValue");

-- CreateIndex
CREATE INDEX "CharacterKrma_lastCalculated_idx" ON "CharacterKrma"("lastCalculated");
