-- CreateTable
CREATE TABLE "CharacterDisposition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "morale" REAL NOT NULL DEFAULT 0,
    "stress" REAL NOT NULL DEFAULT 0,
    "grief" REAL NOT NULL DEFAULT 0,
    "lastCycle" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterDisposition_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterDisposition_characterId_key" ON "CharacterDisposition"("characterId");
