-- AlterTable
ALTER TABLE "DayaMemoryEntry" ADD COLUMN "noticed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DayaMemoryEntry" ADD COLUMN "perceivedVia" TEXT NOT NULL DEFAULT '[]';
