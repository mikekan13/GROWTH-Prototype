# Items Blocked on Mike

> Last updated: 2026-05-20 (after Mike's resolution doc + autonomous build pass)
>
> Resolved items kept as short stubs for reference. Active blockers live at the bottom.

---

## RESOLVED

### 1. ~~Burn formula~~ ✅ 2026-05-19
- True permanent KRMA removal; 1 max Freq = 1 KRMA; anti-deflationary scaling `cost = baseCost × (1 + burnSinkBalance/50_000)`.
- Built: `services/burn.ts`, `app/api/characters/[id]/burn`.

### 2. ~~Spirit Package = transformation~~ ✅ 2026-05-19
- Character is NOT destroyed; transforms to ghost (`status: 'GHOST'`).
- Body strips to GM; soul halves to Lady Death; max Frequency capacity → Lady Death; Spirit + non-body kept.
- Built: rewrote `calculateDeathSplit`, `calculateSkillSplit`, `executeDeathSplit`, added `transformCharacterToGhost`.

### 3. ~~Tara = Lady Death~~ ✅ 2026-05-19
Same entity, two names.

### 4. ~~Nectar/Thorn pillar classification~~ ✅ 2026-05-19
- Explicit `pillar: 'body' | 'spirit' | 'soul'` field added to `GrowthTrait`. Required at authoring; legacy un-tagged defaults to spirit.
- Built: type added, `TraitsCard` add-form has pillar picker, `addTrait`/`updateTrait` accept pillar, `character-grants` reads it from seed/root/branch data.

### 5. ~~Body composition system~~ ✅ 2026-05-19
- Body parts = items with `isBodyPart`, `partName`, `contains` (nested item array).
- Damage cascade: outer absorbs to resist, excess passes through. Piercing → designated internal; others → even split.
- "Body" damage type retired in favor of material + typed damage.
- Built: extended `GrowthWorldItem`, new `lib/body-damage.ts` with `routeDamage`, `HUMAN_BASELINE_ANATOMY`.

### 6. ~~Creature size~~ ✅ 2026-05-19
- `width × length` footprint + descriptive `height`. Open-ended scaling.
- Hard rules: reach scales with footprint; squeeze through opening 1 smaller.
- Carry capacity/push-pull stay Clout; cover/LOS are Terminal contextual rulings.
- Built: `CreatureSize` type, `lib/creature-size.ts`, `HUMAN_BASELINE_SIZE`.

### 7. ~~GM subscription drip~~ ✅ 2026-05-19
- 15k lump on subscribe. Curve: 2.5k m1 → 10k m12 peak → 3k m36+ steady.
- Built: `services/subscription-drip.ts` with `monthlyDrip()` + `cumulativeDrip()`.
- Parked (not blocking): sunset cash subscription / KRMA-as-service-payment.

### 8. ~~Goal abandonment~~ ✅ 2026-05-19
- No flat cost. Triggers Godhead reaction event; heavy investment → Godhead may apply a Thorn directly.
- Built: removed TODO from `goal.ts`, dispatcher routes `goal.abandoned` to Eth'erling.

### 9. ~~Brevity-Thorn~~ ✅ struck 2026-05-19
Not a real concept. Lifespan is its own track, authored per seed. Removed from doc.

### 10. ~~Beta content targets~~ ✅ 2026-05-19
- No hard counts; Seeds/Roots/Branches are agnostic ever-expanding pools (NOT nested per-seed).
- Beta gate is qualitative: drop-in test. Hand-author solid base examples, AI-generate the rest.

### 11. ~~Magic system~~ ✅ confirmed 2026-05-19
- 10 Schools across 3 Pillars (Mercy/Severity/Balance). Wild casting + Woven spells. Mana pool. Multi-school = weakest skill.
- Repo files in `04_MAGIC_PILLARS/*` confirmed canon.

### 12. ~~Item quality tier names~~ ✅ 2026-05-19
- Crude / Common / Sound / Fine / Refined / Superior / Exquisite / Masterwork / Mythic / Divine.
- Flavor only, zero mechanical weight.
- Built: `QUALITY_TIER_NAMES`, `getQualityTierName()` in `types/item.ts`.

### 13. ~~Email provider~~ ✅ Resend 2026-05-19
- Built: `lib/email.ts` `ResendEmailProvider`. Env: `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`.

### 14. ~~Anthropic API keys~~ ✅ directive 2026-05-19
- Separate scoped keys per service domain (Godhead dispatcher, character gen, in-session tracking, UI). Specific key architecture delegated to engineer.

---

## STILL OPEN (active blockers — none requiring design input)

Nothing currently blocks coding work on the resolved items.

### Security (added 2026-07-10, T11):
- ~~**Leaked ANTHROPIC_API_KEY**~~ ✅ REMOVED 2026-07-12. Mike: old key, remove it. Purged from the LOCAL repo entirely — deleted branch `archive/master-local-may-DO-NOT-PUSH`, local tag `pre-secret-scrub-2026-05-19`, and the filter-branch `refs/original` backup, then `reflog expire --all` + `gc --prune=now`. Verified commit `a40fba4` (held the key at `standalone/.env`) is purged; no `sk-ant-` reachable from any ref. Confirmed NEVER on origin (not an ancestor of `origin/master`; pushed tag `pre-T11-merge` doesn't contain it). Active `app/.env` key is a SEPARATE valid key — untouched.

### Content (added 2026-07-11, T27):
- **Starting-trait rule text missing.** Test-fixture traits (`Adaptable`, `Haunted` from seed-test-srb) are name-only — no mechanical text exists anywhere, so JEWL correctly reports NONE ON FILE and can't enforce them. Needs authored rule text (you or Kai-with-curation; I don't invent trait mechanics). Also flagged for the executor: T23/T24 should make `applyCreationGrants` pass FULL blueprint rule text + rollModifiers through to trait instances.

### Canon (added 2026-07-10, T17):
- ~~**JEWL's pillar enum**~~ ✅ RESOLVED 2026-07-12 — **BALANCE is correct.** Mike: JEWL is Balance now; he was Severity during the FIRST Prime campaign that established the lore. Current seed (`BALANCE`) stands, no change.

### Plan defect (added 2026-07-12, T01):
- **T01 accent-token rename is based on stale info — did the pillar swap only.** The canonical part of T01 (pillar CSS vars: body `#f7525f`, spirit `#582a72`, soul `#002f6c`) is DONE. But T01 also says to rename `--accent-teal`→`--terminal-prime` and `--accent-gold`→`--krma-gold` with an acceptance test of "zero occurrences in app/src". Reality: those tokens ARE defined in globals.css and used across ~37/32 files; `--terminal-prime` is NOT defined anywhere. DRIFT-5's premise (tokens undefined) is stale. A blind rename would (a) point 37 files at an undefined var, (b) wrongly brighten `--accent-gold` #D0A030 where it's the deliberate muted "gold-n" (Part C §2.3/§5.2). Also note both accent hexes are slightly off-canon: teal `#2DB8A0` vs INV-03 canon `#22ab94`; gold `#D0A030` is the gold-n, not KRMA gold. **Decision needed:** do you want a full repo-wide accent→canon sweep (define `--terminal-prime`=#22ab94, migrate all usages, correct hexes), or leave the accent tokens as-is? Left untouched for now.

### Plan defect (added 2026-07-12, T03):
- **T03 hex-literal sweep is ~3.4x the estimate and partly blocked — DEFERRED, not started.** Plan said "~20 files"; actual is **68 files / 621 hit lines** of the 5 canon hexes. Two problems: (1) `#22ab94` (terminal teal) has NO token to convert to — `--terminal-prime` isn't defined in globals.css (same gap as the T01 accent flag; I can add `--terminal-prime: #22ab94` per INV-03/Part C §1.4 if you want, it's canon not a judgment call). (2) A 621-line app-wide color refactor is unverifiable overnight (Playwright MCP down) and risks widespread visual drift if a fleet mis-converts a gradient/opacity-concat/className-arbitrary-value. Conversions are value-preserving in principle (`PILLARS.body.color`==='#f7525f'), so a tightly-instructed sonnet fleet (one agent per file, deterministic hex→token map, build-gated) is the right tool — but I'd want you able to eyeball the result. **Decision needed:** green-light the fleet sweep (I'll add `--terminal-prime` first), or leave it. Skipped for now to work safer functional tasks.

