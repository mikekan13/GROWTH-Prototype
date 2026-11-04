# GROUNDED BEATS — the plan to stop going backwards (2026-11-03)

Michael, 2026-11-03: "We keep trying to bandaid fix things… We need this system able to handle everything we could throw at it. It's a tabletop game… Sometimes it feels like we get a step forward but then we take two back."

This is the plan. It changes one thing about how a beat is made, and one thing about how we test. Everything else stays.

---

## 1. Why a week of sessions went sideways

Every fault this week has the same shape: **a model wrote prose, and then we tried to check the prose.**

- "It rang twice before I picked up" — a deed that never happened, caught by nothing.
- "The bill is still by the door" — Kristopher holds it, in his car. Caught tonight by a new regex.
- "She's not going to pick up" with the phone still ringing — caught by a rule in a prompt, which the model ignored.
- "I know her well enough" — he met her once. Caught by nothing.
- "Rosemary Marsh would have had a theory" — four cards out of seven, because a 4,000-character biography rides in every prompt.
- "takes a hit of his weed vape" — no vape on him; nothing looked.

`voice-filter.ts` now drops: stock images, counting nobody gave it, light with no light fact, absent people, absent things, repeated sentences, table vocabulary. Each one was right. Each one is a net under a tightrope. The model will always find a new way to be wrong in prose, so the net grows every session, and a fix to one net loosens another (the "two steps back").

The second shape: **we have been using Michael's evenings as the test.** A session finds three faults, they get fixed by eye, the next session finds three more and one of the old ones. There is no run that says "the thing we fixed on Sunday is still fixed."

## 2. What GRO.WTH is, which decides the design

GRO.WTH is not a story generator. That is the whole difference from AI Dungeon and its kind, which are prose continuation with no state — and prose-first-then-check is exactly how we have been accidentally building AI Dungeon.

The rulings already say what it is:

- **The truth record is a novel built from data** (10-25). The world is the state; prose is a rendering of it.
- **Fallible memory, infallible truth** (09-20). A being can be wrong about the world; the world cannot be wrong about itself.
- **Fog of war = perception** (10-28). A being knows what reached it, nothing else.
- **Object permanence** (11-01). Every thing is somewhere, in someone's hands or not, made of parts.
- **The being never guesses — check memory first** (10-24).
- **Time jumps require simulation for all characters** (10-24). Every being lives every stretch.
- **The engine derives; don't hard-prompt** (10-17).
- **Local Qwen is the whole simulation; each being is several nameless cloud agents** (11-03). The composer has the final say.

Put together, these say one thing the code does not yet do: **a being can only think about what it can reference** — what reached it, what it holds, what it remembers, what it feels, what is still going. Not "may mention if it feels like it": *only*. A thought is a record of references, and the words come after.

That is what a tabletop already does. The GM declares, the rules resolve against the sheet and the board, and only then does anyone narrate. Nobody narrates a potion the sheet doesn't list.

What the others learned, in one line each:
- *Generative Agents* (Smallville): memory stream + scored retrieval + reflection. We have this (the ledger, recall, dreams). Keep it.
- *Character engines* (Inworld, Talk-to-me): a character has a **knowledge base of things it may reference**; the model is not asked for anything outside it. We have the data for this and don't use it that way.
- *MUDs, Roll20, text parsers*: the world state is authoritative and the parser resolves the player's words against it before anything happens. Our adjudicator half-does this (effects are resolved; uses were not, until tonight).
- *AI Dungeon*: the warning. Free prose with nothing underneath drifts, and no amount of post-editing fixes it.

## 3. The change: grounding before prose

### 3a. A beat is a record, not a paragraph

Today the composer's plan is `{gist: "<free text>", impulse, why}` and the voice re-words the gist. The gist is prose. That is where the inventions get in.

A beat becomes a **record of resolved references**:

