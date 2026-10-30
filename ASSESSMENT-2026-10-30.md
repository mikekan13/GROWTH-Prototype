# GRO.WTH — Whole-project assessment, 30 Oct 2026

Written at Michael's request ("look at it all… anything you would like to contribute… anything missing or wrong"). Read with `docs/LOOSE-ENDS-2026-10-30.md` (the full inventory, 214 items) beside it.

---

## 1. Where we actually are

**Two halves that have never met.**

| Half | Built | Last touched | Played by a human |
|---|---|---|---|
| The platform (auth, campaigns, wizard, KRMA ledger, contracts, forge, Godhead agents, death saves, paperdoll, subscriptions, portraits) | Mar–Jul 2026, M1–M9 roadmap | July (portraits Oct) | Never, outside dev checks |
| The reality simulation (DAYA beings, memory ladder, perception, canon, the table, the live canvas, fog, intentions) | Aug–Oct 2026 | Yesterday | Mike alone, as ADMIN, 11 hello-world runs |

Size: ~100k lines of source, 260 services, 216 API routes, 247 test files (~2,500 tests green), 941 commits over 115 days on a branch named for a July merge. One developer, one tester, one being that has not opened a door in eleven tries.

**What works, verified live:** the seed → page builder, hearing through walls, the standing beat, cards per viewpoint, JEWL's read with a cited stop, the live canvas with no reloads, pathfinding and line of sight, fog of war by sense with last-known, beings walking the map, a lock worked from the inside, the dev pod at $1.29/h, the throttled-lane readout.

**What has never been seen by anyone:** a Trailblazer's screen. `PERCEPTION_FEED` is off by default; Mike's account is ADMIN so even SEEN BY shows the truth; nobody has ever played Kristopher from a Trailblazer seat. The whole perception stack (twelve units, 10-09) has been exercised only by Playwright and dry-runs.

**The roadmap is a diary.** `ROADMAP.md` keeps the M1–M9 milestone plan from July (combat loop, GROvine, Godheads operational, KRMA via subscription, production infra, legal, content) and every one of those milestones is still a stub. Everything since 2 September sits under dated headings on no milestone. The memory directory (352 files) is the real documentation, and only I can read it.

---

## 2. Why Violet does not open the door — now from the code, not a guess

The HW11 log named three causes (dread recall, a prompt that leans to stay, no plan layer). Tracing one beat through the engine adds four more, and they compound:

1. **A knock gives her no turn.** "Kristopher knocks on the door." is narration; `planTableTalk` yields one `hear` beat and no `turn`. She gets an answer turn only if her listen ends `Impulse: speak` or `act`. Her listen is capped at 140 tokens, and a reply that runs long loses its last line, which is the impulse line, which parses as `stay`. So on the beats where she thinks the most she is the least likely to act.
2. **The listening prompt tells her the opposite of a table.** Verbatim: "Nobody is waiting on you; things are still unfolding." and "Do not speak aloud and do not act." At a table everyone is waiting on you. That line was written for the listen-while-narration beat and it governs every listen.
3. **Dread is cue-blind.** `survivalStrength` scores a memory on its own arousal and valence, not on whether the cue touches it. A memory at arousal ≥ 0.7 and valence ≤ −0.3 takes a survival slot on almost any cue, and survival passes at half the threshold. Violet has seven door memories; six are dread or ritual. Her budget is about two slots. The dread always gets one.
4. **Her routine is never due.** `DayaIntention` rows with a cadence ("I order from the same pizza place every day", "I lock the door every time") have no trigger and no time window, so `dueReason` never returns for them, and `settleIntentionsByAct` excludes them. Only the one prospective sentence is ever due: "Tonight, when he knocks, I'm going to give it to him as the tip." It is due right now (window 0.00205–0.00274, clock 0.0022). It surfaces on every beat outside the budget. That is why she says "You can leave the change" through a locked door: the engine hands her the last step of a plan it never gave her the first step of.
5. **The intention deriver over-fires on description.** Her ten rows include "It's solid, the drawers stick in summer" and "The apartment is on the fourth floor and I have to unlock three doors" as PENDING intentions. Noise in the one list that is supposed to carry what she means to do.
6. **Only forward motion is policed.** Never-guess, claim-vs-fact, echo, replay, counting, stock-image, voice filter: all seven guards check what she says or does. None checks `stay`. Under seven filters the safest output is to think and stay, so the system selects for it.
7. **Her pizza memory never says she opens.** "They always knock… another person standing in my doorway, on my terms." The one memory of the most ordinary act of her day records the knock and the doorway and skips the hand on the lock. The data has no opening in it for recall to find.

