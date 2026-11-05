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