### Design question — T28 onboarding handoff (added 2026-07-12):
- ✅ RULED 2026-07-12 — **GM approves backstory first** (no player self-advance); **portrait work stays open to the player** during review. Final crystallized sheet needs a **4-party approval** (Trailblazer + Watcher + system/crystallization-line + Godhead-chain w/ JEWL as face). Full model in memory `[[character-sheet-approval-model-2026-07-12]]`. T28 immediate build = the backstory-approval gate + GM "build character" handoff; the 4-party sign-off layers onto the crystallize step later. Buildable now (queued behind T14).
- **T28 is bigger than "a dead button" and needs a flow ruling before I build it.** Findings: (1) the player's "Submit to Watcher" button in `CharacterTab.tsx` (member-stage, no Character row yet) only calls `save()` — it can't change the member's status because `PATCH /api/campaigns/[id]/members/me` accepts `characterDesc` ONLY, so the GM gets NO signal the player finished their backstory. (2) The GM surface `TapestryTab.tsx` shows member status labels but has **no "Build Character" action** on BACKSTORY/CHARACTER_CREATION members (only Accept/Reject on INTERESTED). (3) `EntityCreationWizard` takes an `entityId`, not a member's `characterDesc`, so it can't yet preload from a player's backstory. **The ruling I need:** when a player submits their backstory, do they self-advance BACKSTORY→CHARACTER_CREATION, or does the GM approve the backstory first (BackstoryEditor.tsx:178 says "Backstory approved. Your Watcher is building…", implying a GM approval gate)? Once you tell me the state machine, this is ~3 files: members/me status transition (constrained), a TapestryTab "Build Character" button, and wizard preload-from-member. Left unbuilt — I won't guess the flow (INV-84/85).

