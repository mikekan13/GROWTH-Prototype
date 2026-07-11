# GM_Subscription_KRMA.md

**Status:** #validated
**Source:** Mike resolution session 2026-05-19 ([[NEEDS-MIKE_RESOLUTIONS_2026-05-19]] §5). Implemented in `app/src/services/subscription-drip.ts` (`monthlyDrip`, `SUBSCRIBE_LUMP`), `app/src/services/subscription.ts` (`createSubscription`, `runDripForUser`, `runDripForAll`).
**Security:** SEASONAL-S4 (KRMA/USD reveal context); core mechanics PUBLIC.
**Rulebook:** Out of scope for player-facing rulebook (GM/business mechanic).
**Last Updated:** 2026-05-23

---

# GM Subscription — KRMA Drip Schedule

## Purpose

Paying GMs ("Watchers") receive a periodic KRMA allocation from the Terminal Reserve into their personal wallet. The schedule is **anti-frontloading** — heavy early-to-mid support while the GM builds their world, tapering to a sustaining baseline once the GM's own creations begin generating KRMA on their own. **The drip never reaches zero**, even at year 10+.

This document is the canonical reference for the schedule. The implementation matches the schedule exactly.

## Schedule

| Event | KRMA |
|---|---|
| **Subscribe** (one-time lump) | **15,000** |
| Month 1 | 2,500 |
| Months 2–11 (linear ramp) | 2,500 → 10,000 in 10 even steps |
| **Month 12 (peak)** | **10,000** |
| Months 13–35 (linear taper) | 10,000 → 3,000 across 23 steps |
| **Month 36+ (steady state)** | **3,000 / month indefinitely** |

Math:
- Months 2–11 increment: `(10,000 − 2,500) / 10 = 750` per step. So month 2 = 3,250, month 3 = 4,000, …, month 11 = 9,250, month 12 = 10,000.
- Months 13–35 decrement: `(10,000 − 3,000) / 23 ≈ 304` per step (rounded). Month 13 ≈ 9,696, month 14 ≈ 9,391, …, month 35 ≈ 3,000.

### Visualized

```
KRMA / month
    │
12k │
    │        ▄▄▄▄▄
10k │      ▄█████▄▄▄
    │    ▄███████████▄
 8k │   ▄█████████████▄
    │  ▄███████████████▄
 6k │ ▄█████████████████▄▄
    │ ███████████████████▄▄▄
 4k │ █████████████████████▄▄▄▄
    │ █████████████████████████▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  (3,000 plateau)
 3k │ █████████████████████████████████████████████████████████ ────
    │
 0  └─────────────────────────────────────────────────────────────
    m1   m6   m12  m18   m24   m30  m36                          ...
```

## Lifetime totals

| Window | Cumulative |
|---|---|
| Lump only | 15,000 |
| End of month 12 (lump + ramp) | ~78,750 |
| End of month 35 (lump + ramp + taper) | ~228,000 |
| 10-year meta campaign (120 months) | ~480,000 |

The 10-year horizon is the "GROWTH meta campaign" — the assumed maximum-duration commitment a single GM might make. Established GMs at this point should be largely self-sustaining via earned KRMA (player rewards, blueprint royalties, etc.), and the 3,000/month steady drip is the "the platform still has your back" floor.

## Status states

A subscription row carries a `status` field. The drip runs only when status is `ACTIVE` or `FREE`:

| Status | Meaning | Drips fire? |
|---|---|---|
| **ACTIVE** | Subscription is current; billing is healthy. | Yes |
| **PAST_DUE** | Payment failed at the billing provider. The GM still has the seat but drips PAUSE. Returns to ACTIVE on successful payment. | No |
| **CANCELED** | User cancelled (or admin closed). Existing wallet KRMA stays; no more drips. The row remains for audit. | No |
| **FREE** | Admin-granted free tier (testing, comp, partner). Behaves identically to ACTIVE for drip purposes. | Yes |

## How the engine knows what's owed