Her character is not the problem. A woman who orders the same pizza every day opens the door every day, and has for Kristopher six times. The being has no **ordinary competence**: nothing that lets a routine run without deliberation.

---

## 3. What I would contribute (full creativity, as asked)

### 3.1 ORDINARY COMPETENCE = procedural memory, derived, advanced by the engine

Human memory has three stores and DAYA has two. `DayaMemoryEntry` is episodic and semantic (what happened, what is true). There is no **procedural** store: how to do a thing, run below attention. A person does not deliberate the walk to the door. The listen loop deliberates everything, so everything looks like a decision, and every decision under dread plus seven guards is `stay`.

**Proposal — ROUTINES, a third memory kind, with these laws:**

- **Derived, never authored.** A routine comes from a cadence intention the being already has ("every day", "every time", "always"), from the facts, and from the world's own ops. No hand-written step list for the pizza. (Rule: engine derives it, don't hard-prompt.)
- **Steps come from a tiny backward planner over the adjudicator's own ops.** The adjudicator already has `move`, `door`, `take`, `give`, `put`, `sound`, each with preconditions the engine already enforces: `give` needs the same room; `door open` on a locked door needs the lock worked, and a lock leaving the home is worked from inside; `move` needs a path. Goal: *give the tip to the driver.* Backward: give needs same room → the way-out door must be open → it is locked from her side so unlock → she must be at the door → move. The plan `go → unlock → open → take → pay → tip` falls out of the preconditions in no model calls. Any being, any routine, any map. This is the same planning domain the walker and the fog already run on.
- **One step per beat, run by the engine, coloured by the model.** When a routine's trigger is in the cue ("knock" for the pizza routine), the due step is handed to the being as a *fact about herself*: "You are mid-routine: the next thing your hands do is turn the deadbolt." The listen may colour it (what it feels like to turn it tonight) and may **interrupt** it, but only with a named reason that the guards can check against the facts and her memory (see 3.2). No reason → the step runs through `world-apply` exactly as a `Do:` answer would. The impulse gate grants the turn when a routine step is due, not only when the GM asks.
- **Routines complete and repeat.** `settleIntentionsByAct` advances the cursor; the last step sets the routine's instance DONE and the cadence re-arms it. Her tip intention becomes a *decoration* on step `pay` of the pizza routine, not a free-floating sentence. It cannot fire until its step is reached. That alone ends "you can leave the change" through a locked door.
- **Zero new model calls for a routine beat; usually fewer.** The step is data. The model is asked one thing: colour, or a reason to break. This is also the honest answer to the speed talk: most beats of most beings in a scene are routine, and a routine beat should cost nothing but the colour.

**What it serves beyond the door.** Three open items collapse into this one structure: the standing beat that Mike wanted fed by routines and the clock ("Violet gets her side before the knock"); time jumps where DORMANT beings and beings without a goal "live nothing" (a day of routines is what they live); and the 10-17 player-behind-the-character talk, in its concrete form. It is the (spirit) playing her, except it is her own body knowing the way.

**Pillar mapping, for Mike to rule.** In GROWTH's own anthropology this is three pillars: the **Body** runs the routine (habit, Celerity, Constitution), the **Soul** decides whether to follow it or break from it (Willpower, Wisdom, Wit), the **Spirit** colours it (Flow, Focus). Note: the DAYA role names predate the Jan 2026 swap. Today the `soul` role writes the felt state and the `spirit` role does the thinking and speaking, which is the pre-swap reading. Worth renaming while the loop gets a third role, so the code says what the design says.

**Cost to build the minimum (door-opening version):** routine table (or `DayaIntention` gains `steps`/`cursor`), the planner over existing op preconditions (pure, ~150 lines, testable on the Incubator map), the due-step fact in the listen and answer, the turn grant, the settle. One session. Everything after (dreams consolidating routines, routines drifting with mood, a GM "nudge" that sets a step) is later.

