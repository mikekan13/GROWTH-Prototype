# AUDIO MODE — plan (2026-11-06, Michael from the car: "let's get audio mode up and running")

Everything local. Audio never leaves the machine (privacy wall: fiction only to the cloud, and audio is not even that).

## Found
- whisper-server/ (faster-whisper small.en, CUDA) UP on :9000, OpenAI-compatible POST /v1/audio/transcriptions. App provider: src/ai/providers/stt.ts transcribeAudio(dataUrl, { initialPrompt }) — STT_PROVIDER=whisper-local in .env.local. NO mic anywhere in the client.
- Kokoro-82M (kokoro 0.7.16) installed in global Python 3.13 (C:\Users\Mikek\AppData\Local\Programs\Python\Python313\python.exe) from C:\Projects\TTS Local; KPipeline(lang_code='a'|'b'); 15 voices (af_heart, af_bella, af_nicole, af_sarah, af_sky, am_adam, am_michael, am_liam, bf_emma, bf_isabella, bf_alice, bf_lily, bm_george, bm_lewis, bm_daniel); smoke: 1.5 s for 4.1 s of audio incl. first-call warmup; CUDA true; no espeak-ng (fine for English).
- Nothing in the app speaks. Feed rows (components/terminal/table-feed/feed-rows.ts buildFeedRows) already separate narration rows (via 'being') from character rows whose segments are speech|action|thought.
- Phone: tailscale serve was https://christophoros.taila59e25.ts.net → :3000 (dev, DOWN). Repointed to :3001 (`tailscale serve --bg 3001`). A mic needs a secure origin; this is it. Restore with `tailscale serve --bg 3000`.
- Character data carries `gender` ("Female"/"Male"/freetext) — Violet Female, Kristopher Male.

## Build (three agents in parallel)
A. tts-server/ (FastAPI + Kokoro) on :9001: POST /v1/audio/speech {input, voice, speed} → audio/wav; GET /health; GET /v1/voices; start.bat on the global py313; boot.ps1 block + -NoTts + smoke line.
B. src/lib/speech-voices.ts (pure: voiceForCharacter({id,name,gender}) deterministic by gender pool + id hash; NARRATOR_VOICE) + src/app/api/speech/speak (POST {text, characterId|null, speed?} → looks up gender, derives voice, proxies to TTS_LOCAL_URL default http://127.0.0.1:9001/v1/audio/speech, returns audio/wav; 503 when down) + src/app/api/speech/transcribe (POST multipart audio + prompt → transcribeAudio → {text}).
C. client: src/hooks/useTableReader.ts (reads NEW being events after enable: narration rows → narrator; character rows: speech → the character, action → narrator, thought skipped; sequential queue, prefetch next; HTMLAudioElement; unlock on the toggle gesture) + TableSpeakBar: AUDIO toggle (localStorage growth:audio-mode:<campaignId>) and MIC button (tap start/stop, MediaRecorder webm/opus or mp4, POST transcribe with the awake names as prompt, append to the box, no auto-send) + CampaignTerminal mounts the reader.

## Then
tsc, vitest, detached prod build (check free RAM first; see feedback-manage-system-resources), restart :3001, probe speak/transcribe with the GM session cookie, handoff + memory + commit + push.

## Owed / later
- Watcher's own narration read back (option) · thoughts in a whisper voice · per-being voice chosen on the sheet (data) · streaming TTS by sentence · Whisper live partials · a boot.ps1 -Prod flag.

## RULING mid-build (Michael, from the car)
"Audio is considered the way to play GROWTH… the full of it is meant to be done with the always-on mic. Playback options for Watchers: NPCs voiced, or read off cards, or controlled. We need a standard setup."

## Standard setup — PROPOSAL for the talk (not built)
1. Watcher: always-on mic. The browser cuts lines at the Watcher's pauses (VAD); each line goes to Whisper and lands on the table as a beat (the existing `audio-chunk` → `hearSpoken` path, today behind TABLE_SPLIT_LOOP). No Send button in the loop; the box shows what was heard and lets the Watcher fix it.
2. The table speaks by default: every being the Watcher is not voicing is read aloud in its own voice (speech) with the narrator for deeds. Thoughts stay silent (on the card only).
3. While the table speaks, the mic is gated (plus echo cancellation) so playback is never transcribed.
4. Per NPC, on the sheet, not a toggle: `voiced: table` (TTS, default) · `watcher` (card shown, no TTS, the Watcher reads it) · `controlled` (the Watcher speaks for it; the per-line rule decides whether it still acts on its own).
5. Trailblazers: mic too; a player's own character is never TTS'd.
6. Voice per being: `data.voice` chosen by the Watcher on the sheet, default derived (gender pool + id). Later: designed voices as part of genesis.
7. Typing stays as the fallback everywhere (same box).

## Notes from the car (Michael, 11-06 late)
- NON-HUMAN voices (monstrous, demonic, angelic…) handled by the same system → fx chain presets + per-voice params (tts-server/fx.py).
- IMMERSION MODE: a table option where you never hear the other humans as themselves; everything is filtered through the voices. v1 = mic → text → the character's designed voice for players too; later real-time voice conversion.
- OWED: audit the Watcher's campaign settings page — add what belongs, remove what shouldn't be there.
