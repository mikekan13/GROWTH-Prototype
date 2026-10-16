-- Every completion stage opens with a question round (2026-10-16): the prod remembers its stage.

-- AlterTable
ALTER TABLE "GenesisProd" ADD COLUMN "stage" TEXT;