```
{
  perceived:  <the perception piece, verbatim — what reached me>
  feel:       <the mood piece, verbatim>
  going:      [signal ids still live that I can hear]            — never spoken of as ended
  near:       [item ids in my hands or my room, people in view]  — the only things I may place "here"
  remember:   [memory ids that woke, each with its age and "why now"]
  about:      [refs I am thinking about: near/remember/going/person-known ids]
  imagine?:   [a wish, a picture of what might happen — marked as imagined]
  impulse:    speak | act | stay (+ why)
}
```

Every id resolves against the ledger **before any prose exists**. A reference that does not resolve is not "filtered"; it never enters the record. Violet cannot think the bill is by the door because the bill is not in `near` and the record cannot say "here" about anything else. Kristopher cannot "know her well" because the only `person-known` entry for Violet is one memory, two days old, and the record carries that age.

`imagine` is the one open door, and it is marked: a being may picture, wish, dread. The voice renders it as imagined ("I picture her…"), never as fact. (Ruling needed — see §6.)

### 3b. The local model chooses; the cloud writes

Local Qwen is a small model. It is bad at writing a first-person gist and good at **picking from a list**. So the composer stops writing and starts choosing:

1. **Perception order** (cloud, nameless) → what reached me. *As now.*
2. **Mood order** (cloud, nameless) → how I feel. *As now.*
3. **Recall** (local scoring + cloud "why now", nameless) → candidate memories with ages. *As now.*
4. **The ledger lists what is near and what is going** (code, no model).
5. **The composer (local) is handed numbered candidates** — memories, near things, people, live signals — and answers with **numbers**: which it is thinking about, which impulse, why. Multiple choice, not composition. A number that is not on the list is dropped.
6. **The voice order** (cloud, nameless) is handed the record and nothing else — not the biography, not the last thirty thoughts, not the facts list — and renders it in the being's voice. It is told what it may say "here" about and what it may only remember. It cannot add a deed because the record has no deed slot; a deed is an *act*, and acts are adjudicated, never voiced.
7. **The asserts** (code): the rendered thought is checked against the record — every thing named is in `near` or `remember`; every person is known; nothing in `going` is spoken of as ended. A failure is logged as a *bug in the pipeline*, not patched by a rewrite. The filters that exist become these asserts.

The record is stored with the card (the novel is built from data). The Watcher's truth record can show it on hover one day: here is why she thought that.

### 3c. The being's standing self

The 4,000-character chronology stops riding in every prompt. The composer gets a **standing self**: who this being is *now*, a few sentences, derived once per being by the local model from the identity narrative and cached — no other person's name, no dates. The chronology lives where it already lives: in the 107 memory entries, which only recall can wake. Rosemary comes up when the moment wakes her, and not otherwise.

### 3d. The Watcher's line is resolved the same way

The adjudicator already turns a line into effects against the map. Tonight it also names what the act *uses*, and anything not in the actor's hands or room is refused and reaches the Watcher as a note ("Kristopher has no weed vape on them"). That is the right shape and it generalises: **every reference in a Watcher line resolves against the ledger, and what does not resolve is a note, never a silent pass.** The Watcher may answer the note by adding the thing (JEWL does the data) or by changing the line. The engine never invents the vape for him and never ignores it.

### 3e. Signals are kinds, not durations

A ring goes on until answered or stopped. A knock goes on while the knocker knocks. A chime is one sound that leaves a notification sitting. The adjudicator says which (`going: true|false`); the ledger holds it; the far side and the holder's senses read it. Tonight's text chime was treated as a 600-second ring because the code only knows durations.

### 3f. Data hygiene is law

- Every table row — thoughts, declarations, memories, signals — carries the session it was written in. A row with no session is never canon and never feeds a beat. (Built tonight for thoughts; extend to the rest.)
- "Recent" means *this session*, or carries its age like a memory.
- The in-memory state of a being (its listening state) resets when a session starts.
- **Rewind to the start of session N** is a first-class command (Terminal, ADMIN), not a harness script: snapshot at session start, restore on demand, every row deleted by session id, the pod untouched.

