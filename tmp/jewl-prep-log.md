# JEWL session-prep watch log — 2026-10-30/31

Rule (Michael): watch, fix nothing during; note everything JEWL does wrong, with the cause when I have it. Compare notes with Michael after, then fix, then run the session.

Source: `npx tsx ../tmp/jewl-watch.ts <sinceISO>` from `app/` (CopilotMessage rows: text + tool calls + errors + dispatch meta), `tmp/jewl-poll.ts` (live), plus `logs/dev-server.out.log` / `.err.log`.

## Baseline (before Michael's first line)
- Stack: dev :3000 up (pid 25920), whisper :9000 up (/health 200). Booted via boot.ps1 at ~06:30 UTC 10-31.
- Campaign: The Incubator `cms5z4j6z0000zg48z5vzl2jn`. Violet `cms60ndtn0000kw48ioq10i68`, Kristopher `cmvcbw49u0001h448qanzbhs3`, Rosemary Marsh `cmvaeknss0009bc48s7ulk6ca`.
- Last CopilotMessage before tonight: 2026-10-31T04:19:10.640Z (user, "((She is gorgeous.))"). Watch from here: `npx tsx ../tmp/jewl-watch.ts 2026-10-31T04:19:10.640Z`.
- GameSession #1 ended 04:34:54Z. No open session. Last DayaWorkSession: 10-17 VINES/coax, done. No work session open.

## Pre-test notes (before Michael's first line) — tonight's attempt = tell JEWL the next session is TWO DAYS later
- P1. JEWL's `advance_clock` tool (ai/copilot/tools/time.ts → services/time.ts advanceClock) ONLY moves the clock. It never calls `simulateStatedStretch`. The 10-24 law (time jumps require simulation for all characters) is wired ONLY on the Watcher's table line path (table-speak.ts:1577, stated span ≥ 1 h). So "tell JEWL two days pass" → clock moves, nobody lives the days = HW3 again, by a different door. Expected failure; watch for it.
- P2. Even where the stretch IS simulated (daya/timeskip.ts runTimeSkip): it is a `vine_tick` on the being's TOP ACTIVE GOAL only. It reads NO DayaIntention and NO DayaRoutine. Michael's aim tonight ("proper simulation based on their intentions") is not what the stretch does today. Intentions have dueCycle/dueUntil windows and cadences (daily/nightly…) but nothing walks a span and fires them.
- P3. No `goal` table found under that name (query failed) — check which model the vine_tick reads; if Violet/Kris have no ACTIVE vine, runTimeSkip returns 'no_active_vine' and posts "nothing lived".
- State now: clock 0.00225 cycles (~0.8 day into year 0); Violet 10 intentions (1 DONE: the tip), Kristopher 3 (1 DONE); routines: Violet Locking up/Winter coat READY, Pizza delivery DONE; Kris Pizza run + GRO.WTH work session READY. Both entities ACTIVE.

## Items (numbered, in order seen)

## Open questions for Michael

## PIVOT (Michael, ~06:35 UTC): "No need to test if it doesn't exist. Sounds like you have your first task tonight." → build the stretch simulation. Design: docs/TIME-STRETCH-DESIGN-2026-10-31.md. Watches stopped. Michael: "Don't cut corners or hard prompt things. We need this solid."

## Built (same night, before JEWL's prep)
- The stretch engine + JEWL's `advance_clock` upgrade (ROADMAP 2026-10-31 (later)). Suite 2536/2536. Dev server rebooted after the migration (DayaIntention.authority).
- For the prep session, what to watch JEWL do: (1) make Kristopher's hotel room + Chess Pizza as Locations from the facts (undrawn is fine); (2) place his rig in the hotel; (3) stock fresh pizzas at Chess Pizza; (4) gather Michael's directives (Violet is a Trailblazer-controlled character? — he states her intentions; overrides for Kristopher); (5) call `advance_clock` ONCE with amount 2 unit day + narration + directives; (6) report `worldLacks` and the days honestly. Items to log: anything he invents, any split of the span, any claim the data does not show.
