# GRO.vines — The True Design vs What Got Built

Research synthesis 2026-08-19: canon pull (Repository + rulings + memory),
source-card archaeology (Mike's original design conversations, WSL corpus),
and the as-built code map. For discussion with Mike — nothing here is a
decision.

## 1. The one big correction: a vine is NOT a goal

Mike, original design session (SC-0276 / Sonnet-4-discussion, quoted):

> "Trailblazers create Goals or GRO.vines as they are called. GOAL,
> RESISTANCE, OPPORTUNITY. **Trailblazers create the GOAL, GMs create the
> resistance, and the system via AI agents called (Godheads) create the
> opportunity.**"

A vine is a **three-author contract** — the acronym G-R-O is literally its
anatomy:

| Third | Author | Substance |
|---|---|---|
| **G**oal | Trailblazer (or any entity) | The declared want. One per vine slot; slots are a SEED stat (avg 3; Human's "Ambitious" nectar = +1 → 4) |
| **R**esistance | GM/Watcher | ENTITIES stacked against the goal — and its measure is their **cumulative KV**: "The TKV is how much all the KRMA of all the resistance stacked against a specific goal" |
| **O**pportunity | The assigned godhead | Mini-quests funded from the godhead's OWN wallet, dialed by its personality and investment strategy |

The Terminal assigns ONE godhead per vine by thematic alignment; resistance
is never assigned — the GM builds it, and resistance entities have their own
vines with their own custodian godheads (the dragon's "protect my hoard" is
the mirror vine of "slay the dragon").

**Everything else follows from this.** The proxy adversarial meta layer =
patron godheads out-investing opposing godheads through the O-channel of
mirrored vines ("A character picking 'overthrow the tyrant' is essentially
saying 'I'm confident my Justice godhead can out-invest the Tyranny
godhead'"). Thorn-on-failure comes from the strongest godhead backing the
resistance, thematically shaped by the failure itself. The "how much
resistance was against this goal" quantity Mike asked about this week is NOT
a new wager mechanic — it already has a definition: **the summed KV of the
resistance entities linked to the goal.**

## 2. The lifecycle (ratified pieces only)

- Declared at creation (not ad-hoc); Terminal assigns the custodian godhead.
- **Opportunity Cycle**: godhead reads live campaign context → offers an
  opportunity (grounded — "It is what that character would most likely be
  thinking about doing anyways," never prophecy) → character pursues →
  godhead confirms → gift (Frequency trickles 1-3, blossoms, small nectars;
  "every favor from a godhead is earned, not given") → next opportunity.
- Resistance escalates in parallel (counter-investment, arms race).
- **Complete** → final Nectar sized by the KV encased in the vine (nectars
  are EXPLOITS, not stat bumps); slot frees immediately. Vine completions are
  the KRMA JACKPOT path — session drip alone can never max a character.
- **Fail** → Thorn (lien-lock, not transfer) from the strongest opposing
  godhead, thematically the failure's natural scar (diegetic — ruled again
  live 2026-08-19: losing your family reads as grief, not divine punishment).
- **Abandon = fail, and only at Harvest.** No mid-stream transformation.
- **Incompletable/eternal goals are first-class** ("I will live forever") —
  natural magnets for counter-investment; Lady Death is NEUTRAL, not a
  default antagonist or default lien-holder.
- Nectar decline / break-apart: shatter into Frequency minus ~10% tax → GM.

## 3. What the vine system IS to GROWTH

- **The KRMA economy's arteries**: godhead wallet → opportunities/gifts →
  character TKV → GM wallet capacity growth. Vines are how new KRMA enters a
  campaign — "the primary engine of KRMA circulation."
- **The world engine**: NPCs, factions, churches, towns, countries all have
  vines — "the world is moving around the players too." Three sides of every
  story: the players, their opposition, and the ones in the middle.
- **A GM health barometer**: dark vines (no opportunities lighting up) signal
  a GM who needs to cater to wants or reveal more story — a meta/UX function.
- **Hidden patronage**: early seasons show players only "complete this for
  KV"; the godhead layer reveals gradually (S2 hints → S5 full stakeholder
  reveal per SC-0695).
- **IRL vines (SC-0485)**: Mike runs HIMSELF on a sheet with live vines
  (family, kids, GROWTH-worldwide, immortality); one Discovery Center trip
  fed three vines at once — "a pure resonance." Intra-character resonance
  (one opportunity feeding multiple vines) was DISCOVERED in his life, not
  designed. The system is meant to run on real life.

## 4. What the rules docs flattened (source-card flags)

1. Vine ≠ goal (the three-author contract) — the whole reason the code shape
   is wrong.
2. Godheads are personalities with wallets, not payout formulas — every rate
   question in the original sessions got "depends on the godhead." Fixed
   tables would erase the design.
3. Proxy-war escalation + thorn-from-strongest-opposition are core, not
   flavor.
4. **Blossoms are vine-scoped** in the original (active while the vine
   lives) — tension with the current blossom-as-timed-trait custody model
   AND with Mike's 2026-08-19 "blossoms should be time-based, cycle = 1
   earth year." Needs one ruling to reconcile (options: time-based with
   vine-end as an additional expiry; or two blossom kinds).
5. Abandon-only-at-Harvest commitment mechanic — absent from code.
6. Investment-strategy typology (Conservative/Aggressive/Reactive/Gambling/
   Patient) + Lady Death's "claim the entire character" escalation live only
   in the archive file — not carried forward. Intentional cut or loss?
7. Opportunities as GM performance meter — nowhere downstream.
8. Incompletable vines — nowhere downstream.
9. "GROvine communication" module exists in one old deep-dive file (vines as
   in-world communication?) — unknown status, ask Mike.
10. seed→root→branch vine stages and "Resonant Opportunity" were AI
    proposals Mike never ratified — do NOT treat as canon.

## 5. As-built vs the design

What exists: `Goal` table + CRUD + custodian adopt/release + resisted_by
entity edges + opportunity declare/resolve (T33) + nectar bestowal (the ONLY
KRMA movement) + GoalCard UI. What's missing or wrong:

- **R has no number**: resistance edges don't sum linked entities' KV — the
  central quantity ("counter cumulative KV") is uncomputed. (Note: many
  entities also lack karmicValue, so the sum needs the grading debt paid.)
- **O has no economy**: opportunities move no KRMA; godhead wallets never
  fund anything; no opportunity-cycle loop; the dispatcher event piggybacks
  `goal.created`.
- **No mirror-vine linkage**: nothing connects a resistance entity's own
  vine back to the opposing side (the proxy war has no board).
- **Failure/abandonment do nothing**: no thorn imposition flow, no lien
  metadata, no Harvest gate on abandonment (today anyone GM+ can abandon
  anytime).
- **Death never touches vines**: process-death has zero goal references; the
  settle/let-it-ride choice has no data to read.
- **Two disconnected representations**: the real `Goal` table vs the orphan
  `GROvine` sheet type + dead GROvinePanel (rendered placeholders, never
  written).
- Half-built stubs: `milestones` (no writer), `nectarsEarned` (never
  incremented), `resistancePlan` (no consumer).
- **Ambitious closes its own loop**: the Human seed's phantom nectar is, per
  the original design, "+1 GRO.vine capacity" — it can now be authored as a
  real trait with real meaning (also settles the 225 ledger).

## 6. Genuinely open after all research (the discussion shortlist)

1. **Thorn sizing** — the failure thorn "relates to the failed goal" and
   comes from the strongest opposing godhead, but NO source sizes the lien.
   Candidate anchors: the resistance KV, the opposing godhead's actual
   O-channel investment, Kai's judgment alone, or fate-die cap only.
2. **Blossom scoping** — vine-scoped (original) vs time-based (2026-08-19
   ruling) — reconcile.
3. **Lien settlement** — lock-authority is conservation-safe; Lady Death's
   settle-from-her-own-wallet option predates the July death-split
   correction (she takes ONLY Frequency now) — still alive?
4. **Archive restorations** — investment strategies, Lady-Death-claims-the-
   character, conflicting-party-vines: restore to canon or leave cut?
5. **Harvests** — the abandon gate depends on Harvests being a defined
   thing (cadence, what else happens at one) — thin everywhere.
6. **Non-opposition thorns** (Mike 2026-08-19: they exist) — what's the
   general legitimacy rule for imposition outside a won opposition?
