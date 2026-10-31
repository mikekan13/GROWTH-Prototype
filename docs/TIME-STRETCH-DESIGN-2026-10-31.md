# Living a stretch — time jumps simulated for every being (design, 2026-10-31)

Michael, 2026-10-31: "We want to make sure timelapses get proper simulation for entities based on their intentions… This is important as much of the simulation will be done when time moves like this. Don't cut corners or hard prompt things. We need this solid."

Governing rulings: [time jumps require simulation for all characters (10-24)], [intentions under the vines (10-25)], [ordinary competence: routines, the player, rolls at real resistance (10-30)], [movement never charges the clock (10-28)], [engine derives, don't hard-prompt (10-17)], [being never guesses, check memory first (10-24)], [sim advances time moment to moment (10-07)], [fog of war = last known (10-28)].

## 0. What exists and where it falls short

| Piece | Today | Gap |
|---|---|---|
| JEWL `advance_clock` (ai/copilot/tools/time.ts → services/time.ts) | Increments the clock, writes one history line, sweeps blossoms/mana | Never simulates. "Two days later" through JEWL = HW3 again. |
| Table line with a stated span ≥ 1 h (table-speak.ts:1577 → table-timeskip.ts) | Runs `runTimeSkip` per ACTIVE being | One `vine_tick` on the TOP goal only; one summary sentence; no intentions, no routines, no interlock, no night; memories stamped at the END cycle, not inside the span. |
| Intentions (daya/intentions.ts) | Rows with trigger, dueCycle/dueUntil window, cadence; due by cue or clock; settled by act | Nothing walks a span and asks what is due inside it. |
| Routines (daya/routines.ts, services/routine-run.ts) | Ends derived once; means planned each beat; the player decides; re-arm by cadence | Fire on triggers in a cue only. No clock fires a daily routine; nobody knocks when there is no Watcher. |
| Clock (services/time.ts, table-clock.ts) | `advanceClockBySim` + batched flush | Jumps; never walks. |
| Map (world-apply, spatial-world) | Rooms of the apartment + the landing | No exit from the landing (HW12 open); Kristopher's hotel, the pizza place, the shelter exist only as facts. |

Current state (10-31 06:40 UTC): clock 0.00225 (≈ 0.82 of day 0, evening). Violet in the Main Room, Kristopher on the fourth-floor landing (fact says descending). Violet: 3 ACTIVE goals, 10 intentions (tip DONE), routines Locking up / Winter coat (always, READY), Pizza delivery (daily, DONE at 0.8 of the day). Kristopher: 4 ACTIVE goals, 3 intentions, routines Pizza run to her door (daily, READY), GRO.WTH work session (daily, READY). Rosemary Marsh has no DAYA entity.

## 1. One entry, every door

`liveStretch(campaignId, actor, { seconds, narration?, source })` in `services/stretch-live.ts`.

- Table line with a stated span ≥ 1 h → `liveStretch` (replaces the body of `simulateStatedStretch`; table-speak untouched).
- JEWL `advance_clock` for ≥ 1 h → `liveStretch`; the tool's output carries the lived report so JEWL can tell the Watcher what the world did. JEWL plans once, the code lives it. Under 1 h = a pause: the clock moves as today.
- Scripts/tests call it directly.
- One stretch per campaign at a time (in-process lock; a second caller waits). The table already waits for a stretch.

## 2. The clock WALKS

The span is cut into windows (§3). For each window the clock is advanced to the window's start (`advanceClockBySim`), the window is lived, then on to the next. One `flushSimClock` at the end: one history line ("2 days passed → <local date>") and the sweeps.

Why: every existing path reads the live clock — memory `narrativeCycle`, `dueIntentionsFor(now)`, routine re-arm (`RE_ARM_AFTER`), `sinceOwnInWords`, the adjudicator's `cycle`. Walking the clock means nothing is special-cased and every memory lands at the moment it happened. A being asked "how long since you spoke" after the stretch answers from its own rows.

## 3. Windows = quarters of the local day, with LOD by span

Quarters (fractions of the local day, the same numbers the intention grammar already uses): night 0–0.25 (sleep), morning 0.25–0.5, afternoon 0.5–0.75, evening 0.75–1.0. First window = the rest of the current quarter; last = up to the end cycle.

LOD (reality-simulation ruling: render distance): span ≤ 4 days → quarters; ≤ 31 days → one awake window per day + night; longer → weeks (routines counted, one account per week). **[D1 — Michael]** Tonight's two days = quarters: ~8 windows.

## 4. What is DUE in a window — pure, from data (`daya/stretch.ts`)

Per awake being, per window:

a. **Routines by cadence.** A READY cadence routine fires once per period in its *usual window*. The usual window is READ, never invented: (i) time words in its source intentions ("every evening", "most mornings", "every night") → that quarter; (ii) else the quarter of its `lastDoneCycle` (Violet's Pizza delivery last ran at 0.80 → evening); (iii) else unknown → the clock does not fire it; only a trigger reaching the being does (§6). `always` routines are trigger-only (locking up happens when she goes out, not at an hour).
b. **Timed intentions.** `dueReason` with the window's cycle → 'time' → due (existing `intentionLine`).
c. **Trigger intentions and routines.** Fired by what reaches the being inside the window (§6).
d. **Goal work.** Once per day, in the first awake window with nothing else due (else the last awake window): the being's own account toward its goals (§7).
e. **Night.** Sleep. Nothing fires but `nightly` cadence; one dream tick per night per being (`runDreamConsolidation`, exists). Hunger/thirst/fatigue stay deferred per the 10-24 addendum; sleep-as-a-window is the first body rhythm and costs nothing. **[D5 — Michael]**

## 5. Running a routine inside a window — hands, no deliberation

The live path, re-used as is: `routineWorldFor` → `nextStep` → `playerDecides` → fear check only if a survival memory rose (`startTableRoll({fear})`) → `applyActEffects` → cursor/done/re-arm. Loop until done, blocked on another's hands, or `ROUTINE_STEP_CAP`. The stretch gets no hands of its own. Violet's winter coat and the lock behave exactly as they would at the table.

## 6. Interlock — the beings share one world in the window

Beings are stepped round-robin inside a window (one step each, repeat until nobody progresses). A step can produce a CUE for another being:

- a `sound` effect (a knock, a phone) → delivered as a stimulus to the beings it reaches (the existing sound-site + reach judge path, as the world's own narration at the table today);
- coming within reach (`here` / `through-open`) → each perceives the other (standing scene refresh via `perceive`).

A cue runs `triggerInCue` (her Pizza delivery on "knock") and `dueIntentionsFor(cue)` (her "when he knocks…"). This is how Kristopher's routine produces Violet's; no script says "the pizza comes at six".

**New planner step: KNOCK (also right for live play).** When the next end needs a person beyond a door that is shut and whose lock is not under the actor's hand, the step is `{op:'sound', at:<door>, text:'a knock at <door>'}`, act "knocks at the Entry door". Today the planner tries to open her deadbolt from the landing and the map refuses; HW12 needed Michael to narrate the knock. In a stretch there is no Watcher.

**Speech within reach [D2 — Michael].** When two beings come within reach in a window, a bounded exchange runs (recommend cap 4 lines total: `answerAsk` spoken → the other hears through the existing hear path → answers), landing as dialogue memories on both sides. Off = hands only. Recommendation: ON. "I always stay a few seconds longer at her door" only becomes a line if he may speak; whether he calls the number on the five is a being's decision that surfaces only here or in §7.

## 7. The being's own account — one per being per awake day

Frame = data only, no character-specific sentence: the hour in words, "day N of about M days", what it did today so far (its routine acts, in the engine's words), what it meant to do (due intentions), ALL its ACTIVE goals (not top 1), where it stands, who is near, what it heard. Call: the listen → answer shape on L1 → a thought and an act. Then `resolveIntent` (C, the adjudicator) resolves the act against facts and map; a check only if the adjudicator calls one; `adjudication_result` wake lands it as a lived memory; `settleIntentionsByAct` marks carried-out intentions DONE; `maybeAdvanceVine` moves an open opportunity if the outcome matches. `vine_tick` stays for the unframed WP12 path and the test canvas.

## 8. ELSEWHERE — off the map **[D4 — Michael]**

Kristopher's days are not in her apartment: the hotel room, Chess Pizza, the street. Today the landing has no exit and his leaving is refused; two simulated days leave him standing at her door. Proposal:

- A `Location` with no footprint is *elsewhere*: fact-backed, undrawn. `located_at` may point at it. The canvas shows the token greyed at last known (fog ruling) with "elsewhere: his hotel room".
- The planner's `at <place not on the map>` → `move` to that Location by name; world-apply's no-footprint fallback already files a being by location name — make it explicit for undrawn locations. Returning: `move` to a drawn room places him at the way-in door (the landing).
- Needs two Locations made from the facts that exist (kristopher.hotel-room.*, kristopher's employer) and a stairwell exit from the landing. Who draws: JEWL from the facts (one call, data not prompt), a script, or you.

Without this, Kristopher's stretch is honest but hollow. With it, his daily work session (`at` his rig) and his pizza run both become real moves.

## 9. Record and report **[D6 — Michael, the form]**

- Per being per DAY, one `timeskip` row: a paragraph the engine builds from the day's acts (seed→page style, no model) + the being's own account. The Novel view reads it as a chapter break ("Two days pass."). The step-level log is kept on the history entry's details for audit.
- JEWL's tool output: `{ span, lived: [{ name, days: [{ date, acts, account, doneIntentions }] }] }`.
- Cost estimate for two days, two beings: ~16 listens + ~8 player calls (L1, pod) + ~4–8 adjudications (C, ≈ $0.03 each) + 2 dream ticks ≈ 2–4 minutes, ≈ $0.30–0.50 cloud. Longer spans fall to the LOD.

## 10. Guards

- Lock per campaign; a failure mid-walk leaves the clock where it got to and logs it; lived memories are never deleted by the engine (truth record is append-only). A rejected stretch is rewound by hand as HW3 was (tmp/rewind-jump.ts pattern, archive first).
- DORMANT (GM-voiced) and entity-less characters (Rosemary): posted "not lived" as now. **[D3 — Michael: should GM-voiced characters live a stretch from their facts and intentions?]**
- Caps: `ROUTINE_STEP_CAP` per routine instance; exchange cap; per-window chain depth (`ACT_CHAIN_CAP`).

## 11. Build order

1. `daya/stretch.ts` (pure): windows for a span with LOD; usual-window reading; due set; round-robin schedule. Vitest on fixtures built from Violet's and Kristopher's real rows.
2. Planner KNOCK step + tests (daya/routines.ts).
3. `services/stretch-live.ts`: the walker (clock walk, routines, interlock cues, account, night/dream, report). `simulateStatedStretch` delegates to it; table-speak untouched.
4. JEWL `advance_clock` → walker for ≥ 1 h; lived report in the output.
5. Elsewhere (D4), if yes.
6. Snapshot the DB (archive pattern), run the two-day stretch on the live campaign, read the record together, rewind if wrong.

## Decisions (Michael, 2026-10-31, ~06:45 UTC)

- **D2 speech:** "Yes, capped at 4 lines." Built (`EXCHANGE_CAP = 4`).
- **D4 elsewhere:** "You aren't building anything. You're fixing, augmenting, and empowering JEWL to do this stuff." → the engine understands undrawn Locations (leave / arrive / a sound at a door); JEWL makes the places and the stock with his own tools (create_location, place_item, stock_goods, draw_place_map) and reads `worldLacks` from the stretch's output.
- **D3 who lives it:** "Every entity that is live in the campaign. That is to say crystallized and above the line run the simulation. Trailblazer controlled characters tell their intentions during the time and the GM would just note anything he wants specific entities to do as overrides essentially." → roster = status ACTIVE|APPROVED; directives with `authority` player | gm; a gm one happens as written.
- **First run:** "Just like production would be. But you aren't running it. JEWL needs to do everything." → no scripts against the live campaign; Michael tells JEWL, JEWL calls `advance_clock` with narration + directives.
- D1, D5, D6, D7: proceeded on the recommendations (LOD by span; night = sleep + dream; one row per being per day; the clock walks when JEWL is told).

## Built the same night

See ROADMAP 2026-10-31 (later) and `docs/module_registry.md` "Living a stretch". Suite 2536/2536.

## Decisions owed by Michael (as written before the answers above)

- **D1** LOD grain: quarters ≤ 4 days / days ≤ a month / weeks beyond?
- **D2** Beings speak when they meet in a stretch? Cap 4 lines?
- **D3** GM-voiced (DORMANT) characters: live the stretch or stay "voiced by the Watcher"?
- **D4** Elsewhere: undrawn fact-backed locations + a stairwell exit; who draws them?
- **D5** Night = sleep window + one dream tick per night?
- **D6** Record form: one row per being per day?
- **D7** When you tell JEWL "the next session is two days later": the clock walks NOW (prep; the record shows the two days; the session opens on the far side) — agreed?
