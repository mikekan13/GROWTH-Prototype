-- A message is a record (Michael 2026-11-07): one row per message by any medium (text, voicemail, letter, spell, thought), every moment stamped.
CREATE TABLE "WorldMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "senderId" TEXT,
    "senderThingId" TEXT,
    "recipientId" TEXT NOT NULL,
    "recipientThingId" TEXT,
    "contentKind" TEXT NOT NULL DEFAULT 'words',
    "content" TEXT NOT NULL,
    "notice" TEXT NOT NULL DEFAULT '',
    "sentCycle" REAL NOT NULL,
    "deliveredCycle" REAL,
    "noticedCycle" REAL,
    "readCycle" REAL,
    "settledCycle" REAL,
    "settledReason" TEXT,
    "replyToId" TEXT,
    "durationSeconds" INTEGER,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorldMessage_campaignId_idx" ON "WorldMessage"("campaignId");
CREATE INDEX "WorldMessage_recipientThingId_idx" ON "WorldMessage"("recipientThingId");
CREATE INDEX "WorldMessage_campaignId_recipientId_senderId_idx" ON "WorldMessage"("campaignId", "recipientId", "senderId");