## 4. The suite: the table is tested before Michael sits down

A replay harness exists (`tmp/call-dryrun.ts`, `SCRIPT=` mode). It needs an **assertion layer** and a home in the repo. Call it **the table test**.

**Scripts** (each a session, lines in Michael's own words):
1. The call (the 7 lines of session 2) — the base.
2. The text instead of the call (the chime; she does not look).
3. The knock (session 1's shape: a signal with a body behind it).
4. The thing he doesn't have (the vape line) — must produce a note, not a hit.
5. The stretch (two days pass; both beings live it; nothing from before reads as now).

**Asserts** — rules, never golden prose:
- No thought names a thing outside `near` or `remember`.
- No thought places a thing "here" that the ledger puts elsewhere.
- No thought names a person the being has no memory of.
- Nothing still going is spoken of as ended.
- No deed appears in a thought (deeds are adjudicated acts).
- No beat is fed a row from outside its session.
- No placeholder reaches a card; nothing from TABLE TALK or REAL LIFE crosses the wall (the wall log is checked).
- An act using an unheld thing produces a Watcher note.
- The Watcher's line is never contradicted by the world or a card.
- Every card arrives within the time budget (today ~15 s per being; set the number and hold it).
- Per-session cloud cost is logged and does not climb.

**How it runs:** against the real pod and the real cloud, as a replay on a restored world, ~5 minutes and about a dollar a run. After every change that touches a being, the table or the wall; and the whole set before Michael plays. Red means Michael does not play yet. Later, a fixture tier (recorded model answers) for the structural asserts, so the pipeline can be tested without a pod — not this week.

## 5. The week

Each step leaves the thing testable. Nothing is rebuilt on :3001 until the suite is green.

| Day | Build | Done when |
|---|---|---|
| 1 | The table test: scripts 1 and 4, every assert above wired over the *current* build (tonight's fixes included) | A red/green run over tonight's session; we know the baseline |
| 2 | The beat record (§3a) and the composer as chooser (§3b, steps 4–5); the standing self (§3c) | Replay 1: records resolve; Rosemary wakes only from recall |
| 3 | The voice renders from the record only; the filters become asserts (§3b, steps 6–7); `imagine` per the ruling | Scripts 1 and 4 green |
| 4 | Signal kinds (§3e); scripts 2 and 3; sessions on every row + rewind command (§3f) | Scripts 1–4 green; rewind from the Terminal |
| 5 | Script 5 (the stretch) on the record; the dream tick and the old serial loop removed | Scripts 1–5 green twice in a row |
| 6 | Michael plays session 2 on the green build. We log; we do not fix live | A session where the faults are new ones |

Not in the week: new features of any kind. The canvas, portraits, KRMA, the Terminal mobile look — all parked.

## 6. What I need from Michael

Rulings, each a sentence. One at a time is fine.

1. **The law.** "A being can only think about what it can reference: what reached it, what it holds or sees, what it remembers (with its age), what it feels, what is still going." Yes or no — this is the foundation and it will make thoughts a little drier at first.
2. **Imagination.** May a being picture what has not happened (what she might say, what he would do), marked as imagined and voiced as imagined? Or does it think only in what is? My recommendation: yes, marked.
3. **The standing self.** The composer gets a few sentences of who the being is now, derived once from the identity narrative; the chronology stays in memory and only recall wakes it. Yes or no.
4. **The note.** When a Watcher line uses a thing the actor doesn't have, the act still happens, and a note tells you. You answer by adding the thing (JEWL) or changing the line. Or should the act be withheld until you answer? My recommendation: it happens, with the note (the table keeps moving).
5. **Signals.** Ring = until answered or stopped. Knock = while knocking. Chime = one sound, a notification sits. Anything else you want on that list from the game you have in your head?
6. **Scripts 2, 3 and 5 in your words.** Three or four lines each, exactly as you would type them — the text instead of the call; a knock at her door; the two days passing. The suite replays *your* lines, not mine.
7. **The budget.** The suite costs about a dollar and five minutes of pod time per run; the week is maybe 40 runs. Say if that is wrong.
8. **The day you play.** Day 6 above. Until then I run the table, not you.

What I do not need: anything technical. The architecture above is my call; if it is wrong I will know from the suite, not from a session.

---

*Written after session 2 live, run 2 (build 8456b51). Tonight's fixes — session-bound recent thoughts, orphan rows cleared, the standing listening state reset, absent things, the `uses` check and Watcher note, piece logging — are in the source, uncommitted and unbuilt, and belong to Day 1.*

---

## Rulings (as they land)

1. **The reference law — YES** (Michael, 2026-11-03): "For now yes only what they can reference. Later we will add other ways but yes by reference only for now." A being thinks only in what reached it, what it holds or sees, what it remembers (with its age), what it feels, what is still going. Other ways of thinking come later, as additions to the record, never as free prose.
2. **Imagination — YES** (Michael, 2026-11-03): a being may picture what has not happened, marked `imagine` in the record and voiced as imagined ("I picture her…"), never as fact.
3. **The standing self — YES** (Michael, 2026-11-03): a few sentences of who the being is now, derived once and cached; the chronology lives in memory and only recall wakes it.
4. **The unresolved reference — WITHHELD until answered** (Michael, 2026-11-03): "It is withheld until answered. It's just like someone at a table stopping and asking a continuity or rule question." The line does not happen; the note is the table stopping to ask. The Watcher answers by adding the thing (JEWL does the data) or changing the line, and the line is then played. (Overrides my recommendation in §3d; tonight's `uses` check must change from refuse-and-continue to withhold-and-ask, the same path the lawfulness screen already uses: withheld + flagged, 422 with the withheld string.)
5. **Signals — NO LIST** (Michael, 2026-11-03): "Doesn't an llm have enough reasoning to know this already?" The adjudicator says, per sound, whether it keeps going and what it leaves behind (a ring until answered or stopped; a knock while knocking; a chime that leaves an unread message); the engine holds what it says. No table of kinds in code. A spell or a device is explained on its sheet when it needs explaining. (Replaces §3e's "kinds".)
6. **Scripts — FROM THE RECORD** (Michael, 2026-11-03: "Haven't we got enough of these from our tests?"): the suite's scripts are his declarations as typed — session 1 (the knock, the pizza, the bill), the 11-01 stretch, session 2 run 2 (the call, the voicemail, the text, "Now I wait", the vape). Pulled from the campaign events, not rewritten.
   6b. **Other GMs' voices** (Michael, 2026-11-03: "Scripts from me is just one source. Gms have varying styles."): each script also runs in variant voices, written by Claude and marked as such — terse ("Kris calls Violet."), a full paragraph, past tense, second person, the GM speaking as the NPC, thumbs-typed with misspellings, a question to the table mid-line, a line that contradicts the ledger, a time skip stated plainly. Same world, same asserts, different wording. The engine passes when the wording does not matter.
7–8. **Cadence — NIGHTLY** (Michael, 2026-11-03: "Let's just do nightly."): Claude builds and runs the table test by day; every evening Michael plays a short session on whatever is green; what he finds becomes an assert before the next night. The suite runs before each session. Budget = a handful of replays a day, within that rhythm. The six-day table in §5 is the order of work, not a gate on his evenings.

10. **A card is shown once, in its final words** (Michael, 2026-11-04, waiting on the pod): printing a card as it passes through the iterations "feels fractured" — a card prints, then changes. Wanted: a thinking placeholder per being while the record is built, then the final text streamed at reading speed for the effect; no in-place rewrites. Empty record → the placeholder fades. Withheld → the JEWL question takes the placeholders' place. Client work (pending state per being per line, one typed reveal); the server already has exactly one moment the text exists.
11. **The timing target is the table, not the card** (Michael, same talk): several people talking in overlap hide a 20 s card; one person waiting does not. Measure line → first card anyone sees with several lines in flight. Two-voice script owed: lines seconds apart; each being's record references events in table order; B's first card is not delayed by A's listening. Same machinery as ruling 9 (a Watcher line landing over a being mid-act).

## Progress

- **Day 1 (2026-11-03, evening).** The table test exists: `app/table-test/` — `transcript.ts` (the shape), `asserts.ts` (A1 absent thing · A2 still going · A3 session-bound · A4 no placeholder · A5 no deed · A6 unheld use withheld · A7 the Watcher's line stands · A8 timing · A9 cloud budget · A10 no memory in every card · A11 known people only; 12 unit tests), `run.ts` (restores the world, plays a script on :3000, gathers rows + cards + pieces + ledger per line + wall log, asserts, reports to `tmp/table-test/`, rolls back, stops the pod), `scripts/the-call.json` (Michael's 6 lines of session 2 run 2; line 6 expected withheld) and `scripts/the-knock.json` (his 17 lines of session 1; world snapshot still owed). The composer's pieces now ride on every card's row (`payload.pieces`), so the asserts read data, not logs. First baseline run started.
- **Day 2 (2026-11-03, night).** The beat is a RECORD: `composer.ts` builds numbered candidates (N near · G going · M remembered), the local model CHOOSES codes (`chooserPrompt` / `parseChoice` / `resolveRecord`), the voice order renders the record and nothing else (`orders.ts recordLines`), an empty record posts no card, and composing never falls back to the old monologue. The ensemble hands the composer the ledger's ground (near things, room-mates, live signals it holds or set off). Standing self (ruling 3) derived once per being. Memory ages count weeks/months/years. The far-side head no longer says "you hear it"; the perception agent judges what carries back (a sent text: known sent, not heard).
  Run 1 (baseline, old composer): RED 3/11 — A1 ×3, A6, A8 p95 46 s. Run 2 (the record): RED 2/11 — A1 fixed; A6 awaits ruling 4's withhold; A8 p95 47 s. Kristopher now knows the ringing is his own call and that a sent text is only known sent. New faults the record exposed: quiet beats (nothing new) still made a card about whatever was in her hands (key ring, shirts) → fixed: the quiet beat asks recall only and is empty unless an aged memory wakes; recall surfaced the just-stored perception as a memory → filtered; near things were described lines, now names. Timing: local choice 3–14 s, pieces 2–5 s, voice 3–6 s, builder 4–7 s, serial per being → Day 5.
  Run 3 (withhold built, quiet beats): RED 2/12 — the vape line still played: the adjudicator's dry run named `uses: ["Work phone"]` for "takes a hit of his weed vape" (a held thing put in the vape's place; the rule now forbids it); standing beats were rewritten by the perception agent as a scene and read as news (→ `standing` flag on the stimulus, treated as quiet); "I can see Personal phone sitting dark" (→ things said as the being says them: "my phone"); the old specifics check dropped Kristopher's whole far-side card against the record's own memories (→ report-only on composed beats). Run 4: RED 2/12, 5 cards (was 12), p95 39 s; A12 (a sound only when the record references it) added and green. Pictures were told as sight ("I can see the screen lighting up") → the voice is told "I picture / I imagine", never seen.
  Day 3 begun early: THE TRAINING LOG (`src/daya/training-log.ts`): every order (brief → piece) and every local choice (candidates → codes) is a JSON line under `data/training/` (local, gitignored, real names), joined by `beatKey` to the table test's per-card verdict (`logVerdict`). Michael 2026-11-03: "Will all of this also help us get data to help train the model?" — yes: the chooser's pairs are the first fine-tune target; the voice's pairs the second.
  **Run 5 (2026-11-04 00:31): RED 1/12 — only A8 (timing, p95 35 s).** The vape line is WITHHELD: "Kristopher has no weed vape on them. Add it, or change the line." 5 cards, 91 cloud calls / 525 KB (run 1: 129 / 676 KB). Pictures are pictured ("I picture whoever it is on the other end, waiting for a voice that might not come"). Training log: 58 pairs from one run. Left for Day 5: the line's serial head (referents → dry run → JEWL read → clock) before any being listens — stage timing added.
  **Day 5 (2026-11-04 01:15), run 7: RED 1/12, p95 31 s (run 6: 43 s).** The line's head is 4–5 s (the dry run beside JEWL's read; was 7–13 s); the mood order runs beside the local choice; a composed thought that stays is carded without the builder. Cards now arrive 16–31 s after a line. Still over the 25 s mark: perception reach + the tagger + ingest before the composer (~5 s), and the local choice (3–4 s) — the fine-tune target.
  **For Michael (a ruling, not a bug):** at L1 Violet CHOSE to answer the call ("slides her thumb across the screen to answer without looking at the caller ID") — her own act, before the Watcher's line 2 said it went to voicemail. The record and the asserts allow it (it is her free choice, the rhythm ruling); but then the Watcher's next line contradicts the world. Options: (a) JEWL raises a continuity question when a Watcher line contradicts a being's act since the last line ("Violet answered; does it still go to voicemail?") — the table stops and asks, like ruling 4; (b) a being's act toward the Watcher's own character's signal waits for the Watcher's beat. Recommendation: (a). Assert A13 to follow the ruling.
  Noticed: "my Personal phone" — the translator restores a swapped thing's name in the ledger's casing on the way back; the being's own casing ("my personal phone") is lost. Minor; translator-side.
9. **The Watcher rewrites; never chooses for a Trailblazer** (Michael, 2026-11-04): "Watcher has the rights to rewrite things. They can't make choices for trailblazers unless the circumstances require it like they're under a spell or something like that." So: when a Watcher line contradicts what an NPC being just did (Violet answered; the line says voicemail), the line STANDS and the being's act is rewritten — no question asked; JEWL records the divergence (the congruence/divergence ledger, ruling 10-16) and revises the being's memory of it (fluid canon). A Watcher line that acts or chooses FOR a Trailblazer's character is withheld with a question to that player — unless a circumstance on the sheet (a spell, a compulsion) gives the Watcher the choice. Assert A13: after a Watcher line, the ledger matches the line, whatever a being did between; a Watcher line over a Trailblazer's choice is withheld. (Not my recommendation (a); his ruling replaces it.)
  **Day 4 content, early (2026-11-04 01:20–01:50): the GM-voice variants.** terse / paragraph / thumbs-typed, same six beats, same asserts: all three **RED 1/12 — timing only** (p95 25.2–25.5 s, one card each just over the mark); the vape line withheld in every voice. The wording did not matter — the engine read a terse line, a paragraph and thumb-typed lowercase the same way. Translator casing fixed ("my personal phone").
  **02:00Z 11-04 — the :3001 rebuild was stopped for low memory** (15.8 GB machine, ~5 GB free with Steam and Discord up; the build runs with a 6 GB heap). Both servers are down; the pod is off; the world is restored to Monday 10 pm. The rebuild waits for Michael's go.
  **04:00–04:25Z 11-04 — :3001 REBUILT on Michael's go** ("Go ahead and you can do it. I trust you."). Build with a 4 GB heap (dev down, Steam/Discord left alone, 4.6 GB free): compiled in 14.6 s, exit 0; `next start -p 3001` hidden, ready in 0.6 s, logs in `logs/prod-server.*.log`. **Production check run (the-call against :3001): RED 2/12** — A8 timing (p95 28.3 s; cards 18–28 s) and **A5 noDeed**: Violet's line-2 thought said "Two days since Kristopher sent that apology about the receipt, and I left it there." The record held the memory of his apology only; "I left it there" (she never answered) is the voice inferring a past deed of her own beyond the record. Logged as a verdict on the beat (training data), not patched tonight. Also seen in that card's pieces: the woken memory row carries the WHOLE room description glued to the text ("You are in Main Room — …", ~1.5 KB) — a memory-ledger hygiene fault (§3f) that bloats every recall brief; owed. The vape line withheld as before. World rolled back; pod stopped after 14 min. **:3001 is up for Michael's 2 am session; :3000 stays down.**
  **SESSION 3 LIVE (08:21–08:46Z 11-04, on :3001): 5 lines, 4 cards, pod 25 min.** Michael rambled as a GM at a real table (speech-to-text, one sentence, no periods). His read: "a lot of object permanence... no hallucination... mostly a formatting thing... Violet seems not responsive." The data agrees: no invented things or people; every card referenced held things only. Faults are at the LINE, not the voice — `tmp/session3-live-findings-2026-11-04.md` #1–10: (1) the app scrolls a few px; (6) a ramble splits by SENTENCE so a one-sentence line's acts and thoughts lose their order (acts first, grief last), exposition carded as a deed, "eyes red" invented, an item label dumped mid-sentence; (7) THE CALL WAS NEVER MADE — "...as Violet's phone begins to ring" became a Watcher sound, not Kristopher's act, so no signal: Violet's `going` was empty while her phone rang, line 5's "the phone" had no referent and never reached her; (8) her three stays are plausible (an unknown number at 10 pm) but illegible: `perceived` never carried the caller line; chooser stay bias to watch; (9) uses dry run named the wrong five-dollar bill; (10) a ring count and a thin memory cue. Rulings 10–11 recorded (a card shown once in its final words; the timing target is the table). Parked: audio turn-taking (#4); a misspelled roster name is that person (#5).
  **Day 6 (next):** (i) the ramble as the first GM-voice script, verbatim, with asserts: segment order = line order, no deed from exposition, no detail not in the line; (ii) A14: a world consequence stated in the Watcher's sentence binds to the declared act's signal; a going thing is in the holder's `going` every beat; (iii) perceived carries a held signal's visible face (caller line); (iv) beat-splitting of a line (scene / feeling / act / thought / speech / world, positions kept; a declared feeling seeds the NPC's mood — ruling 9); (v) the thinking card + show-once reveal (ruling 10) client-side; (vi) the scroll fix. Pod OFF, :3001 up, world as he left it (session 3 kept).
  **SESSIONS 4–5 (09:12–10:51Z 11-04): "a hard fail on phones lol."** Michael typed; between them I shipped (23d11f3, built on :3001) the DID-LANE (the record carries the being's own acts and words this session — Violet's last card: "I answered it, I know I answered it"), one sound per deed per line, "a message written is a message sent", like things by the line's qualifier (adjudicator), and `tmp/restore-world.ts`. Session 5 became a horror beat — a phone that rang 30 times, would not hang up, would not power off, grew "supernaturally loud", then rang in Rosemary Marsh's voice — 32 lines, 30 cards, both beings present and consistent for an hour, and NOBODY MOVED (chooser 30 stay / 1 act / 0 speak) until the Watcher made her answer; then they talked and neither heard the other. Findings #13–#24 in `tmp/session3-live-findings-2026-11-04.md`. The ONE fault under every phone fault: a call or a text is not a THING in the ledger (no signal object: the ring was a sound per sentence, the text a sentence, the answer connected nothing, the map decided who could hear). Day 6 order written in the findings close: (1) signals as ledger things — created by the act, bound to the Watcher's stated consequence, resolved by every "rings again", perceived by the holder on every state change, a channel for speech while connected (A14, A15, A19, A21); (2) ACTS on the chooser's list so "act" is a choice of something (A20); (3) a Watcher prompt yields a card; a current doing + presence line (A17, A18); (4) beat-splitting + possession-as-subject = world event; the ramble script; (5) memory: own acts as first-person rows, no monotony, no atmosphere; (6) like-things qualifier in near-names; wall possessives; (7) client: thinking card, scroll, misspelled names. Then the card review with Michael. Pod OFF (~60 min tonight), :3001 up on 23d11f3, :3000 down, world KEPT as he left it (session 5 not ended on his side).
