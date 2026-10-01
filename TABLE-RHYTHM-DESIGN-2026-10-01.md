# TABLE RHYTHM DESIGN — 2026-10-01

Rulings from Mike, 2026-10-01, after the latency diagnosis of the 09-26 being loop.
Authority: Mike > this doc > MEMORY-DESIGN-2026-09-23.md > REALITY-SIM-DESIGN-2026-09-02.md.
Read before touching the table path, the being loop, entity control, the player interface, or canvas visibility.

## 0. The bar

"It has to be faster than people at playing or none of this works." A person at the table answers in
1–3 s and starts forming the answer while the GM is still talking. Target: first words ≤ 2 s and the
full line ≤ 4 s, measured from the moment the GM stops talking at the ask. Serial was never the plan.

Measured 09-26 (one warm turn, simple narration + bridge): ~50 s, of which ~42 s was the self-hosted
lane generating ~750 tokens at ~18 tok/s (ENFORCE_EAGER=true, MAX_MODEL_LEN 131072, GPU_MEM_UTIL 0.90
on an 80 GB H100/A100/H200 serverless worker). Cloud calls were fine. The lane and the serial pipeline
are the problem, not the hardware.

## 1. The table's four beats are the loop's clock

1. **GM narrates** (pre-written prompts or improv; 10–60 s of speech). Every entity present LISTENS:
   each whisper chunk → mirror → ingest → recall cues → felt state. This is the reflection phase: the
   monologue, the soul sim, JEWL's narration read, bridges, memory renders all happen HERE, while the GM
   holds the floor. Nothing in this beat is on a clock.
2. **GM hands the turn to the party** ("what do you do?", a name, a pause). THE ONLY LATENCY-CRITICAL
   MOMENT. Everything is precomputed; one short answering call per entity produces one Say/Do, streamed.
   Direct address ("Ruth: Violet, what did you see?") is also an ask and fires at the same speed.
3. **GM calls checks / the sim resolves.** Dice server-side, instant. Adjudicator + effort already exist.
4. **GM narrates results.** Body-inward sensation + outcome memory run as perception. Back to 1.

So the being is reflection-THEN-reflex, matched to the GM's rhythm. The monologue precedes speech, as
it should; it is just no longer produced at the moment of the ask.

Proposed default (not yet ruled): beings hold their tongue during beat 1 except on direct address;
interjection is a later feature.

## 2. Ownership is the only flag. Every entity runs the loop.

- **Every entity runs the full sim loop** — owned by a human or not. Perception through its own murky
  mirror, its own fallible memory, its own felt state, its own proposed intent at the ask.
- **Ownership decides who sits in the editor seat.** A human owner realigns their character's proposed
  intent (or lets it ride). The GM edits every unowned entity's proposal (or lets it ride). The GM can
  SEE IN to owned characters (view their mirror); the player's seat is the player's. ADMIN can do anything.
- The rules + simulation decide hard outcomes. The GM decides reactions and overrides. Voicing an NPC in
  prose ("Ruth: …") is an OVERRIDE of what Ruth was about to do; Ruth remembers having said it (the
  existing correction path).
- **Removed as control concepts:** `entityType = PLAYER_CHARACTER` (a PC is a character with an owner);
  `DayaEntity.status` ACTIVE/DORMANT as "is the AI driving". Kind labels stay for mechanics (NPC vs
  CREATURE vs GODHEAD). Status becomes LIVENESS derived from scene proximity (render-distance LOD from
  the reality-sim ruling), never hand-set.
- Consequences: no dead PCs (a quiet/absent player's character still acts in character); blind play is
  the default for everyone; every realignment is individuation signal (proposed vs chosen).

## 3. The planning board

During beat 2 every entity present posts an intent chip: "about to say X" / "about to do Y". The editor
for that entity edits the chip or leaves it. **Commit = the GM's next move** (calling a check or starting
to narrate results). No timer, no confirm button; the table's rhythm closes the beat.

## 4. The mirror is a UI overlay on the canvas

Same pattern as the JEWL overlay with burst-through. Shows, per beat:
- narration: the PERCEIVED scene streaming in sentence by sentence; murk rendered as murk (glitch/gap
  language from the rulebook), never labeled as distortion;
