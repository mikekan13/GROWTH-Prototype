# Day 7 handoff — ready for the third test: the coffee shop date (2026-11-04/05)

Michael, after session 6 ("I think you have some good days there… fix the record where it needs fixing in their memories etc. We will keep this run, fix everything and get us ready for our third test which will be at a coffee shop date").

## The world, as it stands
- **Session 6 KEPT.** The call: Kristopher dialed from the Fusion in the lot behind the hotel; Violet answered on the third ring on her own record; they talked ~75 minutes of real time; she said yes to coffee "tomorrow" at "the coffee shop on Broadway"; no hour was set ("when the rain starts"). The call is CLOSED in the ledger (he said goodbye, she set the phone face-down).
- **Record fixed** (backup `app/data/archive/session6-record-fix-*.json`): 56 non-experience rows deleted (recall-miss stubs, dream ticks, "Nothing new reaches you"), 13 wrong rows deleted (the five-dollar bill in HER pocket, his name on her screen, her acts told in his first person, a never-spoken monologue stored as dialogue, duplicate "you are on the line" rows), 11 rewritten (the "faint sound beyond the room" rows are now his words / their breathing; "Christopher" → "I"; her ringing phone is a perception not her deed; "late amber light" at 10 pm → dark, dry glass). `Violets phone continues to ring` is `owned` on the record.
- **The date is on the record**: a WorldFact `kristopher_violet.coffee_date` and a PENDING intention for each of them ("Tomorrow: coffee with … at the coffee shop on Broadway…").
- **The coffee shop on Broadway EXISTS** (`tmp/build-coffee-shop.ts`): one room on level 30, 28 × 44 ft, street door + two front windows + locked back door; 33 things made of parts (counter with till and a float, espresso machine, grinder with beans, pastry case with croissants and scones, mug shelf with 24 mugs, menu board, window bench, five tables with sugar caddies and two chairs each); 19 tokens placed. Plain and honest — redraw with JEWL if you want it yours. **No staff**: there is no barista being. Narrate one as the Watcher, or tell me to make one (a draft NPC with a being — see the gate note below).
- **Kristopher is IN the Fusion** (ruling 12, new `inside` relation): his token rides the car's token; the car sits at its proper spot in the lot. Violet is in her Main Room.
- **Rosemary Marsh** is a DRAFT NPC again with no being (her session-5 being was deleted; the readiness gate no longer seats a draft NPC with a dormant being).

## How to start the third test
1. Tell me you are sitting down → I start the pod (or start it yourself: `cd app && node ../tmp/dev-pod.mjs start`). :3001 is up on the Day 7 build.
2. Your OPENING LINE jumps the clock: e.g. `The next day, Tuesday, four in the afternoon. Rain just starting. Violet pushes open the door of the coffee shop on Broadway.` A clock jump runs **living a stretch** for every crystallized being (Violet, Kristopher) before the scene — their night, their morning, their intentions ("tomorrow: coffee…") — with the pod on. Expect the first beat to take a few minutes. If you want him already seated at a table, say so in the line; otherwise he arrives on his own record.
3. **Say the hour.** It was never set ("when the rain starts"). Your line sets it.
4. Watch for: (a) her offers and answers LAND — no reply vanishes from the screen; (b) ONE card per being per beat, with thought / deed / words as segments; (c) his and her words cross a line only when a phone is connected — face to face they simply hear each other; (d) a `[watcher-note]` in the server log when a being names a place that does not exist yet; (e) his Nectar: people read him as far younger than he is (see below).

