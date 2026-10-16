-- Material life (2026-10-16): currencies are campaign objects — stored-KRMA vehicles, many per campaign, AI-managed.

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT '',
    "krmaPerUnit" REAL NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Currency_campaignId_code_key" ON "Currency"("campaignId", "code");

-- CreateIndex
CREATE INDEX "Currency_campaignId_status_idx" ON "Currency"("campaignId", "status");
