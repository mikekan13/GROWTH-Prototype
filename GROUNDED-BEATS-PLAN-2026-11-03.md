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

## Progress

- **Day 1 (2026-11-03, evening).** The table test exists: `app/table-test/` — `transcript.ts` (the shape), `asserts.ts` (A1 absent thing · A2 still going · A3 session-bound · A4 no placeholder · A5 no deed · A6 unheld use withheld · A7 the Watcher's line stands · A8 timing · A9 cloud budget · A10 no memory in every card · A11 known people only; 12 unit tests), `run.ts` (restores the world, plays a script on :3000, gathers rows + cards + pieces + ledger per line + wall log, asserts, reports to `tmp/table-test/`, rolls back, stops the pod), `scripts/the-call.json` (Michael's 6 lines of session 2 run 2; line 6 expected withheld) and `scripts/the-knock.json` (his 17 lines of session 1; world snapshot still owed). The composer's pieces now ride on every card's row (`payload.pieces`), so the asserts read data, not logs. First baseline run started.