- the recall margin ("you remember…", and failed recalls: "something stirs, nothing you can name");
- felt state as tint and weight on the page, never numbers (powder blue → void);
- who spoke to you: names and spoken lines verbatim (mirror envelope guarantee);
- the ask: the intent chip (the one interactive element during play);
- checks: the roll (GROWTH dice are visible) and then the body-inward sensation.
Never shows: the truth record, other characters' intents, the GM's raw text, fidelity scores.
In-person limit: the player hears the GM with their own ears, so truth leaks past the mirror; there its
value is recall + felt state + chip + the fact that LATER memory is only what was perceived. Full
blindness is remote/async play. Two modes of one surface.

## 5. The player's canvas is the character's memory drawn spatially — fog follows memory

Players see the same canvas OS as the GM, filtered: an object renders only if this character has a
memory trace of it. Current scene crisp; a remembered place at the fidelity it was remembered (faded,
possibly wrong); never-seen places do not exist on screen. **Fog follows memory**: forgetting re-fogs a
place; a low-fidelity memory draws it wrong. The known-to set is DERIVED from memory rows + the mirror
audit (locationId, entities, truthLines), never a separate truth to maintain.
- Who-is-here chips and items become per-viewer (an item never perceived is not on your shelf).
- GM "see in" = pick an entity → the canvas drops to its filter and the overlay shows its stream. One
  toggle, no second interface. The Watcher's unfiltered canvas remains the truth.

## 6. Plumbing (required underneath, not design)

- Worker: ENFORCE_EAGER=false, MAX_MODEL_LEN 32768 (nothing in the loop sends > ~2k tokens),
  GPU_MEM_UTIL 0.85 if graph capture needs headroom. Expect ~3–4× decode.
- A worker that stays hot for the session (keep-warm exists; every serverless hop still costs a few
  hundred ms, so the fast path must make as few as possible).
- Streaming on the answering call. Tagger, bridge forecast, bridge memory render, JEWL's narration read
  all OFF the critical path (concurrent or after). Soul sim = background tick while a session is hot.
- Scene composed ONCE on entering a place; each chunk rendered against it (perceive.ts today re-composes
  the whole scene per stimulus).
- The ask detector = the table-talk classifier Mike already ruled would exist (narration / dialogue+to
  whom / turn-to-party / check-call+to whom / result / OOC). Cheap and fast; it is what tells a being
  when to speak.

## 7. As-built → target gaps

| Area | As built (09-28) | Target |
|---|---|---|
| Loop trigger | `POST /table {message}` on enter | whisper chunk stream; ask detector fires the answer |
| Pipeline | serial: JEWL read → perceive → ingest(tagger) → recall → soul → spirit(monologue+Say) | listen per chunk (perceive/ingest/recall/soul concurrent, JEWL concurrent); answer at the ask (short, streamed) |
| Who runs | `DayaEntity.status='ACTIVE'` (Violet only; NPCs DORMANT, Mike voices them) | every entity in the scene; liveness by location |
| Control | entityType + status + owner | owner = editor seat only |
| Planning | none (being speaks immediately) | intent chips; edit or ride; commit on GM's next move |
| Player view | none | mirror overlay + memory-filtered canvas |
| GM view | TABLE tab chat + truth canvas | + see-in toggle per entity |
| Lane | eager, 128k ctx, ~18 tok/s | graphs, 32k ctx, hot for the session |

## 8. Build order (small, testable units)

- U1 Plumbing: eager off + 32k on the endpoint; measure tok/s warm. **DONE 2026-10-01.** Template
  jh3qgfbp9o: ENFORCE_EAGER=false, MAX_MODEL_LEN=32768, GPU_MEMORY_UTILIZATION=0.85. Measured warm on
  H100 SXM (`scripts/bench-l1-lane.mjs`, streamed): spirit-sized 1k-in/450-out 6.2 s total at 75 tok/s
  decode (was ~18); short spoken line 1k-in/22-out 1.1 s total; TTFT 0.4–1.0 s. Cold start unchanged
  at ~340 s = weights streaming off the network volume; baking weights into the image is the fix
  (separate change, not done).
- U2 Loop restructure: chunk-driven listening, concurrency, ask detector, short streamed answer. Measure
  first-words latency at the ask.
- U3 Ownership rule + liveness + planning board (chips, edit, commit-on-next-move). NPC beings wake up.
- U4 Mirror overlay + known-to filter on the canvas + GM see-in.