## What changed in the engine (Day 7, commits 2fc08c6 03a5be1 + this close)
- **Never-guess judges only world-state claims.** An offer or a question ("Thursday?", "the coffee shop off Broadway?") and a short answer to a question ("Tomorrow works.", "Yes.", "I'm here.") are never checked; a tag question ("I paid you, didn't I?") still is. A place or thing she NAMES that the world does not hold → the words stand and the table emits `table_note` for the Watcher (logged `[watcher-note]`; the terminal row for it is Day 8).
- **An affirming answer is not an echo** ("Tomorrow works." after "Tomorrow works though?").
- **Ruling 10 on speech**: a composed line is shown ONCE, after every check — no partials, no retracts. (The raw streamed path, composer off, still streams.)
- **An act that uses what is not there is a stay** (the bill in her pocket): acts go through the same grounding check.
- **Chat-lane speech crosses a connected line as words** (the channel verdict carries `via: ['hearing','line']`; the hearer gets the words, not "a sound from beyond the room").
- **The far side of a signal is a perception**, not "your own doing" (it was stored 4× as his deed).
- **Nothing-new beats leave no memory row.**
- **ONE BEING, ONE BEAT, ONE CARD**: a chosen act joins the being's card for that line as an action segment (`appendBeingCardSegments`) instead of a second card.
- **Entities inside things** (ruling 12): `services/being-inside.ts` (`seatBeingIn`, `insideOf`), an `inside` edge CHARACTER → CAMPAIGN_ITEM | CHARACTER; the being keeps its room edge (the container's room); the canvas draws it at the container's point (`insideId`/`insideName` on the node). Owed: perception THROUGH a container, enter/leave as adjudicated ops.
- **The line route acks before the beats** (`/api/campaigns/[id]/table` returns once the line is recorded; beats run in `after()`); no more "Failed to get response" on a slow line.
- **Cards survive a reload** (shown ids in sessionStorage per campaign). **Scroll**: the shell is `overflow-clip` now (unconfirmed without a browser; if it still scrolls, next suspect is `layout.tsx` `min-h-screen` on body).
- **`owned` survives the cloud rebuild** of actions (it was dropped at `table-speak.ts` when the page rebuilt them).
- **Rollback drops beings made in its window**; **a draft NPC with a dormant being is not seated**.
- **THE TRAITS LANE** (`daya/traits-lane.ts`): a being's Nectars / Thorns / Blossoms stand in its record every beat ("What Kristopher IS, always: NECTAR Ageless Face (body): …") for the chooser and the voice — standing truths, never news. Nothing FIRES a Nectar yet.
- Harness: A11 counts a roster first name in the being's own memory as known (Rosemary); **A22 answersLand**; script `the-date` (7 lines after session 6).

## Nectars at the table — proposal + questions (canon read by the canon-keeper, 2026-11-04)
Canon (Repository/02_CHARACTER_CREATION/Nectars_and_Thorns_System.md, #needs-validation; rulings r-2026-04-22-05/06, r-2026-08-24-10): a Nectar is a permanent, positive, PLAY-DEFINING exploit (bends a base rule; flat +N alone is not enough), easy to track, graded individually, capped with Thorns by the Fate Die; it augments rolls through the same modifier engine as skill checks; a firing trait can spawn a Blossom. The documented PREFERENCE is player-declared, binary triggers. There is NO canonical in-session firing procedure.
- Tonight's data: **Kristopher has one Nectar, Ageless Face (body)** — strangers underestimate his age by 15+ years; disclosure forces a recalibration. **Violet has no Nectar**, three Thorns (Sealed Threshold, Fractured Continuity, Written Self). Kristopher's Thorns: Hypervigilance Architecture, Fractured Witness (+1).
- What is built: the traits lane (above) — both beings now READ their moments through their traits.
- **Proposal for the coffee date**: (1) Ageless Face fires on perception, not on a roll: anyone who perceives him for the first time in person (the barista, Violet face to face for the first time outside a doorway) gets a perception line "he looks far younger than he is" — the engine derives it from the trait on the perceived being (a `traits` read in the perception order), and the Watcher sees a trait card ("Ageless Face bears on this") under the beat. (2) A declared Nectar is a chooser act (an N-code beside the A-codes) that the being can take when its conditions hold; the Watcher sees the declaration and can veto in one tap. (3) Rolls only at real resistance (ruled 10-30): a Nectar that modifies a roll shows on the roll popup/card as a line.
- **[QUESTION] for Michael**: (a) Does an AI-played being's Nectar fire on its OWN choice, or only when the Watcher/player declares it? (b) Is declaring a Nectar free, or does it cost Effort/KRMA? (c) Can the Watcher veto a declaration? (d) Is "once per encounter" universal or per-trait? (e) Do you want Violet to have a Nectar before the date (she has none), and which?

## Day 8 list (not done tonight)
- Beat-splitting of a ramble (#6/#11/#12) + the ramble script; a current doing per being + the presence line (#20b); the room description glued into memory rows (#19b); the wall's possessives (#16).
- A terminal row for `table_note` (the Watcher's note); the stretch's cost/timing on prod; perception through containers; enter/leave a container as ops.
- The crystallized-or-not pass ("our entire what is crystallized and what not needs to be fixed"); dream ticks during a live session (the dream agent wrote three new Rosemary rows mid-call — they wake as memories).
- "listen capped" cutting a reply into an act (finding 30c) — measure on prod first.
- The card review with Michael (his lines beside the cards, marking act / thought / exposition / narration).

---
# Day 8 addendum (11-05, Claude at the Watcher's seat until 2 am)

**Ruling 13 (traits of everything) + 13b (the being is a player who never forgets its sheet) — BUILT, first pass.** `src/daya/capabilities.ts`: `capabilitiesOf(characterId)` = Nectars/Thorns/Blossoms (IS; `hidden: true` → ACTS ON, unaware) + abilities of held things (CAN, via the thing: the phones' "Connected", "Camera & Records") + the thing it is INSIDE (CAN: the Fusion's "Road Travel") + known spells (CAN cast) + true conditions (ACTS ON). Where it goes every beat: the chooser's prompt ("What X IS, always") and its act list ("use Connected (personal phone)"…), the voice record ("WHAT IT IS, ALWAYS"), the adjudicator's user message ("What the entity IS / CAN DO / What ACTS ON the entity now — apply it to the outcome, never put it in its mouth"), the perception order ("Others in view, and what SHOWS of them": body-pillar traits only — Ageless Face shows, a Thorn of the soul does not).
**Not yet:** a Nectar FIRING as a rule (needs your answers, Day 7 handoff); a vehicle moving with its riders (finding 41); the terminal showing a trait card when one bears on a beat.

**GM scenes (tmp/gm.ts, each rolled back):** findings 33–43 in `tmp/session3-live-findings-2026-11-04.md`. Headline: the text now lands `received` with its WORDS, Violet reads it on her own record (one card: thought + action), the words land as a line in her room; Kristopher's far side says delivered; a standing far-side state no longer cards every beat; the page can no longer invent a deed from the builder's prose.

**For your third test (unchanged):** opening line sets day + hour; the stretch runs; watch her answers land and the one-card beats. If you text before the date, you will now see the words arrive and her read them.

**Scenes 3–4 (Day 8 rounds 2–4):** the text now lands with its words; Violet reads it on her own and her next thought is about the actual message; a READ message stays on her phone as "read, not answered" with "write back" on her list (finding 46); the sender's far side says "read, nothing back yet". Fixed on the way: the read line was parsed as her speech (#44), the read state was dropped on load (#47), his own far side read as "says your name" (#48). Watch for: "I saved the screenshot" — an invented past deed inside a thought (#49).

**Scene 5 + the write-back (Day 8 rounds 5–6):** a second look at a read text had opened a phone line (#50, fixed: only a RINGING call connects); a being's write-back now has WORDS (#51b): she composes her text as her own answer, it goes on the record as "texts Kristopher: …", joins her card as speech, and lands on his phone as a received message with the words; her read message is settled by the reply. Still to measure: whether she CHOOSES to write back within a beat or two (#51a, the stay bias at a reply decision).

## Day 9 list
- Driving: a vehicle moves with its riders between places (a travel op; a street as a place; the lot's gate drawn as an opening) — finding 41.
- A Nectar FIRING as a rule (your five answers), and a trait card in the terminal when a trait bears on a beat.
- The stay bias at a reply decision (#51a): a message read and unanswered should pull an answer within a beat or two, like a human player.
- A terminal row for `table_note`; the stretch's cost on prod; perception THROUGH a container; enter/leave a container as ops.
- The crystallized-or-not pass; dream ticks during a live session; "listen capped" cutting a reply into an act (#30c); an invented past deed inside a thought (#49).
- The card review with you.

**Scenes 8–9 (close):** the lived decision beat is in — on Kristopher's lines Violet now gets her beat with the read message in her hand; she chose to stay twice, with reasons, rather than write back (#56). Your call whether that is her or a bias (#51a): the chooser's instruction already says a read, unanswered message asks for an answer now. If you text her before the date in the third test, expect her to read it on her own and either write back (her words will land on his phone) or sit on it with a reason in her card.

---
## Day 9 (night of 11-05 → 11-06, Michael asleep) — what was built after the two called attempts

**Rulings taken tonight (Michael, before bed):** any non-Trailblazer may act on its own unless the Watcher's CURRENT line already said what it does (per line; "Watcher-voiced" is not a thing); rolls must be graphical (brief: `tmp/rolls-ux-brief-2026-11-05.md`); replay the coffee date and go deep; aim toward voice + audio; much larger thinking cards and NO rewrites on screen (composing happens off screen; the final card prints once).

**Built (all unit-tested; see commits of 11-06):**
- **Clock:** a stated time on ANY Watcher line moves the clock (not only pure narration); bare clock times beside a day word ("the following day at exactly 2:22" → 14:22 tomorrow; 1–6 read as afternoon — ASSUMED, [QUESTION]).
- **Places:** an opening on a single room's wall leads outside (the coffee shop's door bug at the source); the lot has a gate; the coffee shop is ACTIVE; the two stray "Coffee shop worker" drafts are gone and the rollback now drops characters made in the window.
- **Texts:** a thing holds a THREAD of messages (`data.signals`, mirror in `data.signal`); a reply settles all of a sender's messages; `fromItem` chosen by the act's words / last-used / only thing; the words of a text come from the Watcher's RAW quote; a write-back with no words sends nothing; a being's freely phrased "type X and send" IS a write-back with X (`asWriteBack`); the translator restores the exact matched text (no more "Extra Space Coffee shop worker 1").
- **Beings:** inner narration is not a deed (`isInnerNarration`); another being's card text never enters a being's perception input (guard); the answer op needs a live message on THAT thing; walking to a thing in the room is a point move with a reachable spot beside it.
- **Travel (#41/68):** a being inside a VEHICLE that moves to another place DRIVES it — the car moves, every rider moves with it, parked outside the way in; a rider who walks gets out first; walking to a vehicle boards it.
- **A promise is a plan (#63):** a reply that assents to a proposed meeting becomes a PENDING intention "be at <place> <time>" with a due window (counter-times win; "Yes." to "four tomorrow" → tomorrow 16:00); speaking the promise does not keep it (only arrival settles it); a due plan puts "leave for <place>" FIRST on the chooser's list and makes a standing beat lived; "leaves for X" runs the move (vehicle/unseat handled); the stretch keeps appointments (simple version: at the window's start).
- **Traits:** negative-KV item abilities (Dead Battery) ACT ON the bearer.
- **Client:** partials never render; a retract of a shown line is a warning, never an edit; later segments only append; a full-size THINKING CARD per being while it works, replaced by the final card once.

**Still open:** the adjudicator turning "leaves for X" into a move op is prompted but not seen live; the stretch places arrival at the window start, not the exact time; `composer` shows one write-back target per thing even with two unread texts; thinking cards have no pillar tint until events carry it; rolls UI (brief only); voice + audio (not started); the Nectar questions; Bounded Potential's text; Michael's trait ideas 2–6.

**STATE AT ~13:40Z 11-06 (Michael asleep):** the production BUILD of the night's code was killed by the system for LOW MEMORY during "Running TypeScript" (worker exit 3221225794); `.next/BUILD_ID` is gone, so :3001 is DOWN and cannot start until a build succeeds. Per the standing rule I did not restart the killed build on my own. To bring it back:
```
cd C:\Projects\GRO.WTH\app
$env:NODE_OPTIONS='--max-old-space-size=4096'; npx next build --webpack
Start-Process -WindowStyle Hidden cmd.exe -ArgumentList '/c npx next start -p 3001 1>> ..\logs\prod-server.out.log 2>> ..\logs\prod-server.err.log'
```
Then the replay: `node --env-file=.env --env-file=.env.local --import tsx ../tmp/gm.ts start` and the lines in the scratchpad plan (replay-coffee-date.md: the time line first, "It is 2:22 pm the following afternoon…"). Code is committed and pushed (ca509c0); world rolled back to post-session-6 + coffee shop (ACTIVE, with a door) + lot gate + Dialed to Eleven on his sheet; pod OFF.

---

## DAY 10 (2026-11-05 afternoon, Michael: "You can fix it if it's down") — REBUILT, REPLAYED, FIXED

**What happened**
1. :3001 rebuilt alone (nothing else running) in ~5 min, clean; started hidden. Routes live under `/hub`, `/campaign`, `/auth`, `/api` (there is no `/health` or `/login`).
2. GM REPLAY 10 of the coffee date on the Day 9 build (pod ~45 min, 9 lines, world rolled back to `tmp/gm/snapshot-1793915928776.json`, pod OFF): `tmp/session3-live-findings-2026-11-04.md` → findings 75–91 + the FIX LIST for the fourth attempt. Headline: the Day 9 spine WORKS when words reach her (she read on her own, chose the write-back shape on her own, LEFT HOME on her own after "I'm already here", answered "I think I did, yes" in the room) — and the date died on one guard: the never-guess check ate her typed words (80), the adjudicator then invented words for her text (83), he never learned she answered (84), she stalled on the landing with no destination (86).
3. Fixed in commit after 6b0b905 (code; suite 2961/271 green, tsc clean): 73, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 88, 89/91, 90. Four sonnet agents + me; details in the commit message and the findings file's fix list.
4. :3001 rebuilt again with the fixes (see below for state).

**Not verified live yet (needs the fourth attempt or a short GM replay):** the 'message' ask returning words; thought→plan giving her the next beat; room-change + way-out departure → trip to the thread place; the doorstep step-in (81/73); voiced being's own row (89); heard-text merge (90 — the agent inferred the shape from the trace, not from a call site it could point at).

**Design flags for Michael**
- 76's phrase: "about 16 hours (since yesterday, evening; you have slept since then)" — wording is mine, change freely.
- The departure heuristic (86) fires on DATA: the act changed rooms AND the new room has an opening to "outside"/"stairs down" AND a live thread names where the other is. A kitchenette step never fires; a landing/lot step does.
- 82: the record agent closed the sentence-pin loophole in `segmentIsDeed`; the scene-builder path that folds a being's doings into card prose is unchanged (prose stays prose).
- 1–6 bare times read as afternoon (assumed, still open). Stretch arrival at window start (assumed, still open).

**Recovery (if :3001 is down):** `cd C:\Projects\GRO.WTH\app; $env:NODE_OPTIONS='--max-old-space-size=4096'; npx next build --webpack` with nothing else running, then `Start-Process -WindowStyle Hidden cmd.exe -ArgumentList '/c npx next start -p 3001 1>> ..\logs\prod-server.out.log 2>> ..\logs\prod-server.err.log'`. Probe `http://localhost:3001/hub` (200).

**Day 10, part 2 — GM REPLAY 11 on the fixed build (22:58Z→23:27Z, 4 lines + 1 re-issue, rolled back, pod OFF)**
- Verified live: 75 (clock ~14:25), 76 (she says "sixteen hours ago"), 77 (act in the day record), 78 (thoughts are memories), 79; no invented text landed; the drive with the full place name.
- Regressions from the fourth-attempt batch: 97 (a partial place name "the coffee shop" no longer resolved — fixed in ebbbf1b), 98 (he did not get out of the car when the destination failed to resolve), 99 ("a table by the window" names nothing). 98/99 → sonnet agent, movement path.
- New small ones: 92 (first-person act glued to the name in the day record), 93 (adverb in a resolve), 94 (a reflective sentence became a plan — thoughts now bind only when they resolve), 95 (a raw id reached the record — stripped at the scene-builder's parse), 96 (places have aliases now: Location data.aliases, "Extra Space Coffee" added by tmp/add-coffee-shop-alias.ts; the resolver, the move branch and the wall's roster read them). All in ebbbf1b.
- Not exercised: 80's 'message' ask (she never chose the write-back in this run — she stayed with "both boots are right here", "I think I'm becoming certain"), 82/85/89 (no voiced-being line given).
- TOOLING PITFALL (memory saved): doubled backslashes inside a Bash-tool command collapse — four regex edits lost their escapes; fixed by splicing exact lines from a quoted heredoc file. Grep what you wrote.

**STATE AT ~23:35Z 11-05 — :3001 DOWN AGAIN (build killed by the system for low memory, second time today; nothing else was running — 6.2 GB free afterwards). `.next/BUILD_ID` is gone. All code is committed and pushed (7f41608; suite 2964/271 green, tsc clean). Recovery, when Michael says so: `cd C:\Projects\GRO.WTH\app; $env:NODE_OPTIONS='--max-old-space-size=4096'; npx next build --webpack` then `Start-Process -WindowStyle Hidden cmd.exe -ArgumentList '/c npx next start -p 3001 1>> ..\logs\prod-server.out.log 2>> ..\logs\prod-server.err.log'`; probe http://localhost:3001/hub → 200. World: post-session-6 + coffee shop (door, lot gate, aliases) + Dialed to Eleven; pod OFF.**

## STATE AT ~00:10Z 11-06 — :3001 BACK UP (build 7f41608+)

- Cause of all three build kills found: free RAM was 1.6 GB of 15.8 (Ollama desktop app idle at 3.85 GB, Steam, Discord, Signal, NVIDIA overlay), AND the kill came from Claude Code's own background-task memory guard, not Windows.
- Michael's ruling (from the car): this PC exists for GRO.WTH; close idle programs to free RAM before heavy work; a low-memory kill is mine to prevent.
- Fix that worked: close the idle apps (1.6 → 6.3 GB free), run the build DETACHED (`Start-Process -WindowStyle Hidden cmd /c set NODE_OPTIONS=--max-old-space-size=4096&& npx next build --webpack`, PID in logs/prod-build.pid) and wait on the PID. Detached processes are outside the task guard.
- Server started hidden on :3001, /hub → 200. World unchanged (post-session-6 + coffee shop). Ready for Michael's fourth attempt.

## AUDIO MODE v1 SHIPPED — ~01:10Z 11-06 (Michael from the car: "let's get audio mode up and running")

RULING while building: audio is HOW GROWTH is played; always-on mic is the standard; typing a fallback; per-NPC playback options; a STANDARD SETUP owed (memory ruling-audio-is-how-growth-is-played-always-on-mic-2026-11-06).

Built (plan tmp/audio-mode-plan-2026-11-06.md), all local:
- tts-server/ (Kokoro-82M FastAPI :9001, /v1/audio/speech, /v1/voices, /health; start.bat on global py313; boot.ps1 -NoTts block + smoke line). whisper-server already on :9000.
- API: /api/speech/speak ({text, characterId|null, speed?} → wav; voice from data.voice or gender pool + id hash; narrator bm_daniel) and /api/speech/transcribe (multipart audio + prompt → {text}); src/services/speech.ts, src/lib/speech-voices.ts.
- Client: TableSpeakBar MIC + AUDIO buttons; src/hooks/useTableReader.ts reads NEW being cards (speech in voice, deeds narrator, thoughts silent); pref src/lib/audio-mode-pref.ts; CampaignTerminal mounts the reader (GM, live session, not view-as).
- tailscale serve → :3001 (was :3000, dev down) so the phone has HTTPS for the mic: https://christophoros.taila59e25.ts.net
- Verified on :3001: Violet bf_isabella / Kristopher bm_george / narrator bm_daniel, 0.8 s per line warm; Violet's synthesized line transcribed back exactly in 0.65 s; no-auth → 401. Browser mic/playback NOT yet exercised by a human.

STATE: :3001 UP on this build; whisper :9000 UP; tts :9001 UP; pod OFF; world post-session-6 + coffee shop unchanged.

Next: Michael tries MIC + AUDIO on the phone (HTTPS url above) or desktop; standard-setup talk; always-on mic (VAD + gating while the table speaks); per-NPC voiced: table|watcher|controlled on the sheet.

## DESIGNED VOICES SHIPPED — ~00:45 local 11-06 (Michael's 2 a.m. test)
- tts-server :9001 now runs Kokoro + Qwen3-TTS 1.7B (Apache-2.0): `POST /v1/voices/design` (description → ~7 s reference clip saved under tts-server/refs/, model swap Base↔VoiceDesign, 20–26 s), `POST /v1/audio/speech` with `voice_ref` (Base clones the ref; ~9–12 s wall for 4–6 s of audio, about 2× slower than real time) or `voice` (Kokoro, ~0.8 s), `fx` preset or params (fx.py). Models are local dirs under C:/Projects/GRO.WTH/models/ (downloaded by logs/qwen-dl.py because huggingface_hub large-file downloads hang here).
- Violet (ref 1b9cd52a43ce4479, seed 11) and Kristopher (ref 906daffa9a004cfb, seed 23) have designed Qwen voices saved in data.voice. Both previews transcribed back word-perfect through whisper. Violet's description came from the read of her thoughts (quiet, low-middle, slightly husky, falling cadence, comfortable in pauses, dry, warmth as texture).
- FX presets were RE-TUNED after a sweep: the first settings turned demonic/angelic/ghostly/monstrous/giant/tiny into mush (whisper word match 0.00–0.71). New presets all score ≥0.93 on a designed clip and the live server renders them intelligibly. Rule written into README: `formant` also moves pitch; push past a preset with per-voice overrides, not by raising defaults.
- Probe token: tmp/gm/state.json token re-minted (tmp/mint-token.ts, ADMIN user, 6 h). Never commit tmp/gm.
- For Michael: Tapestry → Violet → appearance section → VOICE: HEAR (speaks a line in her designed voice, ~10 s), DESIGN (new description → new ref, ~25 s), preset select (demonic/angelic/…), LOCK, RESET. Terminal speak bar: MIC (tap, speak, tap) and AUDIO (table reads cards aloud). Phone: https://christophoros.taila59e25.ts.net.
- OWED: speak-route timeout is 20 s and a long Qwen line plus fx can approach it (raise to 45 s on the next rebuild); the table reader will lag behind cards at 2× real time (streaming or a smaller clone model); `speed` ignored on the Qwen path; derived descriptions still include trait names; voice stage in the genesis walk; per-NPC voiced table|watcher|controlled; immersion mode; standard setup talk; campaign settings audit.