### 3.2 Inaction is a claim. Check it like one.

The never-guess law says a being never fills a gap with a guess. `stay` is a claim too: "nothing here needs doing by me." Tonight that claim was false seven times. Proposal: when a routine step is due or the table has granted a turn, `stay` must carry its reason on the impulse line (`Impulse: stay — the knock is not for me / I cannot reach it / something is wrong: …`). The reason runs through the same claim-vs-fact and never-guess checks as a `Say`. A reason the facts refute (nothing is wrong, the step is reachable) is a guess, and a guess retracts: the step runs. A reason the facts support stands, and the Watcher sees it. This makes "why won't she open the door" readable on the record instead of a mystery, which is the thing Mike kept asking.

Also: strike "Nobody is waiting on you" from the listen. Replace with the clock truth the prompt already has ("it has been N since you last said or did anything") and, when a turn is granted, "The others are waiting to see what you do", which the answer prompt already says.

### 3.3 Recall: survival should feel the cue

`survivalStrength` should scale with cue coverage (or at least require that the cue touches the memory's chain: its entities, place, items). A knock at her door should raise "the only door that answers to this key" and "they always knock", not "the night I do not remember" every single time. Keep survival on top for memories the cue actually touches. This is a one-function change and a calibration pass; the recollection harness (`recall@k`) exists to measure it.

Also: routines need their trigger derived from their own sentence ("they always knock" → `knock`; "I lock the door every time" → `door`), and the deriver should drop a sentence with a routine marker but no verb of the self doing anything ("It's solid, the drawers stick in summer" is a description).

### 3.4 Speed: remove calls before buying cards

Measured: 17 s/beat on the MIG slice; per being per beat the engine runs the renderer, tagger, soul brief, listen, and for the actor the body-outward, adjudicator, card: five to eight sequential calls, two or three of them on Claude. Before another card:

- The routine layer removes the listen's decision load on routine beats and, with the step as data, the body-outward call too.
- The **tagger runs on Claude whenever `ANTHROPIC_API_KEY` is set** (`memory.ts`), one cloud round trip per memory write, inside the beat. It could run local, or after the beat.
- The soul brief is reused for 30 s; a scene beat is 17 s, so it is recomputed nearly every beat. Reuse it until the felt state actually changes.
- Measure first with `tmp/beat-timeline.ts` (owed since HW9). Then decide whether the listen wants a smaller, faster model than 27B (design-for-the-small-model says it does).

### 3.5 The first full campaign test needs a second seat

A campaign test with one ADMIN playing both sides tests the engine, not the game. Before "a full test of a campaign started" counts:

- A **TRAILBLAZER** account (not `mikemobile`, which is ADMIN) seated in Kristopher on the phone, `PERCEPTION_FEED=on`. Then fog, the perceived feed, the roll popup for whoever owns the choice, and "ADMIN sees truth" all get their first real test. Mike GMs from the PC.
- A written **success criterion** for the scene, agreed before the pod starts. Mine: Kristopher knocks, Violet opens within three beats with no Watcher nudge, the box and the bill change hands, the door closes and locks, and the record reads as a page.

### 3.6 Docs and continuity

Session continuity is the stated critical constraint and the docs have drifted from the code:

- `docs/system_map.md` "last updated 2026-07-12"; `docs/ai_systems.md` header says 2026-04-04; `ROADMAP.md` header says 2026-10-25 with entries through 10-29 and milestones from July.
- `sim/round/action-economy.ts` still has `ACTION_DIVISOR = 25`. Mike ruled 75 on 10-29 and the handoff said "no app code computes actions yet". It does.
- Three Prisma models missing from the schema doc (`Reconciliation`, `CanonRevision`, `AiCall`); 8 services and 9 lib modules not in the registry; ~40 routes undocumented; one documented route path wrong (`godhead/[id]` is `[name]`); `ai_systems.md` says the Qwen-2.1 endpoint is "NOT built yet" while the code reads its id.
- Five behaviour flags undocumented: `GPU_DAILY_BUDGET_USD`, `JEWL_DISABLE_DISPATCH`, `NEXT_PUBLIC_REVEAL_JEWL`, `DAYA_RECALL_RERANK`, `DAYA_DISABLE_THINKING`.

Proposal: one `CURRENT.md` at the root, under a page, rewritten each session: what the product is today, what is on and off, the test protocol (pod up, Mike's dev server, reset script, log-only rule, pod down), the ruling index for the last 30 days, and the next session's first move. Move M1–M9 to `docs/archive/`. Fold the handoff memory into it so the next session has one door, not twelve.

### 3.7 Housekeeping worth an hour

- `tmp/` holds 191 untracked scripts. Keep six in `app/scripts/` (`reset-to-the-knock`, `dev-pod`, `beat-timeline`, `fog-clear`, `restore-points`, `rebase-30`) and ignore the rest.
- `merge/fork-portrait-pipeline` is the trunk in all but name (900+ commits). Fast-forward `master` to it.
- No `typecheck` script in `package.json`; the "57 old test errors" baseline has no file pinning it.
- A probe session with a 2 h expiry is still in the Session table.
- The outer repo tracks the nested `GRO.WTH Repository` files directly, so the Repository's own commits show as "modified" in the app repo forever. Either a submodule or `.gitignore` the folder in the outer repo.

---

## 4. Things I think are wrong (not just missing)

1. **The desires block forbids task phrasing (Ruling-22) while the being has no other place for tasks.** Background wants only, and no foreground. That is the design hole 3.1 fills; the ruling itself is right for *desires*.
2. **The being loop runs every being on every beat, sequentially.** A standing beat for a being nothing reached still costs the renderer. With routines, a being nothing reached and no step due should cost nothing.
3. **The intention row is a sentence.** A sentence is not a plan. The row should carry structure (steps, cursor, the step a decoration hangs on) or the structure should live beside it.
4. **Canon-only KV rulings are stacking up unbuilt**: KV is not price (10-16), TKV is everything (10-17), currency is perceived value (10-17), KRMA rate per level after the re-base (10-29). The ledger still prices with the old assumptions. None of it blocks the door; all of it blocks a second campaign.
5. **`BEINGS_ANSWER = 'when-asked'`** is the table-rhythm ruling applied too literally: a being with a due routine step was "asked" by the world.

---

## 5. Loose ends, triaged

Full list: `docs/LOOSE-ENDS-2026-10-30.md` (214 items; 61 design decisions owed by Mike, the oldest from June).

**Blocking the door (do before or in the next test):** ordinary competence (3.1); stay as a claim (3.2); survival cue-gating and routine triggers (3.3); the five HW11 fixes untested live; the sound consequence unverified live; `ACTION_DIVISOR` 25 → 75.

**Blocking a real campaign (decide before beta):** a Trailblazer seat and the feed on by default; the walk cap from the sheet; hearing by distance; OOC filter; the KV/price/currency chain; Kristopher's attributes; Violet's 4th vine; the duplicate biography rows; the anonymity translator (not built) and the consent switch.

**Parked and safe to leave parked:** Values/Fears, multiple spirit packages, spell signatures, Incubator AI GM, the Narrative Map's 135 questions, the ten-year arc.

**Stale enough to close:** the TABLE_SPLIT_LOOP decision (on since 10-23; delete the serial path), the fog-of-war talk (built), "the door with two doors" (fixed by wayOutDoor), GPU cap back to $3 (done).

---

## 6. The one question for Michael

Build the minimum ordinary-competence layer (3.1 + 3.2, one session) **before** tonight's test, so the test can show her opening the door, or run the armed HW11 test first under the log-only rule and build it after? My recommendation is before: the data already says what the test will show, and every run costs an hour of pod and an hour of Mike.

---

## 7. What happened next (same day)

Michael's answer to §6 was "discuss the design before either". The discussion settled three things on top of §3.1: **the sheet is the dial** (every attribute shapes the loop continuously, no roll), **rolls are rolls** (a being rolls only where a Trailblazer would — a skill check at an uncertain attempt, a fear check when dread rises against a step, a contested check — about the D&D rate), and **the player behind the character** (a second mind that reads the sheet raw and keeps the scene moving; the character stays sealed from numbers). Then: "it is yours, make it happen." Built the same session — see ROADMAP 2026-10-30 and `docs/module_registry.md` "Ordinary competence". §3.3 (survival feels the cue) was tried and reverted: Michael's 10-25 ruling stands (survival first; the budget holds both), and with the step handed as a fact outside recall the dread no longer needs gating.

