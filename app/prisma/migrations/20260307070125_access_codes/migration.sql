-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'WATCHER',
    "label" TEXT,
    "redeemedById" TEXT,
    "redeemedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "AccessCode_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessCode_code_key" ON "AccessCode"("code");
