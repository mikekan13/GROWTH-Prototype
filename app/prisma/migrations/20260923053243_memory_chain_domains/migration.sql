-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CanonEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "cycle" REAL NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "locationId" TEXT,
    "actorId" TEXT,
    "targetId" TEXT,
    "narration" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "consequences" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "parentId" TEXT,
    "provenanceId" TEXT,
    "itemIds" TEXT NOT NULL DEFAULT '[]',
    "goalIds" TEXT NOT NULL DEFAULT '[]',
    "domains" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CanonEvent" ("actorId", "campaignId", "consequences", "createdAt", "cycle", "detail", "id", "kind", "locationId", "narration", "parentId", "provenanceId", "seq", "sourceId", "sourceType", "targetId") SELECT "actorId", "campaignId", "consequences", "createdAt", "cycle", "detail", "id", "kind", "locationId", "narration", "parentId", "provenanceId", "seq", "sourceId", "sourceType", "targetId" FROM "CanonEvent";
DROP TABLE "CanonEvent";
ALTER TABLE "new_CanonEvent" RENAME TO "CanonEvent";
CREATE INDEX "CanonEvent_campaignId_cycle_seq_idx" ON "CanonEvent"("campaignId", "cycle", "seq");
CREATE INDEX "CanonEvent_campaignId_actorId_idx" ON "CanonEvent"("campaignId", "actorId");
CREATE INDEX "CanonEvent_campaignId_targetId_idx" ON "CanonEvent"("campaignId", "targetId");
CREATE INDEX "CanonEvent_parentId_idx" ON "CanonEvent"("parentId");
CREATE TABLE "new_DayaMemoryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "narrativeCycle" REAL NOT NULL,
    "realTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "valence" REAL NOT NULL DEFAULT 0,
    "arousal" REAL NOT NULL DEFAULT 0,
    "salience" REAL NOT NULL DEFAULT 0,
    "entityRefs" TEXT NOT NULL DEFAULT '[]',
    "classification" TEXT NOT NULL DEFAULT '{}',
    "clusterId" TEXT,
    "parentMemoryId" TEXT,
    "truthRef" TEXT,
    "pillar" TEXT,
    "domain" TEXT,
    "domains" TEXT NOT NULL DEFAULT '[]',
    "chain" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "DayaMemoryEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "DayaEntity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DayaMemoryEntry" ("arousal", "classification", "clusterId", "content", "entityId", "entityRefs", "id", "narrativeCycle", "parentMemoryId", "realTime", "salience", "source", "truthRef", "valence") SELECT "arousal", "classification", "clusterId", "content", "entityId", "entityRefs", "id", "narrativeCycle", "parentMemoryId", "realTime", "salience", "source", "truthRef", "valence" FROM "DayaMemoryEntry";
DROP TABLE "DayaMemoryEntry";
ALTER TABLE "new_DayaMemoryEntry" RENAME TO "DayaMemoryEntry";
CREATE INDEX "DayaMemoryEntry_entityId_narrativeCycle_idx" ON "DayaMemoryEntry"("entityId", "narrativeCycle");
CREATE INDEX "DayaMemoryEntry_entityId_salience_idx" ON "DayaMemoryEntry"("entityId", "salience");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
