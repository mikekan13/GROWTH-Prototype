# AI Economics — Finance × Capability Crossover (2026-08-23)

> Companion to AI-NETWORK-DESIGN-INTENT-2026-08-23.md. Goal: price the GM subscription so
> the platform runs the best models profitably with an uninterrupted experience.
> Split per Mike: KRMA charges cover authoring content + image gen; everything else
> (JEWL judgment, canvas ops, work cycles, copilot) rides the subscription.

## 1. TELEMETRY BASELINE — and why it's skewed

The only live data (73 JEWL dispatches, all Sonnet 4.6) is from the BROKEN configuration
— the credit-burn incident: full prefix resent uncached every round, work cycles firing
every 4s. Mike's ruling: treat it as an upper bound, not a baseline.

- 73 dispatches = 3.78M input / 62K output tokens (~$12) — matches the post-mortem.
- Per dispatch: avg 51.8K input (median 20K, max 380K), ~850 output.
- **Cache columns are NULL on all 73 rows → ZERO dispatches have run since the caching
  fix (e6cc6fe) + topup. Caching is still UNVERIFIED live.** First verification = the
  Violet genesis resume. This is the P0 measurement before any pricing is locked.

## 2. PER-UNIT COSTS (list prices: Sonnet 4.6 $3/$15 per MTok, Haiku 4.5 $1/$5;
   cache read ≈0.1×, write ≈1.25×)

| Unit | Broken (measured) | Fixed (cached ~90%) | Fixed + slim cycle ctx |
|---|---|---|---|
| JEWL judgment dispatch (Sonnet) | ~$0.17 avg / $0.07 median | **~$0.04-0.05** | ~$0.02-0.03 |
| Work-cycle grunt (Haiku, slim ~10K ctx) | n/a (ran on Sonnet) | **~$0.005/cycle** | — |
| Local 27B serverless (1×80GB) | — | **$2.5-3.4/hr hot, $0 idle** — ≈$0.35-0.90/M output tokens when saturated | — |
| GLM-4.5-Air agentic pilot (1×H200) | — | $4.39/hr, warm during sessions only | — |
| Portrait/image gen (existing endpoint) | — | ~$0.03/gen warm + ~$0.11 cold-start amortization per session | — |

Key asymmetry: **Claude cost scales linearly per token per GM; local GPU cost is a
step function shared across every active campaign.** One warm worker serves many GMs
simultaneously (vLLM batching); per-GM local cost FALLS with subscriber count, while
per-GM Claude cost is constant. The router's economic function = push bulk volume to
the shared GPU, reserve Claude for judgment.

## 3. SESSION-COST SCENARIOS — routing mix is THE variable
   (per active 4-hour play session; [A] = needs Mike's numbers)

**Correction (Mike 2026-08-23): don't model from the all-Claude era.** Claude is the
escalation tier, not the workhorse. Three mixes:

**Mix A — dev today (100% Claude, the stand-in):**
40 Sonnet dispatches ($1.80) + 150 cycles on Sonnet-then-Haiku (~$0.75-2.00)
→ **~$2.50-4.00/session**. This is what the old telemetry describes. Not the product.

**Mix B — transition (router shipped, GPU lane cold-startable):**
Judgment on Sonnet (40 × $0.045 = $1.80) + grunt on Haiku (150 × $0.005 = $0.75) +
flagged/sensitive on local burst (~10 GPU-min = $0.50) → **~$3.00/session**.
Haiku is the grunt lane only while the GPU isn't reliably warm.

**Mix C — target (local-first; Claude = sanitized judgment consults only):**
Local carries routing, persona, work cycles, mechanical canvas ops, flagged gen.
Claude consulted for real judgment [A: ~10-15 consults/session × $0.045 ≈ $0.50-0.70].
Local GPU share: one warm 80GB worker batch-serves ~20-50 concurrent sessions'
grunt+persona load (27B FP8, aggregate throughput), so per-session share at even
modest concurrency ≈ $2.50/hr ÷ N×4hr → **$0.20-1.00/session** and falling with scale.
→ **~$1.00-1.75/session**, dominated by GPU utilization, not tokens.

Monthly per active GM [A: 4 sessions + prep]: Mix B ≈ $10-14; **Mix C ≈ $4-8 at launch
concurrency, → $2-4 as the pool fills.** Levers ranked: (1) routing mix itself,
(2) prompt caching on whatever stays on Claude (~4×), (3) shared-GPU utilization,
(4) slim cycle context. The router build IS the margin.

## 4. TIER IMPLICATIONS (vs 162-day-old tier sketch: Basic $15-20 w/ 5 seats, Premium $30-50)

- **Basic $15-20**: comfortable under Mix C (~$4-8/GM raw → healthy margin even for
  heavy users); only strained if we ship Mix B long-term. Metered QoL allocation still
  worth keeping as the abuse backstop, enforced via the router ledger.
- **Premium $30-50**: under Mix C this is mostly margin + GPU-pool funding — it buys
  always-on JEWL, priority warm capacity, and the best-model judgment tier.
- **KRMA-charged actions are exactly the burstiest per-unit costs** (image gen, forge
  authoring chains) — moving them out of the subscription is what makes flat pricing
  survivable. The in-game economy is the metering system for spiky load.
- **GPU pool break-even**: one always-warm 80GB worker ≈ $1,800/mo at 24/7. Under ~100
  Basic subs, run scale-to-zero + session-window warming (cold start = the cost of
  thin utilization); past that, always-warm pays for itself and latency improves.
  Doctrine-compliant either way (company compute = the wall's inner face).

## 5. WHAT THE ROUTER MUST METER (economics requirements on the ai/network build)

1. Unified per-call ledger: lane, model, tokens in/out, **cacheRead/cacheWrite**, est.
   USD, campaignId — per-GM cost attribution is what makes tier metering and margin
   tracking possible. (Today: JEWL logs to CopilotMessage.metadata JSON only; DAYA
   table has no cache columns; nothing has campaign-level rollup.)
2. Verify caching on first live dispatch (cacheReadTokens > 0) — P0, blocks pricing.
3. Add `cache_control` to DAYA's Claude path (currently uncached).
4. GPU-lane utilization metrics (hot-minutes per campaign) to steer the
   scale-to-zero ↔ always-warm decision at real subscriber counts.

## OPEN [A] ASSUMPTIONS FOR MIKE
- Sessions/month + hours/session for a typical active Watcher; prep-time JEWL usage.
- Dispatches/hour target for in-session JEWL (drives the judgment line).
- Whether Basic's metered QoL allocation is tokens, sessions, or hours.
