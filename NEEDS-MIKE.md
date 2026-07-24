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

## STILL OPEN — ⚠ SEVERAL NEED MIKE'S DESIGN RULINGS (as of 2026-07-17)

> **The build queue is EXHAUSTED — every remaining task waits on an answer
> below.** The ones needing actual design calls (not just actions) are marked
> **[RULING]**. Answer inline under each item, or say it on voice.

**[RULING] items at a glance:**
1. ~~**T21 gap 1 residual** — Spend-credits-KRMA op~~ ✅ RULED 2026-07-19 (r-2026-07-19-01): RETIRED. No character→wallet conversion except spirit-package breakdown after death. Built same day.
2. ~~**T21 gap 2** — dedicated Frequency meter~~ ✅ RULED 2026-07-19 (r-2026-07-19-02): NO meter — players aren't meant to know about burn early. Ops trigger removed from the player sheet same day.
3. ~~**T28 pt 2** — entity ownership~~ ✅ RULED 2026-07-20 (r-2026-07-20-01, refined 2026-07-22): player drafts narrative — NO stats yet because stats are DERIVED from the story (story→mechanics), not hidden → GM sign-off → GM+JEWL find/create a Seed that MATCHES the backstory (that seed starts the stats), + Root/Branches, custom or hub content → player approves → godhead chain logs/monitors → crystallize into Party folder. Ownership = a GM-assigned controller FLAG on canvas/tapestry (players/AI/himself), no transfer machinery. T28 pt 2 build UNBLOCKED.
4. **Magic advancement / full casting** — ✅ DESIGN RULED 2026-07-22 (r-2026-07-22-01): build full casting, not a stub. Locked: DR-50+ = system/Terminal oversight threshold; mana↔KRMA is a FIXED system rate (≈4:1, **exact # TBD**); JEWL co-pilots ALL casting; spells = freeform authored objects w/ predefined fields (like nectars/thorns, can emit permanent effects); Woven approval routes player→GM→godhead. Schema ✅ SIGNED OFF 2026-07-23 (r-2026-07-23-01). Foundation shipped (magic-cast engine + tunable config + spell schema, `828acb0`). **Still needs Mike (playtest-gated, not blocking the build):** (a) exact mana↔KRMA number; (b) per-effect DR value review (Mike: "DR is a detailed thing we should discuss"). Build follow-ons listed in STATE-OF-PLAY.
   **Cast route SHIPPED 2026-07-23** (`services/magic-cast-ops.ts` + POST `/api/characters/[id]/cast`, e2e 17/17). **Woven pipeline SHIPPED 2026-07-23** (spell forge type → player request → GM approve → godhead-authorable mechanics → learnSpell → knownSpells → castable; test-spell-pipeline 9/9).
   ~~(c)-(g) canon-silent defaults~~ ✅ ALL RULED 2026-07-23 evening (ruling session #2, r-2026-07-23-02..-08): (c) mana consumed on fail BUT its KV LINGERS with the spell → slow decay to GM wallet (longer for powerful casts), godhead-attractable, tappable by others, spell-craftable overrides (r--02); (d) resolve-then-verify ASYNC — godhead invocation logs+verifies DR-50+ value movement after the cast lands (r--03); (e) mana gain is NARRATIVE — build a GM/JEWL adjust op, no regen loop (r--05); (f) `magic.<pillar>.trainableSchools` CONFIRMED — wire cost-2 advancement (r--06); (g) spells DO carry KV — matched narratively (reagents/Frequency/time), ADMIN-tunable weave fee → authoring godhead, liquid KV-equivalent returns to GM (r--04, supersedes the no-KRMA interim). Also ruled: payout basis = TOTAL TKV incl. undeployed wallet (r--07, corrects T15 choice #1); mistake bounties stay tunable at 10/100/1000, future option adjudicator-priced (r--08); accent-token sweep GREENLIT. Build pass SHIPPED same session (school advancement, payout fix, DR-50 dispatch→Selva/Triu, spell KV+weave fee, ManaResidue lifecycle, adjust_mana, sweep).
   ~~mana KV custody~~ ✅ RULED 2026-07-23 (r-2026-07-23-11): mana is a NARRATIVE CONTAINER for KRMA like everything else — no escrow, no ledger leg; the shipped bookkeeping-only residue implementation is the CORRECT final shape. Also ruled same sitting: ~~balance numbers~~ (r--09: delegated to the godhead system) and ~~tuning authority~~ (r--10: godheads VOTE amongst themselves; ADMIN override absolute). Dispatcher flip + whisper-launcher fix greenlit; deep AI session planned next.
5. **T42** — which is truth: in-code materials catalog or Complete_Materials_Reference.md? And where do the 9 depletion-condition effects canonically live? (6 sub-questions: docs/t42-reference-audit-2026-07-17.md)
6. **Economy confirm** — T15/T19 guesstimate amounts (payout split, mistake bounties 10/100/1000).

**Action (not design) items:** T19 live Et'herling smoke (needs you present), T12 pod smoke, whisper launcher fix, hosting/Stripe/production list below.

### Security (added 2026-07-10, T11):
- ~~**Leaked ANTHROPIC_API_KEY**~~ ✅ REMOVED 2026-07-12. Mike: old key, remove it. Purged from the LOCAL repo entirely — deleted branch `archive/master-local-may-DO-NOT-PUSH`, local tag `pre-secret-scrub-2026-05-19`, and the filter-branch `refs/original` backup, then `reflog expire --all` + `gc --prune=now`. Verified commit `a40fba4` (held the key at `standalone/.env`) is purged; no `sk-ant-` reachable from any ref. Confirmed NEVER on origin (not an ancestor of `origin/master`; pushed tag `pre-T11-merge` doesn't contain it). Active `app/.env` key is a SEPARATE valid key — untouched.

### Content (added 2026-07-11, T27):
- **Starting-trait rule text missing.** Test-fixture traits (`Adaptable`, `Haunted` from seed-test-srb) are name-only — no mechanical text exists anywhere, so JEWL correctly reports NONE ON FILE and can't enforce them. Needs authored rule text (you or Kai-with-curation; I don't invent trait mechanics). Also flagged for the executor: T23/T24 should make `applyCreationGrants` pass FULL blueprint rule text + rollModifiers through to trait instances.

### Canon (added 2026-07-10, T17):
- ~~**JEWL's pillar enum**~~ ✅ RESOLVED 2026-07-12 — **BALANCE is correct.** Mike: JEWL is Balance now; he was Severity during the FIRST Prime campaign that established the lore. Current seed (`BALANCE`) stands, no change.

> ✅ T01/T03 accent-token decision RESOLVED 2026-07-23 — Mike: "yeah do it." Executed same session: `--terminal-prime: #22ab94` (+ `--color-terminal` alias) defined in globals.css; 5-agent sweep migrated ~470 standalone canon-hex usages across 65 files to tokens (value-preserving). Deliberately kept as hex: alpha-concatenated literals/feeder constants, canvas/three.js color inputs, equality-compared constants, native color inputs, DB-persisted values, and the PILLARS source-of-truth in types/growth.ts. `--accent-teal`/`--accent-gold` left as the deliberate muted accents (NOT renamed — the T01 rename premise was stale). Details in the two entries below, kept for history.

### Plan defect (added 2026-07-12, T01):
- **T01 accent-token rename is based on stale info — did the pillar swap only.** The canonical part of T01 (pillar CSS vars: body `#f7525f`, spirit `#582a72`, soul `#002f6c`) is DONE. But T01 also says to rename `--accent-teal`→`--terminal-prime` and `--accent-gold`→`--krma-gold` with an acceptance test of "zero occurrences in app/src". Reality: those tokens ARE defined in globals.css and used across ~37/32 files; `--terminal-prime` is NOT defined anywhere. DRIFT-5's premise (tokens undefined) is stale. A blind rename would (a) point 37 files at an undefined var, (b) wrongly brighten `--accent-gold` #D0A030 where it's the deliberate muted "gold-n" (Part C §2.3/§5.2). Also note both accent hexes are slightly off-canon: teal `#2DB8A0` vs INV-03 canon `#22ab94`; gold `#D0A030` is the gold-n, not KRMA gold. **Decision needed:** do you want a full repo-wide accent→canon sweep (define `--terminal-prime`=#22ab94, migrate all usages, correct hexes), or leave the accent tokens as-is? Left untouched for now.

### Plan defect (added 2026-07-12, T03):
- **T03 hex-literal sweep is ~3.4x the estimate and partly blocked — DEFERRED, not started.** Plan said "~20 files"; actual is **68 files / 621 hit lines** of the 5 canon hexes. Two problems: (1) `#22ab94` (terminal teal) has NO token to convert to — `--terminal-prime` isn't defined in globals.css (same gap as the T01 accent flag; I can add `--terminal-prime: #22ab94` per INV-03/Part C §1.4 if you want, it's canon not a judgment call). (2) A 621-line app-wide color refactor is unverifiable overnight (Playwright MCP down) and risks widespread visual drift if a fleet mis-converts a gradient/opacity-concat/className-arbitrary-value. Conversions are value-preserving in principle (`PILLARS.body.color`==='#f7525f'), so a tightly-instructed sonnet fleet (one agent per file, deterministic hex→token map, build-gated) is the right tool — but I'd want you able to eyeball the result. **Decision needed:** green-light the fleet sweep (I'll add `--terminal-prime` first), or leave it. Skipped for now to work safer functional tasks.

### T28 onboarding handoff (added 2026-07-12; half shipped 2026-07-15):
- ✅ SHIPPED 2026-07-15 — **the submission-signal half** (the dead-button fix). Player's member-stage "Submit to Watcher" now PATCHes `members/me { submit: true }` → sets `CampaignMember.backstorySubmitted` (guarded to status=BACKSTORY); CharacterTab shows "Submitted — keep refining your portrait"; TapestryTab shows a "✓ Backstory ready" badge to the GM. Portrait/identity stays open (ruling honored). Migration + build green; column verified live.
- ⏳ REMAINING — **the GM build-wizard handoff needs a design call before I build it.** The acceptance test's "GM opens wizard pre-loaded with the player's backstory context" is bigger than a button because: (1) `EntityCreationWizard` is **entity-based** (edits an existing draft entity via `/entities/[entityId]`) and its backstory field literally reads *"PC backstory import coming soon"* (wizard line ~204) — threading the member's backstory in is its own task; (2) `createDraftEntity(campaignId, gmUserId, role)` creates an entity **owned by the GM**, but a player's character should be owned by the **player** and linked back to their member row — that ownership/link flow isn't defined. **The call I need:** when the GM clicks "Build Character" on an approved backstory, who owns the created draft entity (player vs GM-until-locked), and how does it link to the member (characterDesc copy? member.characterId?)? Once you rule, this is: a "Build Character" button in TapestryTab + a create-entity-for-member path + wizard backstory preload. Not built — won't guess ownership (INV-84/85).
- ✅ RULED 2026-07-12 — **GM approves backstory first** (no player self-advance); **portrait work stays open to the player** during review. Final crystallized sheet needs a **4-party approval** (Trailblazer + Watcher + system/crystallization-line + Godhead-chain w/ JEWL as face). Full model in memory `[[character-sheet-approval-model-2026-07-12]]`. T28 immediate build = the backstory-approval gate + GM "build character" handoff; the 4-party sign-off layers onto the crystallize step later. Buildable now (queued behind T14).
- **T28 is bigger than "a dead button" and needs a flow ruling before I build it.** Findings: (1) the player's "Submit to Watcher" button in `CharacterTab.tsx` (member-stage, no Character row yet) only calls `save()` — it can't change the member's status because `PATCH /api/campaigns/[id]/members/me` accepts `characterDesc` ONLY, so the GM gets NO signal the player finished their backstory. (2) The GM surface `TapestryTab.tsx` shows member status labels but has **no "Build Character" action** on BACKSTORY/CHARACTER_CREATION members (only Accept/Reject on INTERESTED). (3) `EntityCreationWizard` takes an `entityId`, not a member's `characterDesc`, so it can't yet preload from a player's backstory. **The ruling I need:** when a player submits their backstory, do they self-advance BACKSTORY→CHARACTER_CREATION, or does the GM approve the backstory first (BackstoryEditor.tsx:178 says "Backstory approved. Your Watcher is building…", implying a GM approval gate)? Once you tell me the state machine, this is ~3 files: members/me status transition (constrained), a TapestryTab "Build Character" button, and wizard preload-from-member. Left unbuilt — I won't guess the flow (INV-84/85).

### Economy design confirm (added 2026-07-13, T15):
- **Payout-report basis definition — confirm.** Built the payout-report service (`services/krma/payout-report.ts`, INV-114): each GM steward's payout basis = Σ over their campaigns of (fluid liquid + crystallized locked), via the existing `getCampaignEconomy`. Test 7/7 (shares sum to 100%, JEWL + `__PRIME__` excluded per INV-70). **Two choices I made — veto if wrong:** (1) the basis is the GM's IN-WORLD KRMA (campaign fluid+crystallized) and does NOT include their UNDEPLOYED user-wallet drip balance — INV-114 frames it as "how much of their KRMA is deployed in their world," but if undeployed drip should count toward payout it's a one-line add; (2) `__PRIME__` is excluded (control room, not a booth). **Deferred (UI):** the GM-facing utilization widget ("Your KRMA: X total / Y liquid / Z deployed") — unverifiable overnight with Playwright MCP down; the data (`getCampaignEconomy`) + report service are ready for it.

### T19 mistake-dispute loop (added 2026-07-14):
- ✅ RULED 2026-07-14 — **transfer-on-acceptance** (you picked it over transfer-on-flag). Built: flag records a claim (no KRMA); JEWL `acknowledged` pays the bounty JEWL→GM; JEWL `disputed` invokes **Et'herling** (`rule_jewl_mistake` godhead tool) who rules `upheld` (pays) or `overturned` (nothing). Amounts now live in EconomyConfig `mistakeBounty` (10/100/1000 default, ADMIN-tunable). Rollback flag `MISTAKE_BOUNTY_ENABLED`. `scripts/test-jewl-mistake.ts` 24/24, npm test 28, build green.
- **Needs a live real-API smoke (like T32's golden path):** the deterministic test drives the `rule_jewl_mistake` tool directly. The full `disputeMistake → Eth'erling LLM invocation → she calls the tool` path builds + is wired, but a real Anthropic call in a dev campaign hasn't been run to confirm she actually reaches for the tool. Recommend one supervised dispute in the Prime campaign when you're next present.
- **Guesstimate to confirm:** bounty amounts (10/100/1000 KRMA by severity). Trivial vs JEWL's 1B wallet by design; tune from the corpus later.

### T21 Frequency pool UI — mostly pre-built, two gaps need your call (added 2026-07-15):
- **~70% already exists** (do NOT rebuild): `FrequencyOpsPanel.tsx` is the full Spend/Deplete/Burn picker with live burn-preview; `services/frequency.ts` (spend reduces max + credits the character wallet 1:1; deplete reduces current only) + `services/burn.ts` (scaledCost formula, sink transfer) + routes `/frequency` and `/burn`; CharacterSheet mounts the ops trigger; CharacterCard highlights Frequency; RestPanel restores. Deplete + Burn match the spec's acceptance test as-is.
- **Gap 1 — ✅ BUILT 2026-07-15 via the advancement loop (r-2026-07-15-01); residual ✅ RULED 2026-07-19 (r-2026-07-19-01):** Spend-credits-KRMA RETIRED — no transfers into a player's wallet from their own character except breaking down a spirit package after death. frequency.ts narrowed to Deplete; FrequencyOpsPanel now Deplete/Burn only.
- **Gap 2 — dedicated meter (visual call).** Spec wants Frequency as its own prominent zone with **burn-scar tick marks** for burned capacity, "NOT one bar among nine." Today it's an `AttributeBlock` among the nine, just gold-highlighted. Want me to build the standalone meter, or is the highlighted bar good enough for beta?

### Magic advancement wiring — no cast flow to hook (added 2026-07-15):
- r-2026-07-15-01 says magic-school levels advance at cost **2**, marked on **Wild Cast failure** (not Woven). `ADVANCE_COST_MAGIC_SKILL` is ready, BUT there is **no server-side casting/resolution flow in the app at all** (magic exists only as sheet data: `magic.{mercy,severity,balance}.skillLevels` + display components). Nothing to mark from. Options: (a) wait until the casting flow is built (my default — flag and move on), or (b) build a minimal wild-cast check route now just to drive advancement. Also needs a structure call when built: trainable school marks would live per-pillar (e.g. `magic.mercy.trainableSchools`) — confirm when we get there.

### T42 reference-data seeding BLOCKED — sources aren't what the plan assumed (added 2026-07-17):
- The plan calls `Condition_Effects_Reference.md` post-audit-trustworthy. It isn't: `#needs-validation`, WTH-era staleness self-flagged, and **it does not contain the 9 depletion conditions at all** (older taxonomy: monkey paws / injury tiers / hit-location / etc.). The depletion effects the app uses live only in code + CANON_CORE §2.
- `Complete_Materials_Reference.md` is `#needs-review` and diverges from the in-code catalog on nearly EVERY field (13 name-matched materials, one exact numeric agreement total); 10 code-only materials, 33 reference-only rows; three conflicting weight scales, none in lbs.
- Full audit + 6 specific questions: `docs/t42-reference-audit-2026-07-17.md`. **Core question: which is truth — the tuned in-code catalog or the reference file?** I won't seed either direction without your call.

### Dev environment (added 2026-07-10, T08):
- ~~whisper-server won't start via /boot~~ ✅ FIXED 2026-07-23 (Mike: "fix it"). TWO stacked bugs: boot.ps1 passed a bare `start.bat` that cmd couldn't resolve (now absolute path, single-string ArgumentList to survive PS 5.1 quoting) AND start.bat had unescaped parens in an echo inside an `if` block (cmd parse error even when the branch is skipped — now `^(...^)`). Verified live: `/health` OK, model small.en on CUDA. Also same sitting: `GODHEAD_DISPATCHER=enabled` in app/.env.local (Mike: deep AI session next).

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
