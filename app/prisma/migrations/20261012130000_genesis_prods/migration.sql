-- CreateTable
CREATE TABLE "GenesisProd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "anchorQuote" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "jewlFill" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "DayaWorkSession" ADD COLUMN "stage" TEXT;
ALTER TABLE "DayaWorkSession" ADD COLUMN "prodRound" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "GenesisProd_sessionId_round_order_idx" ON "GenesisProd"("sessionId", "round", "order");

-- CreateIndex
CREATE INDEX "GenesisProd_campaignId_characterId_idx" ON "GenesisProd"("campaignId", "characterId");
