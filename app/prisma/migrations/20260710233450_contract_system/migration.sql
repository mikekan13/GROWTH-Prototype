-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT,
    "parties" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "penalty" TEXT NOT NULL,
    "deadline" DATETIME,
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "voteRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContractEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "holds" BOOLEAN NOT NULL,
    "detail" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractEvaluation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PenaltyAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "resolvedBy" TEXT,
    "resolvedAt" DATETIME,
    "transactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PenaltyAction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_campaignId_idx" ON "Contract"("campaignId");

-- CreateIndex
CREATE INDEX "ContractEvaluation_contractId_evaluatedAt_idx" ON "ContractEvaluation"("contractId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "PenaltyAction_status_createdAt_idx" ON "PenaltyAction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PenaltyAction_contractId_idx" ON "PenaltyAction"("contractId");
