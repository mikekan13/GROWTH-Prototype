-- Ordinary competence 2026-10-30: a routine instance keeps its place (ends reached never go back) and counts its steps.
ALTER TABLE "DayaRoutine" ADD COLUMN "cursor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DayaRoutine" ADD COLUMN "steps" INTEGER NOT NULL DEFAULT 0;
