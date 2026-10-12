-- Table-chat history hygiene (2026-10-12): rolling summary of older table chat.
ALTER TABLE "Campaign" ADD COLUMN "jewlChatSummary" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "jewlChatSummaryThrough" DATETIME;
