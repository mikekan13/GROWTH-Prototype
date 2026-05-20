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

### Production-side (not engineering blockers, but required for beta launch):
- **Hosting platform** decision (Vercel / Fly / Railway).
- **Stripe** account + product/price IDs.
- **Schema drift fix** — pre-existing prisma migrations need to be applied to dev.db; running `prisma migrate dev` would reset. Decide when to migrate (will wipe dev data; re-seed via existing scripts after).
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
