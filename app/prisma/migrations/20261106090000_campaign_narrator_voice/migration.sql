-- The campaign's designed narrator voice (Michael 2026-11-06): JSON<VoiceSpec>, null = Kokoro default.
ALTER TABLE "Campaign" ADD COLUMN "narratorVoice" TEXT;
