# Items Blocked on Mike

> Last updated: 2026-05-19 (end of autonomous build pass)
>
> This is everything I (Claude) need from you to continue. Each item has:
> what's blocked, why, and a one-line ask. Work through these in the order
> that suits you — most are independent of each other.

---

## Tier 1 — Unblocks the most downstream work

### 1. ~~Burn formula (M5e)~~ ✅ RESOLVED 2026-05-19
- Burn = true permanent KRMA removal from the metaverse (NOT raw→crystallized conversion).
- 1 max Frequency = 1 KRMA. Burning N KRMA reduces max Freq by N.
- Cost judged by a high-level Godhead (Kai today; Terminal-tier eventually).
- Anti-deflationary scaling: `scaledCost = baseCost × (1 + burnSinkBalance / 50_000)`. ~1×→~2× over year 2.
- Built: `services/burn.ts`, `app/api/characters/[id]/burn`.

### 2. Spirit Package composition (M1d / M5d)
- **Blocks:** Death-split UI labels (I built the modal but the "Spirit Package" component breakdown is generic), full death wiring.
- **Why blocked:** Roadmap marks composition `[NEEDS MIKE]`. I know it routes to player wallet but not the per-component split.
- **Ask:** What goes into a Spirit Package? Body→campaign, Frequency→Lady Death, but the player-bound portion — is it Soul KV? Soul + named traits? Confirm the components.

### 3. Body composition system (M1b / M2b)
- **Blocks:** Body-part-targeted damage, non-humanoid seeds (Halfling, Goblinoid, Nephilim), inventory paperdoll per-Seed regions.
- **Why blocked:** Memory says "modular, custom bodies are coming — discussed before implementing."
- **Ask:** A 15-minute design conversation. Memory has notes — parts-as-items in nested containers, Piercing = Container Penetration, sense/action catalogs. Want to lock the data shape together.

### 4. Creature Size system
- **Blocks:** Halfling, Goblinoid, Nephilim seed designs and any size-defined seed authoring.
- **Why blocked:** Categories + per-category effects (reach, weapon sizing) not yet defined.
- **Ask:** Pick canonical size categories (e.g. Tiny / Small / Medium / Large / Huge) and what each one mechanically does.

---

## Tier 2 — Economic & subscription

### 5. GM subscription bell-curve values (M5a)
- **Blocks:** Subscription → wallet allocation hook.
- **Why blocked:** Need the actual KRMA numbers for the bell-curve distribution.
- **Ask:** "First payment lump sum = X KRMA; monthly drip = Y KRMA at month 1, decaying via Z curve to floor of W by month 12" — fill in numbers.

### 6. Goal abandonment KRMA cost
- **Blocks:** Goal-cancel UX feels free right now (placeholder cost of 0). Currently the goal.ts comment says "amount TBD."
- **Why blocked:** No formula yet.
- **Ask:** Flat cost? Percentage of priority? Something tied to the resistance entities already invested?

### 7. Brevity-Thorn template
- **Blocks:** Short-lived seed authoring (anything where the seed is meant to expire fast).
- **Why blocked:** Open question from May 8 KRMA economy research.
- **Ask:** Confirm whether short-lived seeds get a built-in Thorn template that handles their expiration, or whether each authoring case is bespoke.

---

## Tier 3 — Production infrastructure

### 8. Hosting platform decision (M6c)
- **Blocks:** Production deploy pipeline, custom domain, TLS, env var management.
- **Why blocked:** Vercel vs Fly vs Railway is your call (cost, region, latency, comfort).
- **Ask:** Pick one. I'll wire the CI/CD config and env scaffolding around it.

### 9. Stripe account + product/price IDs (M6a)
- **Blocks:** M5a (subscription → wallet), beta launch.
- **Why blocked:** Needs your Stripe account.
- **Ask:** Create account, define one product with the GM seat-bundle price, share publishable key + price IDs.

### 10. Schema drift fix
- **Blocks:** Email verification + password reset DB persistence (currently in-memory only). Also blocks any future migrations because the next one will reset the dev DB.
- **Why blocked:** Pre-existing schema changes (GodHead index additions in latest migrations) haven't been applied to `dev.db`; running `prisma migrate dev` triggers a full reset and I didn't want to wipe your test data.
- **Ask:** Run `npx prisma migrate reset` when ready (will wipe dev.db), then `npx tsx scripts/seed-admin.ts && scripts/seed-canonical-seeds.ts && scripts/seed-test-srb.ts && scripts/seed-pipeline-character.ts` to repopulate. After that I can add the EmailVerificationToken + PasswordResetToken models cleanly.