### Economy design confirm (added 2026-07-13, T15):
- **Payout-report basis definition — confirm.** Built the payout-report service (`services/krma/payout-report.ts`, INV-114): each GM steward's payout basis = Σ over their campaigns of (fluid liquid + crystallized locked), via the existing `getCampaignEconomy`. Test 7/7 (shares sum to 100%, JEWL + `__PRIME__` excluded per INV-70). **Two choices I made — veto if wrong:** (1) the basis is the GM's IN-WORLD KRMA (campaign fluid+crystallized) and does NOT include their UNDEPLOYED user-wallet drip balance — INV-114 frames it as "how much of their KRMA is deployed in their world," but if undeployed drip should count toward payout it's a one-line add; (2) `__PRIME__` is excluded (control room, not a booth). **Deferred (UI):** the GM-facing utilization widget ("Your KRMA: X total / Y liquid / Z deployed") — unverifiable overnight with Playwright MCP down; the data (`getCampaignEconomy`) + report service are ready for it.

### T19 mistake-dispute loop (added 2026-07-14):
- ✅ RULED 2026-07-14 — **transfer-on-acceptance** (you picked it over transfer-on-flag). Built: flag records a claim (no KRMA); JEWL `acknowledged` pays the bounty JEWL→GM; JEWL `disputed` invokes **Et'herling** (`rule_jewl_mistake` godhead tool) who rules `upheld` (pays) or `overturned` (nothing). Amounts now live in EconomyConfig `mistakeBounty` (10/100/1000 default, ADMIN-tunable). Rollback flag `MISTAKE_BOUNTY_ENABLED`. `scripts/test-jewl-mistake.ts` 24/24, npm test 28, build green.
- **Needs a live real-API smoke (like T32's golden path):** the deterministic test drives the `rule_jewl_mistake` tool directly. The full `disputeMistake → Eth'erling LLM invocation → she calls the tool` path builds + is wired, but a real Anthropic call in a dev campaign hasn't been run to confirm she actually reaches for the tool. Recommend one supervised dispute in the Prime campaign when you're next present.
- **Guesstimate to confirm:** bounty amounts (10/100/1000 KRMA by severity). Trivial vs JEWL's 1B wallet by design; tune from the corpus later.

### Dev environment (added 2026-07-10, T08):
- **whisper-server won't start via /boot** — `start.bat` not found (`logs/whisper.err.log`). Pre-existing; dev server itself fine. Say the word and I'll fix the launcher path.

### Production-side (not engineering blockers, but required for beta launch):
- **Hosting platform** decision (Vercel / Fly / Railway).
- **Stripe** account + product/price IDs.
- ~~**Schema drift fix**~~ ✅ 2026-07-10 T08 — migrations/schema/db reconcile clean; `npm run seed:all` rebuilds everything incl. `__PRIME__`.
- **Legal docs** — ToS / Privacy / Refund / Acceptable Use (needs lawyer).
- **Support contact channel** — email, ticket system, Discord?

### Future / post-beta:
- Sunset cash subscription model + KRMA-as-service-payment plumbing.
- Spirit-economy income path for ghosts to rebuild Frequency capacity (currently stuck at 0 max).
- GM "flag overpowered" mechanic.
- AI Oracle (co-GM).
- KRMA → ledger crypto / equity endgame.

---

## How to work this list

The active blockers section is intentionally empty — pick up engineering with the resolved canon as the source of truth. If a new design question surfaces during implementation, add it here.