Each subscription stores `subscribedAt` (the anchor) and `lastDripMonthIndex` (the last drip month already paid). The drip runner computes "how many calendar months have elapsed from the anchor to now" and pays each month between `lastDripMonthIndex + 1` and `elapsedMonths` in order. It writes a ledger transaction per month with `reason: 'GM_ALLOCATION'` and an idempotency key of `sub-drip::${userId}::${monthIndex}`.

Catch-up is automatic: if the drip job hasn't run in 3 months, the next invocation pays months 1, 2, 3 in sequence and updates `lastDripMonthIndex` to 3. No drips are ever skipped.

## Idempotency guarantees

The system is safe to over-run:

- The subscribe lump is gated on subscription creation; if `createSubscription()` finds an existing row, it returns it without re-paying the lump.
- Each monthly drip transaction uses the `sub-drip::${userId}::${monthIndex}` idempotency key. The ledger refuses duplicate writes with the same key. Two simultaneous drip runs can't both pay month 7.
- A subscription that toggles `PAST_DUE → ACTIVE` does NOT retroactively pay missed months. The intent: if a GM let their payment lapse for 2 months, they don't get a 2-month catch-up on top of resuming normal drips. (Open question for review — if Mike wants retroactive, change `runDripForUser` to remove the status gate or add a separate `repayMissed()` function.)

## Sources of GM KRMA in production

The drip is one of several KRMA income paths for a GM:

1. **Subscription drip** (this doc) — base income from the Terminal Reserve.
2. **Player session rewards** — players gift KRMA back to the GM via Nectars and other GRO.vine settlements ([[GROvine_System]]).
3. **Blueprint royalties** — when other GMs use a Watcher's published Seeds/Roots/Branches/Items/Spells, a royalty flows back ([[Forge_Authoring_Pipeline]]).
4. **Lady Death settlements** — when characters die, the body strip routes to the GM's wallet ([[Death_Engine_System]]).
5. **Direct top-up** (post-Stripe) — GM can buy KRMA tokens with cash if needed for over-budget campaigns.

The drip schedule is calibrated under the assumption that paths 2-4 grow over time as the GM's world gains traction, and the drip itself is the "training wheels" component.

## Parked for future

These are *not* implemented and are recorded only as design intent:

- **Sunset cash subscription** — over time, the cash portion of the subscription decreases as KRMA-as-service-payment matures. Established GMs may eventually pay zero cash and fuel everything with earned KRMA. Depends on Stripe + KRMA-token-conversion infrastructure neither of which is built.
- **Tier variants** — currently there's a single plan slug (`watcher_default`). Future tiers (Indie/Studio/Founder) may have different drip curves.
- **Cohort tuning** — beta will produce real flux data. The numbers here are starting values; expect to tune them down (the math is generous on purpose).

## Cross-reference

| Game term | Code surface |
|---|---|
| Lump amount | `SUBSCRIBE_LUMP = 15_000` in `services/subscription-drip.ts` |
| Curve function | `monthlyDrip(monthsSinceSubscribe)` (same file) |
| Cumulative forecast | `cumulativeDrip(monthsSinceSubscribe)` |
| Subscription row | `Subscription` model in `prisma/schema.prisma` |
| Status enum | `'ACTIVE' \| 'PAST_DUE' \| 'CANCELED' \| 'FREE'` |
| Lifecycle ops | `createSubscription`, `runDripForUser`, `runDripForAll`, `setSubscriptionStatus` in `services/subscription.ts` |
| Ledger reason | `GM_ALLOCATION` |
| Idempotency key | `sub-drip::${userId}::${monthIndex}` and `sub-lump::${userId}` |
| Admin trigger | `POST /api/admin/subscription-drip` |
| Stripe entry | `POST /api/webhooks/stripe` (checkout.session.completed creates sub; invoice.paid triggers catch-up) |

---

## Links

- Related: [[KRMA_System]], [[Frequency_Three_Operations]], [[Death_Engine_System]], [[Forge_Authoring_Pipeline]]
- References: [[GROvine_System]]
