-- Genesis completion (2026-10-12): NPC seed shells, instance years, AI-authored vine goals.

-- AlterTable
ALTER TABLE "Character" ADD COLUMN "seededFromId" TEXT;

-- AlterTable
ALTER TABLE "CharacterBlockLink" ADD COLUMN "ageAdded" INTEGER;

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "authoredBy" TEXT;

-- CreateIndex
CREATE INDEX "Character_seededFromId_idx" ON "Character"("seededFromId");
