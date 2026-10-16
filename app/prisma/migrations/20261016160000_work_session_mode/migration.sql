-- Coax vs sail (Mike 2026-10-16): JEWL asks by default; the table can tell him to fill in the rest.

-- AlterTable
ALTER TABLE "DayaWorkSession" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'coax';