---

## Tier 4 — Legal & support (M7)

### 11. Terms of Service [NEEDS LAWYER]
### 12. Privacy Policy [NEEDS LAWYER]
### 13. Refund policy [NEEDS LAWYER]
### 14. Acceptable use policy [NEEDS LAWYER]
- **Blocks:** Beta launch (can't take money without these).
- **Why blocked:** Needs a lawyer.
- **Ask:** Engage a lawyer once Stripe is in place. I can draft FIRST DRAFTS for the lawyer to revise — just say the word.

### 15. Support contact channel
- **Blocks:** Support inbox monitoring, status page, bug-report path inside the app.
- **Why blocked:** Email? Ticket system? Discord?
- **Ask:** "support@gro.wth, monitored daily" or similar — give me an answer and I'll wire the channel.

---

## Tier 5 — Content library targets (M9)

### 16. Beta content counts
- **Blocks:** M9 — content seeding for beta launch.
- **Why blocked:** No target counts.
- **Ask:** For beta, how many of each:
  - **Seeds** (suggest 12-15)
  - **Roots per Seed** (suggest 3-5)
  - **Branches per Root** (suggest 2-3)
  - **Nectars** (suggest 20-30)
  - **Thorns** (suggest 20-30)
  - **Items** (suggest 30-50: weapons, armor, gear)
  - **Spells** (suggest 20-30 across schools)

### 17. Magic system mechanics confirmation
- **Blocks:** Spell library authoring.
- **Why blocked:** Roadmap says "mechanics confirmed against current canon" is needed before authoring.
- **Ask:** Confirm the magic resolution model (does it use a skill check? KRMA spend? Both?) for beta — even minimal canon is fine.

### 18. Quality field per-tier descriptions
- **Blocks:** Item Quality UX clarity.
- **Why blocked:** Old "Poor / Standard / etc." list was rejected; no replacement.
- **Ask:** Optional — name the 1-10 quality tiers (e.g. "1=junk, 5=well-made, 10=masterwork"). Numeric works fine without names.

---

## Tier 6 — Small confirmations

### 19. Anthropic API key for dispatcher
- **Blocks:** Real Godhead behavior in dev (currently dispatcher records PENDING invocations but doesn't run the agent loop).
- **Why blocked:** I won't burn your tokens without permission.
- **Ask:** Add `ANTHROPIC_API_KEY` to `app/.env` and `GODHEAD_DISPATCHER=enabled`. Or tell me which env file to add them to.

### 20. Email provider choice (post-MVP)
- **Blocks:** Production email delivery (currently uses console-log stub).
- **Why blocked:** Need API key.
- **Ask:** Pick one — Resend / Postmark / SES — and share API key. Already env-swappable.

### 21. Wizard AI generation wiring (EntityCreationWizard.tsx:715,733)
- **Blocks:** Quick-mode NPC speed creation (M1f).
- **Why blocked:** Endpoint needs to read campaign context; you mentioned ANTHROPIC_API_KEY is needed first.
- **Ask:** Combine with #19 — once API key is set, this unblocks.

---

## Tier 7 — Design conversations that should happen eventually (not blocking)

- **GM "flag overpowered" mechanic** — repo doc exists, no implementation. Post-beta.
- **KRMA → ledger crypto** — long-term equity vision. Depends on legality + working product first.
- **Reversible book** — Flow-front/Focus-back lore + mechanics. AI-assisted page creation. App comes first.
- **Oracle / AI co-GM** — VAD → ASR → diarization → game state derivation. Too complex for beta.

---

## How to work this list

When you're back, easiest path is probably:

1. **Skim Tier 1** — pick whichever feels easiest to verbalize. We can knock out 2-3 of those in a single sitting.
2. **Tier 2 + Tier 3** — most are short numeric answers or platform picks; quick.
3. **Tier 5** — give me target counts and I'll author the content through the Forge chain.
4. **Tier 4** — handle when you're ready to take real money.
5. **Tier 6** — small env/key tasks. Do these whenever.

I'll resume work from this list each session.
