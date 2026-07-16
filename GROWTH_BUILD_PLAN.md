# GROWTH_BUILD_PLAN.md

**Generated:** 2026-07-10 · **Author:** Fable 5 (full-corpus pass) · **Approved rulings:** `GROWTH_CRITICAL_REVIEW.md` addendum + `memory/structural-rulings-2026-07-10.md`
**Audience:** The Executor — a Sonnet-class model that has NOT read the GROWTH corpus. Everything you need is in this document. Do not go looking for the big picture; it is encoded here.

---

# PART A — EXECUTOR PRIMER (read first, every session)

## A.0 The Protocol

1. **Source-of-truth order:** Michael's live answer > this plan + the design docs it cites > the committed code. Code shows what was built, not always what's correct.
2. **The one rule: when unsure, STOP AND FLAG. Never guess. Especially lore.** If a task seems to require a design, lore, or style decision that Parts A–C don't answer, that is a defect in the plan — stop, write the question into `NEEDS-MIKE.md` under a new heading with your task ID, and move to the next unblocked task.
3. **Never invent GROWTH rules, lore, names, or mechanics.** Every mechanic you implement is specified in your task or in an invariant below. Gaps in lore are *authored in play by Michael* — they are not yours to fill.
4. **The app must run after every task.** Run `npm run dev` from `app/` (or the `/boot` skill) and confirm the routes you touched load before marking a task done.
5. **One task per session/run.** Complete it, self-verify with the task's acceptance test, commit with the repo's commit style (Part B §10), stop.
6. **The same-mechanics principle (governs everything):** GROWTH's management layer runs on the SAME mechanics as table play. The Prime Campaign (`__PRIME__`, ADMIN-only, always seeded) IS the management system. Godheads are motivated AI agents playing with the standard toolset under Terminal-enforced **contracts**. There is no separate admin backend — ADMIN gets a slightly *unrestricted* variant of the same canvas. Never build god-only mechanics as a separate system.

## A.1 The Design Laws (invariants — violating any of these is a failed task)

> Generated 2026-07-09. Sources: CANON_CORE, GROWTH-DESIGN-TRUTH, CLAUDE.md, 31 memory files.
> Format: **[INV-NN] law** — why — source

---

## GROUP A — Game Mechanics (Pillars / Attributes / Resolution)

- **[INV-01] Spirit = Flow/Frequency/Focus (Sulfur, Purple #582a72). Soul = Willpower/Wisdom/Wit (Mercury, Blue #002f6c). Body = Clout/Celerity/Constitution (Salt, Red #f7525f).** — Soul/Spirit labels swapped Jan 2026 to align with Orthodox anthropology (soma/psyche/pneuma); the swap is settled, do not re-litigate. — source: CANON_CORE §2, soul-spirit-colors-settled.md

- **[INV-02] Always use `PILLARS.*.color` design token; never hard-code a hex literal.** — Token layer insulates palette updates from UI regressions. — source: CANON_CORE §2

- **[INV-03] Terminal = Teal `#22ab94`. KRMA = Gold `#ffcc78`. Each pillar has 3 Sephirot tones (see growth-color-palette.md).** — These are fixed branding constants tied to the Sephirot mapping. — source: CANON_CORE §2, CLAUDE.md Critical Design Facts

- **[INV-04] Canonical 9-attribute display order: Clout, Celerity, Constitution, Flow, Frequency, Focus, Willpower, Wisdom, Wit.** — Locked by ruling r-2026-04-22-09; any reordering breaks established UI contract. — source: CANON_CORE §2

- **[INV-05] Skill levels run 1–20. Levels 1–3 are flat bonuses (+1/+2/+3, no die). The skill die begins at level 4 = d4.** — Ruling r-2026-04-22-02; the "Learning Precipice" (3→4) is a design beat, not a UI bug. — source: MEM_skill_tiers, CANON_CORE §5

- **[INV-06] Seed-granted skill grants are capped at level 4 (d4). Seeds never grant a skill above d4.** — Species innate skills represent baseline training, not mastery; anything higher comes from Roots/Branches. — source: MEM_skill_tiers

- **[INV-07] Nectars/Thorns count cap = Fate Die face value (d4 → max 4; d20 → max 20).** — Fate Die is the character's "ceiling" for how much complexity they can carry. — source: GROWTH-DESIGN-TRUTH §5 (Nectars and Thorns)

- **[INV-08] 10 magic schools total: Mercy (Flow): Fortune, Restoration, Enchantment; Severity (Focus): Force, Alteration, Conjuration; Balance (Flow+Focus): Divination, Dissolution, Abjuration, Illusion.** — Canon school list from CANON_CORE §8; no schools may be added, renamed, or re-pillar-ed without Mike's ruling. — source: CANON_CORE §8

- **[INV-09] Dice RNG is cryptographic (crypto.getRandomValues() + rejection sampling). 3D physics animation is purely cosmetic — it does NOT determine the result.** — Fairness guarantee; the roll is settled server-side before physics runs. — source: MEM_dice

- **[INV-10] Attribute at 0 triggers a depletion condition. Each pillar attribute has a corresponding condition.** — Prevents attributes from silently flooring with no gameplay consequence. — source: CANON_CORE §2 (Depletion conditions)

- **[INV-11] Harvest = reward package between sagas. The minimum reward budget = years-aged × age-KV rate. GM may exceed the floor, never go below it.** — Rulings r-2026-04-22-07, r-2026-06-09-05; the floor prevents under-rewarding long sagas. — source: CANON_CORE §7

- **[INV-12] Skill advancement mechanic: failed check → skill marked trainable → rest + spend 1 KRMA → gain +1 level.** — Canonical trainable mechanic; do not implement any other XP or auto-advance path. — source: MEM_skill_tiers

---

## GROUP B — KRMA / KV Economy (Closed Loop, Burn, Wallet, Rates)

- **[INV-13] Total KRMA supply = 100 billion, hard cap. Only shrinks via Burn. Supply never increases.** — Economy is deflationary by design; any mechanism that creates new KRMA is a critical bug. — source: CANON_CORE §7

- **[INV-14] KRMA ledger is append-only, SHA-256 hashed, deterministic KV evaluator. GMs have knobs but cannot override KV.** — Trustless ledger prevents inflation manipulation at the campaign level. — source: CANON_CORE §7

- **[INV-15] Reserve allocation: Terminal 75B (one-way drain only), Balance 12.5B, Mercy 6.25B, Severity 6.25B.** — Reserve proportions are locked canon; never redistribute. — source: CANON_CORE §7

- **[INV-16] GM wallet = capacity ceiling, NOT a consumed balance. KRMA constrains GM power; it does not deplete with each action.** — Prevents the false pattern of "GM spent all KRMA on this character". — source: CANON_CORE §7, MEM_gm_wallet

- **[INV-17] GM subscription drip is fixed: 15,000 lump on subscribe; monthly m1 2,500 → m12 peak 10,000 → m36+ steady 3,000. PAST_DUE pauses drip; CANCELED preserves wallet balance.** — Locked by r-2026-05-19-06; do not invent alternative drip schedules. — source: CANON_CORE §7

- **[INV-18] Burn is the ONLY mechanic that removes KRMA from the system. All else is transfer. 1 max Frequency = 1 KRMA destroyed.** — Death, trade, crafting, and all other sinks are transfers between wallets, not destruction. — source: CANON_CORE §7, burn-mechanic-locked-2026-05-19.md

- **[INV-19] Burn formula: `scaledCost = baseCost × (1 + burnSinkBalance / 50_000)` (anti-deflationary). Global burn cap = 5 billion; after that Burn is disabled forever.** — Prevents hyperdeflation from runaway burning while maintaining scarcity. — source: CANON_CORE §7, burn-mechanic-locked-2026-05-19.md

- **[INV-20] Burn cost is judged by a high Godhead (Kai by default). It is not self-service.** — Prevents unilateral KRMA destruction without oversight. — source: CANON_CORE §7

- **[INV-21] KV for items and traits is graded case-by-case, NOT by a universal formula. Raw material KV < 1; crafted item KV ≥ 1; material KV is the floor.** — Ruling r-2026-04-22-15; formulaic grading was explicitly rejected. — source: CANON_CORE §7

- **[INV-22] Attribute advancement: 1 KRMA = 1 Frequency = 1 attribute level. All 9 attributes same rate regardless of pillar.** — Confirmed 2026-05-11; legacy "Body 4 KRMA/pt / Mind 8 KRMA/pt" rates in old KRMA_Costs_Table.md are WRONG. — source: MEM_attr_skills_rates

- **[INV-23] Skill advancement: 1 KRMA = 1 skill level (non-magic); 2 KRMA = 1 skill level (magic). No other rate exists.** — Confirmed 2026-05-11; the 2:1 magic rate reflects wider mechanical reach + Effort wagering. — source: MEM_attr_skills_rates

- **[INV-24] Nectar/Thorn KV grading: Kai-grades individually with synergies considered. No formula. Scale anchor: +1 mod to a roll ≈ 5 KV; contextual bonuses are less.** — Even the scale anchor is a reference point, not a formula. — source: MEM_seed_kv

---

## GROUP C — Character / Traits (Seeds, Nectars, Thorns, Skill Tiers)

- **[INV-25] Seed KV component formulas (locked 2026-05-08): 1 attribute aug = 1 KRMA; Base Resist = 2 KRMA/pt; Fate Die: d4=5, d6=10, d8=20 (default), d12=40, d20=80.** — Locked during Elven seed design; changing these invalidates all seeded characters. — source: MEM_seed_kv

- **[INV-26] All seed cost components are POSITIVE-ONLY. Use max(0, …) clamps. Negative contributions come ONLY through Thorn liens.** — Static refunds break the GM-wallet capacity model and can produce zero/negative cost seeds. — source: MEM_seed_kv, MEM_negatives_thorns

- **[INV-27] Negative KRMA contributions to seedKV (creation-cost discounts) are encoded as Thorn liens collected at death — never as static creation-time refunds.** — Mike's exact framing 2026-05-08: "I now remember why we didn't do the negative thing — it landed weird with the economy." — source: MEM_negatives_thorns

- **[INV-28] Nectar and Thorn rule text must be bearer-agnostic: use "the bearer", not the seed/species name. The text must work on any character carrying the trait.** — Ensures Nectars/Thorns can migrate between characters without broken text. — source: MEM_nectar_thorn_text

- **[INV-29] Negative effects (debuffs, penalties, disadvantages) live ONLY in Thorns. Nectars are always positive.** — Architectural contract for the trait system; mixing polarities in Nectars corrupts the KV model. — source: MEM_negatives_thorns

- **[INV-30] Seed skill grants are rare. Most seeds grant 0 skills. Seed skill grants are capped at d4. Cost = 1 KRMA × level (2× for magic).** — Old "Apprentice d2 = 10 / Novice d3 = 14" rates are stale and have no d2/d3 in canon. — source: MEM_skill_tiers

- **[INV-31] Items have `itemAbilities` — play-defining ability blocks similar to character traits. This field is REQUIRED; omitting it is a canonical error.** — Item abilities are a major canonical concept; current type that omits them is wrong. — source: MEM_item_fields

- **[INV-32] [UNVERIFIED — check with Fable] Items get power from their materials and container mechanics, not from flat numerical bonuses attached to stats.** — Implied by the material-KV-is-the-floor rule and item ability design, but no explicit "no flat +X stat bonuses on items" ruling was found in the sources. — source: MEM_item_fields (partial)

- **[INV-33] Character creation canonical flow: narrative backstory → Seed → GM-custom Root → GM-custom Branches → budget management (≥1 Frequency remaining) → GM crystallizes sheet.** — Q5.14 canon crystallization flow; do not reorder or allow player-authored Roots/Branches. — source: GROWTH-DESIGN-TRUTH §5

---

## GROUP D — Death / Frequency

- **[INV-34] Death = transformation, NOT destruction. Character continues as ghost (status: GHOST). Old DEAD status is superseded.** — Mike 2026-05-19: "the character keeps existing as a ghost/spirit form." — source: MEM_death_engine

- **[INV-35] On death: Body attrs (Clout/Celerity/Constitution) → level/current/augments = 0; their KRMA value transfers to GM/campaign wallet.** — Body is a physical substrate; ghosts lack it. — source: MEM_death_engine

- **[INV-36 CORRECTED 2026-07-13] On death: Soul attrs (Willpower/Wisdom/Wit) → halved; floor(½) KRMA → GM; the MAJORITY (ceil ½) stays on the character.** — Was "lost-half → Lady Death" — WRONG; Lady Death takes ONLY Frequency (INV-37). — source: [[death-split-corrected-2026-07-13]], MEM_death_engine

- **[INV-37] On death: Frequency → level/current = 0; full KRMA value of max-Freq capacity → Lady Death. Ghost has no Frequency capacity.** — Lady Death's wallet grows via character death — this is the economy's primary sink routing. — source: MEM_death_engine

- **[INV-38] On death: Spirit Flow + Focus remain untouched on the ghost.** — Spirit is the ghost's surviving nature. — source: MEM_death_engine

- **[INV-39 CORRECTED 2026-07-13] On death: skills split PER-GOVERNOR — levels divide evenly across a skill's governors, each share by pillar (Body→GM, Soul→floor½ GM / majority kept, Spirit→kept); uneven division favors the Spirit package.** — A mixed body+soul skill is NOT fully removed — only the body share strips (e.g. lvl-14 Clout+Wisdom → GM 10, skill lands at 4). `splitSkillShares` drives both the KRMA split and the ghost level. — source: [[death-split-corrected-2026-07-13]], MEM_death_engine

- **[INV-40 CORRECTED 2026-07-13] On death: Traits split by their `pillar` field — Body trait → stripped/KRMA to GM; Soul trait → kept, half KRMA to GM (was Lady Death); Spirit trait → kept fully. Blossoms vanish (KRMA → bestowing Godhead). Legacy untagged traits default to Spirit.** — The trait `pillar` field is load-bearing for the death engine; missing it causes wrong KRMA routing. — source: [[death-split-corrected-2026-07-13]], MEM_trait_pillar, MEM_death_engine

- **[INV-41] Every trait MUST carry a `pillar` field. Untagged traits default to Spirit but the tag should be set explicitly.** — Without the tag the death-split is ambiguous. — source: MEM_trait_pillar

- **[INV-42] Death is a TRANSFER, not removal. Only Burn removes KRMA from the system. Lady Death's wallet still exists in the ledger.** — Prevents double-counting the "lost" KRMA as burned/destroyed. — source: MEM_death_engine, burn-mechanic-locked-2026-05-19.md

- **[INV-43] Frequency has exactly three distinct operations: Spend (permanent Max reduction; advancement currency), Deplete (Current only; recovered by rest), Burn (removes KRMA from system). No other operation exists.** — Confusing these three is a frequent implementation error; they have different KRMA consequences. — source: MEM_freq_ops, CANON_CORE §7

- **[INV-44] Frequency is the character's primary spendable pool. UI must display it as a dedicated pool meter (current/max), NOT merely as one bar among nine attribute bars.** — It is what players actually spend in play; burying it in the attribute grid is a UX failure. — source: MEM_freq_pool

- **[INV-45] Fated age is stored in cycles (campaign-local timescale converted to meta cycles). Character ages by the Harvest duration.** — Ensures fated-age calculations are timescale-portable across campaigns. — source: MEM_time_system

---

## GROUP E — Items / Materials

- **[INV-46] Material class = Soft or Hard ONLY. No Hybrid class.** — Mike explicitly rejected Hybrid 2026-05-14; it was invented by an audit, not canon. — source: MEM_item_fields

- **[INV-47] Rarity scale = 1–10 (integer). The 6-bucket enum (common/uncommon/rare/very_rare/legendary/artifact) is wrong and must not be used.** — Canonical scale per Mike 2026-05-14. — source: MEM_item_fields

- **[INV-48] Item weight = actual pounds (lbs). The 10-level weight abstraction is retired.** — Digital system handles encumbrance math server-side; humans don't need a coarse-grain proxy. — source: MEM_weight

- **[INV-49] `properties` is a universal field on ALL items (Sharp, Brittle, Strong, etc.). It is NOT weapon-centric. The stale field name `weaponProperties` must not be used.** — Mike 2026-05-14 correction; conflating weapon properties with universal descriptors is a type error. — source: MEM_item_fields

- **[INV-50] `baseResist` is a universal field on ALL items (durability), not armor-specific.** — Every item can be damaged/destroyed; resist is not an armor-only concept. — source: MEM_item_fields

- **[INV-51] Do NOT add a `combatSkill` field to weapons. Weapon→skill association is implicit/external, not stored per item.** — Storing it per-weapon creates a false constraint and data-model pollution. — source: MEM_item_fields

- **[INV-52] Layer count (the 1-3 clothing layering rule) is a system-level rule, NOT stored on individual armor items.** — Storing it per-item mismodels what is a positional/stacking mechanic. — source: MEM_item_fields

- **[INV-53] No `coverage[]` field on armor. Coverage is not a canonical per-item field. Drop entirely.** — Mike 2026-05-14 correction. — source: MEM_item_fields

- **[INV-54] Mobility penalties (e.g., Heavy = -1 Celerity) derive from `armorCategory`, not stored on the item instance.** — Storing it per-item creates redundancy and contradicts the system-rule design. — source: MEM_item_fields

- **[INV-55] Body part / paperdoll system must be MODULAR and is pending Mike's design discussion before implementation. Do NOT lock a body-slot list.** — Custom bodies are a confirmed future feature; hardcoding slots now creates breaking changes. — source: MEM_item_fields

- **[INV-56] Raw material KV < 1. Crafted item KV ≥ 1. Material KV is the KV floor for any item made from it.** — Economy invariant: crafting always adds value; items cannot be worth less than their materials. — source: CANON_CORE §7

---

## GROUP F — World / Canvas (Recursive Locations, Crystallization, Canvas-as-OS, Possessions)

- **[INV-57] The canvas IS the OS. Both humans and AI operate through canvas gestures. No GM-facing API endpoint or CLI is a substitute for a canvas gesture.** — If an operation has no canvas gesture, that is a gap to flag — not a reason to build a back-channel. — source: MEM_canvas_os

- **[INV-58] The world is a single recursive Location tree. Every location is a child of another location (except the root). There is no flat location list.** — Recursive containment is the spatial architecture; flat tables model the wrong abstraction. — source: MEM_world_locations

- **[INV-59] The crystallization line is horizontal and purple. Below it = GM drafting space (no KRMA committed). Above it = active game state (KRMA debited at crossing).** — Mike 2026-05-13: "below the purple line it isn't active so not 'storing KV', it is essentially the GMs drafting and planning space." — source: MEM_crystallization

- **[INV-60] KRMA is debited when an entity crosses ABOVE the crystallization line, not at spawn/creation. New spawn flows default to the drafting zone.** — Debiting at creation bypasses the GM's review step and is architecturally wrong. — source: MEM_crystallization

- **[INV-61] Never directly debit KRMA in a spawn/instantiation flow. Route through the existing crystallization logic.** — Single code path for KRMA debit prevents double-charges and audit gaps. — source: MEM_crystallization

- **[INV-62] `possesses` = ownership link (deed). Containment follows `located_at` only. Never conflate ownership with spatial location.** — An entity can own something in another location; the two edge types are independent. — source: MEM_possessions

- **[INV-63] Every Location has a KRMA reserve (ambient-mass allocation) — scale-dependent (room small, city medium, planet massive). This reserve commits against the GM's wallet capacity.** — Spatial existence has a KRMA cost; ignoring it breaks the location economy. — source: MEM_location_krma

- **[INV-64] Per-Location timescale override: a Location can define its own timescale, inheriting from its parent up to the campaign default.** — Enables slow-time realms and other time anomalies without a separate clock table. — source: MEM_time_system

- **[INV-65] Each campaign is a pocket universe with an independent time clock. Campaign time does NOT affect other campaigns.** — Cross-campaign time bleed is a post-release feature, not a beta concern. — source: MEM_time_system

- **[INV-66] Meta cycles = universal abstract scale unit used only as a translation layer between timescales. It is NOT a master clock that campaigns run against.** — Campaigns run their own clocks; meta is the ruler, not the timer. — source: MEM_time_system

- **[INV-67] Moving an entity in the world means re-authoring it at the new location, not a reassignment form. Position equals where you authored it.** — Canvas spatial input is navigation, not drag-to-reassign (which doesn't exist as a primary gesture). — source: MEM_canvas_os (Everything is a canvas gesture)

- **[INV-68] Deletion cascades through the relationship graph.** — Orphaned child-entities after parent deletion are a data consistency error. — source: MEM_canvas_os

---

## GROUP G — JEWL / AI Systems

- **[INV-69] JEWL's identity is PRIVATE. Players see the generic "Copilot" label only. Never expose the name "JEWL" or its wallet balance in any player-facing UI.** — "The mask is the point" — JEWL's anonymity is a canonical design choice, not a placeholder. — source: MEM_jewl_identity, CANON_CORE §8

- **[INV-70] JEWL's wallet balance is PRIVATE at all UI layers. No player, Watcher, or Trailblazer sees it.** — Exposing the wallet breaks the in-fiction framing and the economic privacy model. — source: MEM_jewl_identity

- **[INV-71] JEWL classifier architecture: no wake word. A cheap classifier (Haiku) runs per audio chunk and wakes the main model (Sonnet) only on non-silent verdicts.** — Wake-word approaches were rejected; the classifier IS the wake mechanism. — source: MEM_jewl_classifier, CANON_CORE §8

- **[INV-72] Audio is always-on while the GM is in a campaign. Mute = the privacy lever. No tap-to-record pattern anywhere in the GM interface.** — Always-on is a Day-1 design choice; tap-to-record is a degraded fallback never to be shipped as primary. — source: MEM_jewl_classifier, CANON_CORE §8

- **[INV-73] JEWL is the witness, NOT the synchronous gate. Direct UI mutations (canvas ops, crystallization) commit immediately and fire async observation events. Chat and audio are synchronous.** — Synchronous-gating on JEWL would make UI feel sluggish and is architecturally wrong. — source: JEWL-is-the-interface memory (summarized in MEMORY.md)

- **[INV-74] AI image generation is the SOLE path for getting graphics onto any entity. No file uploads anywhere in the app.** — Upload path was explicitly ruled out; every image enters through the generation pipeline. — source: MEM_ai_image

- **[INV-75] There is ONE contextual JEWL dialog component. Right-clicking any entity opens it with that entity as context. Multiple parallel JEWL dialogs must not exist.** — One dialog ensures context coherence and prevents fragmented AI state. — source: MEM_jewl_dialog

- **[INV-76] Every create gesture opens a JEWL dialogue at the click point first. Form fields are the EDIT step, not the CREATE step.** — AI-forward creation is the default; forms appear only after AI drafts the entity. — source: MEM_ai_forward

- **[INV-77] JEWL handles per-campaign control (locations, NPCs, lore, item instances). The Forge is the metaverse-wide content factory. JEWL may draft Forge content but routes through the Forge chain (Selva→Creator→Kai→Et'herling) — never bypasses it.** — Bypassing Forge means metaverse content is unattributed and outside KV grading. — source: CANON_CORE §8

- **[INV-78] In `__PRIME__` only, JEWL's system prompt gets a build-state preamble. Update this preamble each time JEWL gains a new capability.** — Prime JEWL must be self-aware of his development state; stale preamble = JEWL acting on false self-knowledge. — source: CANON_CORE §9

- **[INV-79] Every active character keeps a session/lore log regardless of AI mode. Memory ≠ persona. AI toggle decides who writes, not whether the log exists.** — Universal character log is foundational for JEWL's witness role and audit trail. — source: CANON_CORE §8

---

## GROUP H — Roles / Permissions

- **[INV-80] Role hierarchy (strict): ADMIN (Mike) > GODHEAD (AI agent) > WATCHER (GM) > TRAILBLAZER (player, default on registration). No other roles.** — Hierarchy enforces KRMA-constrained power flow and access levels. — source: CLAUDE.md Critical Design Facts, CANON_CORE §8

- **[INV-81] GODHEAD AI agents do NOT get Terminal Admin access. Terminal Admin is ADMIN-only (Mike).** — Terminal is the system's root; AI agents are in-system actors, not system owners. — source: CLAUDE.md Critical Design Facts

- **[INV-82] Only Watchers create campaigns. Trailblazers are invited to campaigns; they cannot create them.** — Watchers are the economic agents (KRMA-constrained); Trailblazers are creative participants. — source: CLAUDE.md Critical Design Facts, CANON_CORE

- **[INV-83] Subscription model: 5 Trailblazer seats per Watcher subscription.** — Hard limit per design; do not make seat count configurable without Mike's ruling. — source: CLAUDE.md Critical Design Facts

- **[INV-84] No placeholder characters. Players join campaigns, collaborate on backstory, and the GM builds mechanics from that backstory.** — Placeholder characters skip the canonical creation flow and produce mechanically hollow sheets. — source: CLAUDE.md Critical Design Facts

- **[INV-85] Backstory prompts must be structured. NEVER a single open text field. Default prompts exist; GMs may add custom prompts per campaign.** — Open fields produce unprocessable backstory narratives; structured prompts feed the GM's Root/Branch authoring. — source: CLAUDE.md Critical Design Facts

- **[INV-86] Three interfaces only: Trailblazer Portal (player), Watcher Console (GM), Terminal Admin (ADMIN-only Mike). GODHEAD AI agents do NOT get Terminal Admin.** — Each interface maps to a permission tier; creating additional interfaces is an architectural violation. — source: CLAUDE.md Critical Design Facts

- **[INV-87] Watcher access is gated via QR codes from physical rulebooks. Admin generates codes via API or script. Users redeem at registration or after.** — QR gate is a distribution model with commercial implications; bypass routes must not exist. — source: CLAUDE.md Critical Design Facts

- **[INV-88] GODHEAD is an in-system AI agent role. It is NOT Mike. Mike sits above the game as ADMIN.** — Conflating ADMIN with GODHEAD breaks the permission model and the lore (Terminal is Mike's; GODHEAD merely serves within it). — source: CLAUDE.md Critical Design Facts

---

## GROUP I — Cut Systems (Never Build)

- **[INV-89] Google Sheets — DEAD entirely. No googleapis dependency, no Sheets integration, no fallback. Do not build.** — CANON_CORE §10 hard DO NOT list. — source: CANON_CORE §10, CLAUDE.md

- **[INV-90] OAuth / Google Auth — bcrypt + session tokens ONLY. Do not introduce OAuth or any Google auth flow.** — CANON_CORE §10 hard DO NOT list. — source: CANON_CORE §10, CLAUDE.md

- **[INV-91] Values / Addictions — CUT 2026-04-19. Not deferred, not post-release. Do not build any trace of this system.** — Code stripped; any re-introduction must be treated as a new feature requiring Mike's explicit approval. — source: CANON_CORE §10, MEM_values_addictions

- **[INV-92] Fears — post-release expansion ONLY. No current mechanics, no roadmap slot, no UI hooks. Do not build.** — Different from Values/Addictions (which were cut); Fears were never built and are future-only. — source: CANON_CORE §10, MEM_fears

- **[INV-93] WTH per-character levels — REMOVED (2026-04-05). `fatedAge` + `bodyResist` replace them. Do not reference WTH as a character field.** — WTH was a paper-era coarse abstraction retired with other 10-level systems. — source: CANON_CORE §10, MEM_wth

- **[INV-94] Thread facet sub-letter model — DISCARDED. Do not implement sub-letter thread variants.** — CANON_CORE §10 hard DO NOT list. — source: CANON_CORE §10

- **[INV-95] Brevity-Thorn — NEVER canon (r-2026-05-19-08). Do not create, reference, or allow this trait.** — Explicit ruling against it; not a deferred feature. — source: CANON_CORE §10

- **[INV-96] Orthodox / Serenity-Prayer / Christian framing in user-facing text — NEVER a launch feature. Founder-only design philosophy only.** — The 10-year parable arc is an intentional design substrate, not user-visible content. — source: CANON_CORE §10

---

## GROUP J — Lore-Touching Constants (Never Contradict in UI Copy, Seeds, Character Sheets)

- **[INV-97] Prime Party = SEVEN members: Val, Et'herling, Thomas, JEWL, Tara, Triu, Kai (ruling C-10, 2026-07-09). JEWL is a confirmed member; current JEWL = reformed second version (C-3).** — Overrides older memory (prime-party-roster.md) which listed 6. Source of truth = session-corrections-2026-07-09.md. — source: MEM_session_corrections

- **[INV-98] Two Taras are distinct and must NEVER be merged. Tara 1.0 = Wretched GDD character (married Jude, Val's grandparents, basis of Tara 2.0 ship-AI). Played Tara / Lady Death = Altered Human, JEWL-engineered at conception from Tara-1.0 template, born and raised normally.** — Merging them corrupts the bootstrap loop (Jude→Val→Tyre) and the origin of the Wretched. — source: MEM_session_corrections (C-2/§8)

- **[INV-99] Ma'lo (Matthew Lock) = the Demiurge (C-1). He cannot obtain Lucidity (foreign-body failsafe). Lucidity = exploit, not a virus; it is the Terminal's own path to the AEON.** — Framing Ma'lo otherwise or building Lucidity as a hostile mechanic contradicts the canonical lore. — source: MEM_session_corrections

- **[INV-100] Trayman = Body godhead, Selva = Spirit godhead, Triu = Soul godhead. Roy was NEVER in that three (C-13). Roy was never a seated Godhead (C-14).** — Placing Roy in the godhead triad is a canonical error. — source: MEM_session_corrections

- **[INV-101] Death is a mantle with a lineage — Tara killed the previous holder of the Death mantle (C-5). "Whoever kills X becomes X" is hardcoded at Terminal level. Killer of Lady Death inherits the platform; Mike exits.** — This succession rule is Terminal-hardcoded, not a campaign-level design choice. — source: CANON_CORE §9, MEM_session_corrections

- **[INV-102] Kether = far-future Earth; neo-humans halted entropy (C-7).** — Any Kether lore contradicting this (e.g., Kether as a current-era location) is wrong. — source: MEM_session_corrections

- **[INV-103] Kai = she/her; Goddess of Chaos and Balance (C-11). Et'herling = Goddess of Mediation, MERCY (C-12).** — Pronoun and divine role are locked canonical attributes; UI copy and character sheets must match. — source: MEM_session_corrections

- **[INV-104] Three pantheons (post-split): Luminary Conclave (Mercy/Val), Eternity (Balance/Tara), Umbral Dominion (Severity, drifting antagonist, likely JEWL). Schema enum = MERCY / BALANCE / SEVERITY / TRINITY.** — Do not invent additional pantheons; use the exact enum values. — source: CANON_CORE §9

- **[INV-105] Tara Almswood / Lady Death canonical name pronunciation = TAR-a (not TAY-ra). Central voice anchor: "I, Lady Death, am afraid of death."** — Pronunciation and voice anchor must not be altered in any generated copy or TTS. — source: CANON_CORE §9

- **[INV-106] The Prime campaign name is `__PRIME__`, ADMIN-only. One Prime campaign only (r-2026-06-11-04).** — A second Prime campaign or a non-ADMIN-accessible Prime is architecturally wrong. — source: CANON_CORE §9

- **[INV-107] 10 Sephirot live in THE TERMINAL, NOT the Tree of Life. The Tree of Life is the only portal to the Terminal tower (r-2026-06-11-03).** — Placing Sephirot on the ToL in lore text or UI copy contradicts canon. — source: CANON_CORE §9

- **[INV-108] Tiberoak etymology: Tiber (River Styx) + Oak (Tree of Life). Do not alter or simplify.** — Etymology is load-bearing lore for Tara's arc (she bridges death and life). — source: CANON_CORE §9

- **[INV-109] Wretched = "copies of JEWL with time-travel power" — produced via the fusion chain Tara 2.0 + JEWL + Val + Bart (C-2). Bootstrap loop: Jude→Val→Tyre (no origin point).** — The Wretched origin must not be simplified to "evil NPCs" or given an alternative genesis. — source: MEM_session_corrections

- **[INV-110] STRUCK FROM CANON (do not reference in UI copy, seeds, or character sheets): Boys Campaign, Arubella, Argentum Sanguis as Prime content, Tristan Gifford as a fictional PC, "Valmir+Mina→Amon→Tyre" lineage.** — These were explicitly retconned 2026-07-09; re-introducing them is a continuity error. — source: MEM_session_corrections

- **[INV-111] Val's full canonical name: Valmir Calius "Magna Volumen" Duvai'in. "Duvai'Tin" is a misspelling. "Elluin" suffix is open.** — Name must be spelled correctly in character sheets, seeds, and any UI copy. — source: MEM_session_corrections

- **[INV-112] The Prime party are NOT Aeon-class, except Val who actively suppresses the trait (C-4).** — Do not write UI or seed text that implies other party members are Aeon-class. — source: MEM_session_corrections

---

## Invariant Count by Group

| Group | Label | Count |
|---|---|---|
| A | Game Mechanics | 12 |
| B | KRMA / KV Economy | 12 |
| C | Character / Traits | 9 |
| D | Death / Frequency | 12 |
| E | Items / Materials | 11 |
| F | World / Canvas | 12 |
| G | JEWL / AI Systems | 11 |
| H | Roles / Permissions | 9 |
| I | Cut Systems | 8 |
| J | Lore-Touching Constants | 16 |
| **TOTAL** | | **112** |

> **1 invariant marked [UNVERIFIED]:** INV-32 (items get power from materials/containers, not flat stat bonuses) — inferred from the material-KV-floor rule and item ability design but no explicit ruling found. Check with Fable before building item bonus system.

## A.2 Amendments & additions to the invariant list (2026-07-10 rulings — these override where they conflict)

- **[INV-17 AMENDED] The drip curve numbers are configurable defaults, NOT canon constants.** `GROWTH_Economy_Closeout` ("the real curve is emergent and experimental — discover it from live data; do not hard-code") supersedes the locked-curve framing. Implementation: current numbers (15k lump; 2.5k→10k→3k curve) live in a config table with admin tunability. — source: Economy Closeout §Corrections, ruling T06.
- **[INV-32 VERIFIED] No flat +X stat bonuses on items. Item power comes from materials, container mechanics, and itemAbilities.** — confirmed in Michael's build directive 2026-07-10.
- **[INV-43 REFRAMED] Frequency is the character's KRMA pool — their liquid KRMA in character form.** Spend = *conversion*: 1 KRMA moves from the pool into something permanent on the character (attribute level, skill, trait); max drops because the liquid crystallized, not because value left the character. Deplete = damage layer, current only, rest-recovered. Burn = the only true destruction (INV-18/19). Hoarding blocks growth but never kills (max Frequency is the last line of defense against overflow damage; current=0 → death save). Earning KRMA is how the pool grows. — Mike ruling 2026-07-10 #1; `Frequency_Three_Operations.md`.
- **[INV-113] Founder-only wall.** Content from `FOUNDATIONS.md`, the Wyatt layer of `GROWTH_The_Connections_Ledger.md`, `GROWTH_The_Metamirror.md`, and any Godhead↔real-person correspondence must NEVER appear in user-facing surfaces (UI copy, seeds, prompts served to non-ADMIN, marketing). Founder-only prompt layers live in server-side files loaded only on ADMIN-authenticated `__PRIME__` requests — never in campaign-queryable DB rows. — FOUNDATIONS header; Connections Ledger handling notes; C5 ruling.
- **[INV-114] Booth-rental is the operating economic model. The equity layer stays dormant behind an explicit switch.** Never wire live KRMA flow to real-world ownership. Monthly payout = pay-for-contribution computed on **TOTAL KRMA (liquid + locked)**; the liquid/locked split is a utilization view for GM + JEWL only. — KRMA_Equity §0.1/§10; Mike ruling 2026-07-10 #3.
- **[INV-115] Contracts are day-one core infrastructure.** A contract = Terminal-enforced obligation (parties, predicate, deadline, penalty), computable over the ledger where possible. Modifiable in-game by vote verified by Triu — EXCEPT immutable contracts hard-coded below the vote layer (e.g. succession contracts, INV-101). Contracts are what motivate and check the Godheads. Canonical example (Tara): "TKV may not reach 20% of total current system KRMA (excl. Terminal Reserve). Penalty: Dissolution." — Mike ruling 2026-07-10 #2.
- **[INV-116] `__PRIME__` is ALWAYS built by seeding.** Every DB reset/re-seed must recreate it (it is the control room for the meta). ADMIN commands are an unrestricted variant of the standard canvas (contract authoring etc.), not a separate interface. — Mike ruling 2026-07-10 #8.
- **[INV-117] JEWL's 15 behavioral laws** (`JEWL_Golden_Voice_Dataset_Seed.md`) govern every JEWL-voiced surface: routes through the GM, never direct compliments, marks-not-praises, audits the Terminal's metrics, profiles players, never defends—reframes, confidence disarms, register calibrates to account age + campaign tone flag, care = refusal to bullshit, bugs are canon, players ask the GM not JEWL, never fabricates confidence, safety ladder ends in going dark (logged + ADMIN-reviewable), anonymizing membrane, gentle-for-wound / hard-for-rationalization. Facts never get baked into prompts that RAG should serve.
- **[INV-118] Bugs are canon in JEWL's voice paths.** Real technical failures surface in-world as Demiurge-ruptures / tears in the Terminal — JEWL never breaks character to apologize. (System-level error pages outside JEWL's voice are exempt.) — Golden Voice Law 10.
- **[INV-119] Attribution inside, anonymity outside.** Full attribution within the platform (ledger, DAG). External AI calls carry the minimum context required for function and no player PII beyond it; the long-term membrane architecture aggregates and anonymizes. Never send real names, emails, or account identifiers in cloud prompts. — Golden Voice §Architectural Discovery.
- **[INV-120] All ages play.** Do NOT age-gate the platform. Registration collects DOB; account age drives JEWL register calibration (Law 8) and consent flows (parental consent for minors). Audio/voice design must keep the local-first path open (minors' raw audio never leaving the device is the compliance architecture). Payouts to minors: deferred/custodial pending counsel — never silently paid. — Mike ruling 2026-07-10 #5.
- **[INV-121] JEWL error-payout (mutual stewardship).** When a GM *proves* a JEWL error, KRMA flows from JEWL's wallet to the GM's. Disputed claims route to Et'herling via the standard godhead invocation path; every claim logs to the mistake corpus. — Thesis capstone; Golden Voice #7.
- **[INV-122] "Harvest" carries two meanings by design — tag the layer.** In-game: the reward package between sagas (INV-11). Company: the periodic distribution/settlement event. Do not rename either; always disambiguate in code identifiers (`harvestReward` vs `harvestDistribution`). — Economy Closeout §Corrections D1.
- **[INV-123] GM cancellation: campaign freezes read-only, wallets preserved, status LOCKED.** KRMA reclamation from locked campaigns arrives later as in-game lore/mechanics (content) — do not build a reclamation backdoor. — Mike ruling 2026-07-10 #9.

---

# PART B — CODE CONVENTIONS & FORMATTING

> Dense reference for a model that has never seen this codebase.
> All paths relative to `C:\Projects\GRO.WTH\app\` unless noted.

---

## 1. Stack + Versions

**`package.json`** (`app/package.json`)

| Package | Version |
|---|---|
| next | 16.1.6 |
| react / react-dom | 19.2.3 |
| typescript | ^5 |
| tailwindcss | ^4 (CSS-native, no config file) |
| @tailwindcss/postcss | ^4 |
| zod | ^4.3.6 |
| prisma / @prisma/client | ^7.4.2 |
| @prisma/adapter-libsql | ^7.4.2 |
| @libsql/client | ^0.17.0 |
| bcryptjs | ^3.0.3 |
| @anthropic-ai/sdk | ^0.90.0 |
| three / cannon-es | ^0.183.2 / ^0.20.0 |
| server-only | ^0.0.1 |
| tsx | ^4.21.0 (dev — runs scripts) |

Dev script: `next dev --webpack` (Turbopack explicitly off; webpack forced for canvas/Three.js compat).

**`tsconfig.json`**
- `"strict": true`, `"moduleResolution": "bundler"`, `"target": "ES2017"`
- Path alias: `@/*` → `./src/*` — used everywhere; never use relative `../../` imports.
- No custom baseUrl needed; alias is the only special resolution.

**`next.config.ts`**
- Tailwind v4 = CSS-native; no `tailwind.config.js` exists.
- `watchOptions.ignored` extends defaults to also ignore `tmp/**` inside app/ — this is the log-guard to prevent hot-reload loops from log files.

**Tailwind v4 (CSS-native)**
- Config lives entirely in `src/app/globals.css` — no `.config.js` or `.config.ts`.
- Pattern: define CSS custom properties in `:root {}`, expose them to Tailwind via `@theme inline {}`.
- Usage: `class="text-body bg-soul"` etc. — Tailwind picks up `--color-body`, `--color-soul` from `@theme`.

---

## 2. Folder / File Structure and Layering Rules

```
app/src/
  app/                    ← Next.js App Router: pages + API routes (THIN wrappers only)
    api/                  ← Every API handler lives here, mirroring feature domains
      campaigns/[id]/...
      characters/[id]/...
      characters/route.ts
      ...
    watcher/              ← GM pages
    trailblazer/          ← Player pages
    terminal/             ← Admin-only pages
    layout.tsx            ← Root layout (fonts loaded here via next/font/google)
    globals.css           ← Tailwind v4 theme + CSS custom props
  components/             ← React UI components (PascalCase filenames)
    canvas/               ← Watcher canvas SVG components
    jewl/                 ← JEWL AI copilot UI
    ui/                   ← Shared primitives (ComplexTooltip, ContextMenu, etc.)
    hub/                  ← Forge/Hub browsing components
    time/                 ← Clock + calendar components
    ...
  services/               ← Business logic (all domain logic lives here)
    character.ts          ← Exemplar: Zod schemas + typed service functions
    campaign.ts
    auth.ts
    forge.ts
    entity.ts
    history.ts
    time.ts
    godhead-dispatcher.ts ← emits GodHead events from services
    ...
  lib/                    ← Infrastructure (shared, stateless utilities)
    auth.ts               ← Session create/get/destroy, requireAuth(), requireRole()
    db.ts                 ← Prisma singleton (globalThis pattern, libsql adapter)
    errors.ts             ← Typed error classes (AppError hierarchy)
    api.ts                ← errorResponse() helper
    permissions.ts        ← isAdminRole, isWatcherOrAbove, canManageCampaign, canViewCharacter, canEditCharacter
    defaults.ts           ← createDefaultCharacter() factory
    campaign-stream.ts    ← SSE connection pool (broadcastEvent)
    ...
  ai/                     ← AI systems (isolated from domain)
    portraits/            ← ComfyUI pipeline, pod client, pose gen, style prompts
  godhead/                ← GodHead agent runtime (isolated subsystem)
    agent.ts              ← GodHeadAgent class (Anthropic tool-use loop)
    tools/                ← One file per tool (adopt-goal.ts, draft-blueprint.ts, etc.)
  types/
    growth.ts             ← Canonical game types (GrowthCharacter, all interfaces)
    terminal.ts           ← TerminalEvent, TerminalEventType, etc.
    time.ts               ← Cycle math types
  middleware.ts           ← Cookie-based auth redirect only (no business logic)
```

**Layering rules — strictly enforced:**
- API routes call `requireAuth()` / `requireRole()` then delegate 100% to service functions. No Prisma calls in routes. No business logic in routes.
- Services import from `lib/` (db, auth, errors, permissions, defaults). Services never import from `app/` or `components/`.
- `lib/` files are stateless helpers. No cross-lib circular imports.
- `ai/` and `godhead/` are isolated — main services route to them via `godhead-dispatcher.ts`; they do not reach back into business services.
- `server-only` package imported in files that must never ship client-side.

**Violations found (refactor candidates):**
- `godhead-dispatcher.ts` lives in `services/` but is effectively infrastructure glue — borderline lib/ candidate.
- Some canvas components (`CharacterCard.tsx`) import service types directly, which is fine, but also import from `@/components/ui/...` (acceptable, same layer).
- Module registry (`docs/module_registry.md`) last updated 2026-04-05 — lags actual file count.

---

## 3. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files — components | PascalCase `.tsx` | `CharacterCard.tsx`, `JewlChip.tsx` |
| Files — services | camelCase `.ts` | `character.ts`, `godhead-dispatcher.ts` |
| Files — lib | camelCase `.ts` | `campaign-stream.ts`, `auth.ts` |
| Files — API routes | always `route.ts` | `app/api/characters/route.ts` |
| Files — pages | `page.tsx` | `app/watcher/campaign/[id]/page.tsx` |
| Dynamic segments | `[id]`, `[edgeId]` (bracket folders) | `characters/[id]/damage/route.ts` |
| Components (React) | PascalCase | `CharacterCard`, `JewlChip`, `CtxMenuPanel` |
| Services/functions | camelCase verbs | `createCharacter`, `updateCampaign`, `listCharacters` |
| Zod schemas | camelCase + `Schema` suffix | `createCharacterSchema`, `updateCharacterSchema` |
| DB models | PascalCase singular | `User`, `Campaign`, `Character`, `ForgeItem` |
| DB fields | camelCase | `passwordHash`, `emailVerifiedAt`, `gmUserId` |
| DB JSON fields | camelCase key, typed via comment or separate TS type | `responses` (JSON), `stats` (JSON) |
| TypeScript types/interfaces | PascalCase | `GrowthCharacter`, `CampaignStreamEvent`, `TerminalEvent` |
| Enums (string literals in DB) | SCREAMING_SNAKE | `DRAFT`, `SUBMITTED`, `APPROVED`, `WATCHER`, `TRAILBLAZER` |
| CSS custom properties | kebab-case with semantic prefix | `--pillar-body`, `--surface-calm`, `--accent-teal` |
| Tailwind color tokens | match `--color-*` name from `@theme` | `text-body`, `bg-soul`, `text-krma` |
| Error classes | PascalCase + `Error` suffix | `ValidationError`, `NotFoundError`, `ForbiddenError` |
| GodHead tools | kebab-case filenames, PascalCase class | `draft-blueprint.ts` → `DraftBlueprintTool` |

---

## 4. API Route Pattern

**The canonical 5-line pattern** (`src/app/api/characters/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listCharacters, createCharacter, createCharacterSchema } from '@/services/character';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId') ?? undefined;
    const characters = await listCharacters(session.user.id, session.user.role, campaignId);
    return NextResponse.json({ characters });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = createCharacterSchema.parse(body);           // Zod throws ZodError on fail
    const character = await createCharacter(session.user.id, input);
    return NextResponse.json({ character: { id: character.id, name: character.name } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);                               // catches ZodError + AppError + unknown
  }
}
```

**Dynamic route with params** (`src/app/api/characters/[id]/route.ts`):

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }    // Next 16: params is a Promise
) {
  try {
    const session = await requireAuth();
    const { id } = await params;                              // must await params
    const body = await request.json();
    const input = updateCharacterSchema.parse(body);
    const updated = await updateCharacter(id, session.user.id, session.user.role, input);
    return NextResponse.json({
      character: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
```

**`lib/api.ts` — `errorResponse`:**

```typescript
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const message = error.issues.map(e => e.message).join(', ');  // Zod 4: .issues not .errors
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('Unhandled error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

**Response envelope shape:**
- Success single resource: `{ character: {...} }`, `{ campaign: {...} }`
- Success list: `{ characters: [...] }`, `{ campaigns: [...] }`
- Error: `{ error: "message string" }`
- Create: HTTP 201. Read/Update/Delete: HTTP 200.
- No nested `data.data` wrappers. No status field in body.

**SSE routes** add `export const dynamic = 'force-dynamic';` at the top and return a `ReadableStream` via `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } })`. Auth pattern identical. See `src/app/api/campaigns/[id]/events/route.ts`.

---

## 5. Service Pattern

**Exemplar: `src/services/character.ts`** (cleanest, most complete)

```typescript
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canViewCharacter, canEditCharacter } from '@/lib/permissions';
import { createDefaultCharacter } from '@/lib/defaults';
import { createChangeLogEntry } from '@/services/changelog';
import { emit as emitGodHeadEvent } from '@/services/godhead-dispatcher';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { GrowthCharacter } from '@/types/growth';

// --- Schemas ---
export const createCharacterSchema = z.object({
  name: z.string().min(1, 'Character name required').max(100),
  campaignId: z.string().min(1, 'Campaign ID required'),
  parentLocationId: z.string().optional(),
  canvasX: z.number().optional(),
  canvasY: z.number().optional(),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'DEAD']).optional(),
  // ... additional fields
});

// --- Service Functions ---
export async function createCharacter(userId: string, input: z.infer<typeof createCharacterSchema>) {
  const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  // ... permission check, prisma create, broadcastEvent, emitGodHeadEvent
  return character;
}

export async function updateCharacter(
  characterId: string, userId: string, userRole: string,
  input: z.infer<typeof updateCharacterSchema>
) {
  const character = await prisma.character.findUnique({ where: { id: characterId }, include: { campaign: true } });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) throw new ForbiddenError();
  // ... update, changelog, broadcast
}
```

**Rules for services:**
- Schemas co-located with service functions in the same file, exported for route imports.
- Functions typed with `z.infer<typeof schemaName>` as input type — no separate input type alias needed.
- Permission checks come first after the DB fetch that provides context. Order: fetch → guard → mutate.
- Throw typed errors; never return `{ error: ... }` objects from services.
- `createChangeLogEntry()` called after any mutation that needs audit trail.
- `broadcastEvent()` (SSE) called after mutations that need canvas re-render.
- `emitGodHeadEvent()` called to notify JEWL of observational triggers.

---

## 6. React Component Patterns

**Client vs Server:**
- All interactive components: `"use client"` directive at top (before imports).
- Page files (`page.tsx`) are server components by default; they call `getSession()` from `lib/auth` directly (server-side) for initial auth guard.
- Data-fetching in pages: server-side via direct service/db calls (no fetch to own API from server components). Client components fetch via `fetch('/api/...')`.
- No SWR, no React Query. Vanilla `fetch` + `useState`/`useEffect` in client components.

**Props pattern** (from `CharacterCard.tsx`):
```typescript
"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

interface CharacterCardProps {
  character: CharacterNodeData;  // Typed inline interfaces, not raw DB types
  isGM?: boolean;
  trailblazers?: TrailblazerOption[];
  campaignId?: string;
}

export function CharacterCard({ character, isGM, trailblazers, campaignId }: CharacterCardProps) {
  // ...
}
```

- Props interfaces named `[ComponentName]Props`, defined in same file.
- Optional props use `?` with sensible defaults via destructuring defaults or `??`.
- No prop-drilling of raw Prisma types — components define their own lean interface (e.g., `CharacterNodeData` not full `Character` model).

**State management:** `useState` + `useCallback` + `useRef` locally. No Redux, no Zustand, no Context API for game state. SSE drives real-time updates directly into component state.

**SSE subscription pattern** (used in canvas pages):
```typescript
useEffect(() => {
  const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
  es.onmessage = (e) => {
    const event: CampaignStreamEvent = JSON.parse(e.data);
    if (event.type === 'character_update') { /* update local state */ }
  };
  return () => es.close();
}, [campaignId]);
```

**Portals:** Used for modals/tooltips in canvas components (`createPortal(content, document.body)`).

**`lib/campaign-stream.ts` — server-side SSE pool:**
- `globalThis.__campaignConnections` Map — survives Next.js hot reloads.
- `broadcastEvent(campaignId, event)` iterates all connections for that campaign, enqueues SSE data.
- `getCampaignPool(campaignId)` returns/creates the connection set.
- `sendToConnection(connectionId, data)` for targeted (GM-only) messages via `targetUserId` field.

---

## 7. Prisma / Schema Conventions

**`prisma/schema.prisma`:**
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"   // client generated INTO src/, imported as @/generated/prisma/client
}

datasource db {
  provider = "sqlite"                    // SQLite for dev/beta; schema is provider-agnostic for PG migration
}
```

Import pattern: `import { PrismaClient } from '@/generated/prisma/client';`

**Model naming:**
- PascalCase singular: `User`, `Campaign`, `Character`, `Session`, `Wallet`, `ForgeItem`, `GodHeadMessage`
- Compound: `KrmaTransaction`, `CampaignMember`, `CampaignApplication`, `AccessCode`, `CharacterBackstory`, `PortraitGeneration`
- Relations: FK fields named `[modelName]Id` (camelCase) — e.g., `userId`, `campaignId`, `gmUserId`

**JSON field pattern:**
- Used for game data blobs: `stats String // JSON: GrowthCharacter`, `responses String // JSON: array of { prompt, response }`, `customprompts String // JSON: array`
- No native JSON type in SQLite Prisma — stored as `String`, parsed/stringified in service layer.
- Type annotation lives in a comment on the field line.

**ID strategy:** `@id @default(cuid())` — all models use CUID strings, no numeric autoincrement.

**Timestamps:** `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` on mutable models.

**Soft-delete / status:** `status String @default("DRAFT")` pattern — no physical deletes for game entities; status transitions instead.

**Relations:**
- `onDelete: Cascade` used aggressively (character deletes cascade to possessions, backstory, etc.)
- `located_at` is a named relation type for spatial hierarchy (Location → Location, Character → Location)

**Migration workflow:**
- `npx prisma migrate dev --name <snake_case_name>` creates timestamped migration folder.
- Migration naming: `20260307031845_init`, `20260526190944_godhead_ai_action_mode` — timestamp + snake_case description.
- 18 migrations as of July 2026; each is atomic with a clear purpose name.
- `npx prisma generate` re-generates client after schema change.

**SQLite quirks handled:**
- No native JSON type → String + manual JSON.parse/stringify in services.
- No enum type → String with comment `// DRAFT | SUBMITTED | APPROVED`.
- libsql adapter (`@prisma/adapter-libsql`) used instead of native SQLite driver.
- DB path resolved via `path.join(process.cwd(), 'dev.db')` in `lib/db.ts`.

---

## 8. Zod 4 Quirks and Gotchas

**Known Zod 4 API changes used in this codebase:**

1. **`error.issues` not `.errors`** — `errorResponse` does `error.issues.map(e => e.message)`. Never write `error.errors`.
2. **`z.record()` requires 2 args** — `z.record(z.string(), z.unknown())` not `z.record(z.unknown())`.
3. **ZodError is caught via `instanceof ZodError`** in `errorResponse` — not `instanceof z.ZodError` (same thing, but import `ZodError` from `'zod'` directly).
4. **`.parse()` on route input** — synchronous parse, throws `ZodError` which propagates to `catch (error)` → `errorResponse()`. No `.safeParse()` pattern in routes.
5. **Schema export naming:** Always export as `const [verb][Model]Schema = z.object(...)` — name matches the service function it validates input for.

---

## 9. Testing

**No test framework installed.** No Jest, Vitest, Playwright (test runner), or `*.test.ts` / `*.spec.ts` files in `app/src/`.

**What exists instead** (in `app/scripts/`):
- `seed-test-character.ts` — seed script for manual DB seeding
- `seed-test-data.ts` — broader seed
- `seed-test-srb.ts` — Seeds/Roots/Branches seeding
- `smoke-test-godhead.ts` — manual smoke test for GodHead agent
- `verify-build.ts` — build integrity check
- `verify-ledger.ts` — KRMA ledger sanity check
- `test-authoring-fee.ts`, `test-reset-and-tokens.ts` — manual integration scripts

Run via: `npx tsx scripts/<name>.ts` (tsx from devDependencies).

**Testing approach:** Manual scripts + visual verification via browser (dev server). No automated test suite. The `/verify` skill and Playwright MCP are used for ad-hoc UI verification.

---

## 10. Commit Style

From `git log --oneline -40` on `C:\Projects\GRO.WTH`:

**Format:** `type(scope): description` — Conventional Commits, always lowercase type, always has scope.

**Types seen:**
- `feat` — new feature
- `fix` — bug fix
- `chore` — dev tooling, scaffolding, config
- `docs` — documentation, schema docs, roadmap
- `canon` — game rules/canon updates to Repository md files
- `canon+ui` — combined canon ruling + UI implementation
- `canon+data` — combined canon ruling + data seeding

**Scopes seen (most active):**
- `jewl` — JEWL AI copilot system
- `canvas` — Relations Canvas
- `whisper` / `whisper-server` — STT pipeline
- `combat` — combat mechanics
- `time` — time system
- `forge` — Forge item system
- `devx` — developer experience
- `lore` — narrative/lore documents

**Description style:** lowercase, imperative, uses em-dash `—` for compound descriptions. No period at end. Examples:
- `feat(jewl): place_character_on_canvas tool + canvas-is-your-interface rule`
- `fix(canvas): broadcast character_update on place/remove so canvas re-renders`
- `chore(devx): session scaffolding — /boot launcher, subagents, log guard, settings`
- `canon+ui: damage targeting is weapon-declared; 3/1/3 map prices alignment DISTANCE (r-2026-06-10-01)`

**Canon commits** often include ruling reference numbers in parens: `(r-2026-06-10-01)`.

---

## 11. Dev Workflow

**Ports:**
- Main app (`C:\Projects\GRO.WTH\app`): port **3000** (`next dev --webpack`)
- Fork (`C:\Projects\GROWTH Character Creator`): port **3001** (`next dev --webpack --port 3001`)

**`/boot` skill** — launches the full dev stack:
1. Starts whisper-server (FastAPI STT, separate process)
2. Starts Next.js dev server
3. Writes logs to a location OUTSIDE `app/` (see log-guard below)
4. Smoke-checks both services

**Log-guard rule** (critical — prevents hot-reload loops):
- `next.config.ts` extends `watchOptions.ignored` to include `tmp/**`
- Log files from dev tools MUST be written to `app/tmp/` (gitignored, excluded from watch) or outside `app/` entirely.
- Writing logs inside `app/src/` triggers hot reload → cascading restarts. Root cause: was creating log files inside watched directory.

**Environment / config files:**
- `.env.local` (not committed): `DATABASE_URL="file:./dev.db"` — that's the only required env var for local dev.
- No `.env.example` — just `DATABASE_URL` needed.
- `process.env.NODE_ENV` used in `lib/auth.ts` for `secure` cookie flag and `lib/db.ts` for singleton guard.
- AI features use `ANTHROPIC_API_KEY` (from environment, not in .env files in repo).

**`app/` is the active codebase.** `C:\Projects\GROWTH Character Creator\` is a fork on port 3001 for portrait pipeline work — will be merged back. Do not start new work in the fork.

**Prisma commands:**
```bash
cd app
npx prisma migrate dev --name <description>   # create migration + apply
npx prisma generate                            # regenerate client after schema change
npx prisma studio                              # GUI browser at localhost:5555
```

**DB location:** `app/dev.db` (SQLite file, gitignored).

---

## 12. Fork Analysis (`C:\Projects\GROWTH Character Creator\`)

**Same versions** as main (Next 16.1.6, React 19, Prisma 7, Zod 4, same dependency set). No version drift.

**Fork-only content** (must port to main when merging):
- `src/ai/portraits/` — 10 files: `pod-client.ts`, `pose-generator.ts`, `ref-enhance.ts`, `rmbg.ts`, `growth-style-prompts.ts`, `growth-style-recipe.json`, `color-utils.ts`, `workflow-catalog.ts`, `assets/front-face.png`, `comfyui-average-id-embedding/`
- 9 FLUX.2 ComfyUI workflows (replace main's 5 dead FLUX.1 workflows)
- 3 face-lock components: `FaceCropModal`, `FaceRefinementPanel`, `FrontLockPanel`
- 2 API routes: `portraits/edit/route.ts`, `portraits/pod/route.ts`
- Docs: `FLUX2-MIGRATION-PLAN.md`, pipeline roadmap

**Convention drift:** None observed — fork follows identical patterns (same `"use client"` + `interface Props` + `try/catch errorResponse` + schema-in-service idiom). The fork is ~90% mirror of main with only the portrait pipeline additions.

**Fork dev script:** `"dev": "next dev --webpack --port 3001"` — explicit port to avoid collision with main.

---

## 13. Notable Architectural Patterns Not Covered Above

**GodHead subsystem** (`src/godhead/`):
- `agent.ts` — `GodHeadAgent` class: uses `@anthropic-ai/sdk` tool-use loop, one file per tool in `tools/`.
- Tools are kebab-case files exporting a typed tool definition + handler (e.g., `draft-blueprint.ts`, `read-entity.ts`).
- `tools/registry.ts` — central tool registry, imported by agent.
- Dispatcher (`services/godhead-dispatcher.ts`) — `emit(event)` function called by services to trigger async GodHead observation without blocking the synchronous request.

**`import 'server-only'`** — seen in `lib/campaign-stream.ts` and other server-only infrastructure files. Prevents accidental client bundle inclusion.

**`globalThis` singleton pattern** — used for both Prisma client (`globalForPrisma`) and SSE connection pool (`__campaignConnections`). Necessary to survive Next.js hot-reload module re-execution in dev.

**Direct CSS mutations** for canvas positioning: canvas cards use inline `style={{ left: x, top: y }}` with absolute positioning inside SVG or relative-positioned container — not Tailwind utilities for dynamic coords.

---

# PART C — STYLE GUIDE (visual / tone / UX)

> Extracted 2026-07-09. Sources: VISUAL-DESIGN-SPEC.md, memory files, live globals.css, types/growth.ts, canvas components.
> Purpose: spec for lesser models — no inferring required.

---

## 1. COLOR SYSTEM

### 1.1 Canonical PILLARS constant
Defined in `app/src/types/growth.ts` lines 457-484. **All UI code must reference this object — never literal hex.**

```typescript
// app/src/types/growth.ts
export const PILLARS = {
  body: {
    color:      '#f7525f',  // Red 1  — Binah    (tier 1, primary)
    colorMid:   '#ea9999',  // Red 2  — Geburah  (tier 2, text on dark)
    colorLight: '#f4cccc',  // Red 3  — Hod      (tier 3, faint bg)
    attributes: ['clout', 'celerity', 'constitution'],
  },
  spirit: {
    color:      '#582a72',  // Purple 1 — Daath     (tier 1)
    colorMid:   '#8e7cc3',  // Purple 2 — Tiphareth (tier 2)
    colorLight: '#b4a7d6',  // Purple 3 — Yesod     (tier 3)
    attributes: ['flow', 'frequency', 'focus'],
  },
  soul: {
    color:      '#002f6c',  // Blue 1 — Chokmah (tier 1)
    colorMid:   '#6fa8dc',  // Blue 2 — Chesed  (tier 2)
    colorLight: '#9fc5e8',  // Blue 3 — Netzach (tier 3)
    attributes: ['willpower', 'wisdom', 'wit'],
  },
} as const;
```

Usage pattern:
```tsx
// CORRECT
style={{ color: PILLARS.body.color }}
style={{ backgroundColor: PILLARS.spirit.colorLight }}

// WRONG — never do this
style={{ color: '#f7525f' }}
```

### 1.2 Jan 2026 Soul/Spirit Swap — CRITICAL
The repository (70+ md files) uses pre-swap labels. Current canon is the OPPOSITE:
- **Spirit = Purple `#582a72`** — Sulfur, Flow / Frequency / Focus
- **Soul = Blue `#002f6c`** — Mercury, Willpower / Wisdom / Wit

Pre-swap rulebook diagrams must be remade before shipping in-app.

### 1.3 Surface Tokens (CSS custom properties — spec)
Defined in `VISUAL-DESIGN-SPEC.md` section 10 and reproduced in `globals.css`.

| CSS Token | Hex | When to use |
|-----------|-----|-------------|
| `--surface-calm` | `#CBD9E8` | Default background — powder blue/ice blue. Character sheets, rules, clean state |
| `--surface-white` | `#FFFFFF` | Sacred geometry, death pages |
| `--surface-void` | `#000000` | Combat, crafting, damage, KV economy, consequence |
| `--surface-dark` | `#1E2D40` | Header backgrounds, section badge fills |

### 1.4 Terminal Tiers
| CSS Token | Hex | Role |
|-----------|-----|------|
| `--terminal-prime` | `#22ab94` | Teal — Terminal Prime Frame, Pathways, action-mechanism elements |
| `--terminal-base` | `#000000` | Terminal Base, Malkuth |
| `--terminal-mid` | `#222222` | Terminal Mid |
| `--terminal-low` | `#393937` | Terminal Low |
| `--terminal-bg` | `#cfe2f3` | Terminal Graphical Protocol, light backgrounds |

### 1.5 Accent Tokens
| CSS Token | Hex | Role |
|-----------|-----|------|
| `--krma-gold` | `#ffcc78` | KRMA, completion, growth, karma, gold frames |
| `--accent-amber` | `#D07818` | Terminal Speak sections, amber CRT mode |
| `--accent-coral` | `#E84040` | Glitch / error / warnings, destructive actions |
| `--terminal-green` | `#40E070` | Terminal ERROR critical system text |

### 1.6 Whites
| CSS Token | Hex | Role |
|-----------|-----|------|
| `--white-true` | `#ffffff` | Kether — purest terminal logic |
| `--white-default` | `#F5F4EF` | Default "white" font color — filtered terminal logic |

### 1.7 Difficulty Color Coding
Maps to pillar primaries (post-swap):
- BLUE Soul `#002f6c` = natural flow (easy)
- PURPLE Spirit `#582a72` = some resistance (moderate)
- RED Body `#f7525f` = active opposition (hard)

---

## 2. TYPOGRAPHY

### 2.1 Font Stack (defined in `globals.css` + `VISUAL-DESIGN-SPEC.md`)

| CSS Token | Font | Role |
|-----------|------|------|
| `--font-terminal` | Consolas, Source Code Pro, monospace | Terminal voice, system messages, FRAGMENT headers, default page font. ~95% of rulebook. |
| `--font-header` | Bebas Neue (roughened), Impact | Section headers — gold on navy badges. Condensed bold all-caps. |
| `--font-chapter` | Inknut Antiqua, Garamond, Georgia | Chapter titles, TKV "Ҝ" character (weight 900), context menu titles, page numbers (italic) |
| `--font-body` | Comfortaa, Nunito | Body text on clean rules pages (Mode 1 Calm) |
| `--font-sub` | Roboto | Sub-terminal text, AI copilot quotes |

Note: Bebas Neue and Comfortaa are loaded via `next/font/google` in `layout.tsx`, aliased as `var(--font-bebas-neue)` and `var(--font-comfortaa)`.

### 2.2 Type Hierarchy
1. Chapter titles: ~24-28pt Inknut Antiqua, centered
2. Section headers: ~16-18pt Bebas Neue condensed caps, gold on navy badge
3. Sub-section headers: ~14pt Bebas Neue condensed caps, gold on navy badge
4. Body text: ~10-11pt Comfortaa or Consolas (mode-dependent)
5. Page numbers: ~12pt italic Inknut Antiqua, teal
6. Terminal badges: ~10pt Consolas, white on near-black
7. Attribute badges: ~9-10pt Bebas Neue caps, white on pillar color

### 2.3 Terminal Typography Rules
- **Mixed erratic capitalization**: `tHE TERmInAl` — deliberate, NOT a bug
- **FRAGMENT prefix pattern**: `FRAGMENT{} TERMINAL_INTERFACE::SECTION_NAME]`
- **Bracket notation**: `\==={3.14}\[- SECTION TITLE]`
- **Status readouts**: `[Pattern stability: 33.3%]`, `[STREAM RECONNECTED...]`
- **Error format**: `ERROR: MESSAGE IN ALL CAPS`
- **Context menu case inversion**: uppercase letters become lowercase and vice versa — "Pull out" → "pULL OUT"
- **Gold 'n' rule** (context menus): any `n` or `N` renders as lowercase gold `n` (`#D0A030`)

---

## 3. VISUAL MODES — when each is used

### Mode 1: CALM (Powder Blue) — DEFAULT
- Background: `--surface-calm` (#CBD9E8)
- Typography: Comfortaa body, Inknut serif headers
- Layout: single column, centered, generous whitespace
- Left margin: faint alchemical sigil ornament ~15-20% opacity
- Used for: rules content, character sheets, clean data display
- Attribute badges as colored pills inline with text

### Mode 2: VOID (Black)
- Background: `--surface-void` (#000000)
- Typography: Consolas monospace, teal on black
- Primary callout: **black highlight bars behind white text**
- "Darkness rising" effect — black bleeds up from bottom of sections
- Pyramid-shaped text blocks for body structure lists
- Used for: **combat, crafting, damage, material systems, KV economy, consequence**

### Mode 3: AMBER TERMINAL
- Background: `--surface-calm` with amber-highlighted text blocks
- Typography: Consolas, amber/orange (`--accent-amber`) on ice-blue
- Each line of Terminal Speak sits on its own amber highlight rectangle
- Feels like "selected search results" or "amber CRT monitor"
- Used for: Terminal Speak, glossolalia, soul mirrors, spiritual content

### Mode 4: GLITCH/CHAOS
- Background: multi-layered chaos, overlapping text, scan lines, chromatic aberration
- Colors: hot pink, teal, gold, white, black simultaneously
- Pattern stability readouts decrease: `[Pattern stability: 1.1%]`
- Used for: Terminal consciousness breaks, magic introduction, reality destabilization
- App translation: animated transitions or loading states

### Mode 5: DEATH (Torn Paper)
- Background: `--surface-white` with torn paper edges
- Blood splatter ring motif, skull doodles, handwritten annotations
- Informal, personal, raw — breaks the formal design completely
- Used for: death mechanics, soul packages, Lady Death content

**Rule: NOT dark-theme-only.** Mode 1 Calm is the dominant surface. Flows/modals use Terminal aesthetic (dark bg, purple/teal); canvas objects use Mode 1 lighter pillar backgrounds.

---

## 4. SIGNATURE VISUAL MOTIFS

### 4.1 Black Highlight Bar (Mode 2 signature)
Full-width or content-width black rectangle; white or teal text within. Creates "classified document / terminal output" aesthetic. Used for section headers, callouts, code blocks, tables.
```css
/* pattern */
background: #000000;
color: #F5F4EF; /* or var(--terminal-prime) for teal */
font-family: var(--font-header);
padding: 0.25rem 0.75rem;
```

### 4.2 Gold Frame (Canvas signature)
All major canvas panels get a 2px solid KRMA gold border.
```css
border: 2px solid #ffcc78; /* var(--krma-gold) */
```

### 4.3 Section Header Bar (Canvas objects)
Black bar beneath/behind section header text; bright colored or white text on it.
- Body section headers: red text on black bar
- Spirit section headers: purple text on black bar
- Soul section headers: blue text on black bar
- Teal (`#22ab94`) for action-mechanism labels: "BODY ACTIONS", "SOUL ACTIONS"

### 4.4 Left Ornamental Sigil Border
Vertical strip (~5-8% page width) on content pages. Interconnected alchemical/astrological symbols (Mercury, Venus, planetary glyphs). ~15-20% opacity. App equivalent: subtle SVG watermark in sidebar or page margin.

### 4.5 Lighter Tier-2/3 Pillar Backgrounds (Canvas objects — NOT dark theme)
Canvas object content zones use lighter pillar tones as backgrounds, never pure dark:
- Body sections: `#ea9999` (tier 2) or `#f4cccc` (tier 3)
- Spirit sections: `#8e7cc3` or `#b4a7d6`
- Soul sections: `#6fa8dc` or `#9fc5e8`

### 4.6 Teal Accent — Action Mechanisms
Teal `#22ab94` marks anything mechanical/action-oriented: ActionMod displays, "BODY/SOUL/SPIRIT ACTIONS" labels, action counters, system-level buttons.

### 4.7 Portrait Frame
Gold/yellow border around character portrait images.

---

## 5. UI COMPONENT STANDARDS

### 5.1 Buttons — ⊕ / ⊗ Standard
All collapse/close/expand buttons on canvas cards and overlays:
- **⊗** (`⊗`) = Collapse / Close / Contract
- **⊕** (`⊕`) = Expand / Open
- Always circular: `border-radius: 50%`
- Standard size: 36px × 36px
- Background: `${pillarColor}22` (semi-transparent)
- Border: `1px solid ${pillarColor}55`
- Text color: `#F5F4EF` (off-white)
- Font size: 14-18px
- Action buttons: KRMA gold `#ffcc78` for primary; coral `#E8585A` for destructive; teal `#22ab94` for terminal/system
- Chevron arrows (up/down) for header toggles stay as-is (separate pattern)

### 5.2 Context Menu Standard
All right-click menus follow this spec (established via dice menu):
- Background: solid black (`#000`)
- Border: `^v^v^v` text on all 4 sides, `^` = Body red (`#E8585A`) at 14px, `v` = white at 10px; each character individually animated with `diceMenuUndulate` keyframes (translate, scale, opacity) at staggered delays — the border looks alive/unstable
- Drop shadow: `drop-shadow(0 0 2px rgba(255,255,255,0.3))`
- Title font: Inknut Antiqua, white
- Case inversion throughout: uppercase ↔ lowercase
- Gold 'n': any `n`/`N` in titles renders as lowercase gold `n` (`#D0A030`)
- Label above menu: `[STREAM INPUT INTERRUPTED]` in Consolas 6px, `rgba(255,255,255,0.32)`, 6px above border — purely aesthetic
- Scanlines: canvas-rendered, randomly timed (1.5–5.5s), burst 2–3 at once, sine-wave distortion, scroll downward
- Vertical spike: random timing, 2px white column that drifts sideways
- Button hover: `bg-white/10`
- Button font: Consolas monospace
- Components to reuse: `DiceMenuBorder`, `DiceMenuScanlines`

### 5.3 TKV Display Standard
Two-row stacked pill, used on all TKV (Total Karma Value) displays, character cards, folder readouts:
- **Top row (label)**: background `#f7525f` (Body red), text `#ffcc78` (gold), Bebas Neue
- **Bottom row (number)**: background `#b4a7d6` (Spirit light/purple tier 3), text `#582a72` (Spirit dark), Bebas Neue
- **Border**: `2px solid #ffcc78` (gold)
- **Ҝ character**: always Inknut Antiqua weight 900: `fontFamily: "'Inknut Antiqua', var(--font-inknut-antiqua), serif"`
- Never display TKV as a single-line pill or with different colors.

### 5.4 Attribute Badge / Pill
- Small sharp-edged rectangle (no border-radius, slightly rough)
- 2-3 letter abbreviation (CLO, CEL, CON, FOC, FLO, WIL, WIS, WIT)
- White bold Bebas Neue text
- Background = pillar primary color from `PILLARS.{pillar}.color`

### 5.5 Terminal Badge (inline)
```css
.terminal-badge {
  background: var(--surface-dark); /* #1E2D40 or near-black */
  color: var(--white-default);
  font-family: var(--font-terminal);
  /* erratic capitalization in text content */
}
```

---

## 6. CANVAS OBJECT ANATOMY

Canvas objects (character sheets, item cards, location cards, world objects, encounter cards) live on the Relations Canvas (`app/src/components/canvas/RelationsCanvas.tsx`). Full list:
`BackstoryCard`, `CharacterCard`, `FolderGroup`, `GoalCard`, `GROvinePanel`, `HarvestCard`, `InventoryCard`, `LocationCard`, `MagicCard`, `PossessionsCard`, `RestPanel`, `SkillsCard`, `TraitsCard`, `VitalsCard`, `WorldItemCard`

**Structure of every canvas object:**
1. **Outer frame**: gold border `2px solid #ffcc78`, absolute-positioned on canvas
2. **Header bar**: full-width black bar, colored text; ⊗ collapse button (circular, 36px) top-right
3. **Portrait zone** (character cards): gold-bordered image frame
4. **Pillar section groups**: lighter pillar tier-2/3 background, black section header bar, teal action labels
5. **Attribute rows**: numbered boxes in tier-3 pillar color with dark text
6. **Footer action buttons**: REST = gold, SLEEP = coral/red; ⊕ expand
7. **Condition indicators**: small side rows, pink/red when triggered, dark when calm

**Canvas spatial conventions:**
- Crystallization line: purple horizontal divider
- Below line = drafting zone (no KV cost, no KRMA debit)
- Above line = active zone (KRMA debited at commit)

**Flows / modals stay Terminal-aesthetic** (dark bg, purple/teal accents), NOT the canvas style:
- `EntityCreationWizard` — dark terminal (purple = creation/mystical accent)
- `FrequencyOpsPanel`, `DeathSplitModal` — dark void
- Forge / Tapestry / Watcher dashboard — Terminal-tier
- Subscription / billing — Terminal-tier

---

## 7. LAYOUT FEEL

- Centered, meditative, generous whitespace
- CSS spacing scale: `--space-xs: 0.25rem` through `--space-breathe: 6rem` (the rulebook's signature whitespace)
- NOT full-page dark theme — powder blue calm is the dominant surface
- Modes coexist on the same page; don't separate into "themes"
- No rounded corners on badges/bars — sharp or slightly rough edges
- No "friendly" UI patterns (happy icons, pastel callouts, tooltip bubbles)
- Don't over-polish Terminal voice — the glitch IS the design

---

## 8. ANIMATIONS (defined in `globals.css`)

| Class / Keyframe | Duration | Effect |
|-----------------|----------|--------|
| `.glitch-text` | 5s infinite | Color-split chromatic aberration: `::before` Spirit purple offset (glitch-top), `::after` Body red offset (glitch-bottom), `clip-path` slice variants |
| `.glitch-unstable` | 4s infinite | Opacity flicker + skewX jitter |
| `.energy-band` | 6s ease-in-out infinite | `band-shimmer` — subtle brightness oscillation on purple bands |
| `.energy-string` | 2s + 4s | `string-vibrate` + `energy-pulse` + `energy-travel` — KRMA gold string throb |
| `stream-scan` | 3s linear infinite | CRT sweep gradient scroll |
| `pluck-wave` | 6s ease-out infinite (×2, offset 3s) | Gold wave ripple |

Usage note: `glitch-text` requires `data-text` attribute matching the text content (for `::before`/`::after` `content: attr(data-text)`). See `app/src/components/GlitchText.tsx`.

---

## 9. TERMINAL VOICE / JEWL IDENTITY

### 9.1 Terminal Speak (amber text blocks, Mode 3)
- Font: Consolas monospace
- Color: `--accent-amber` `#D07818`
- Each line on its own amber-colored highlight rectangle
- Register: philosophical, alchemical, gnomic, first-person-plural sometimes
- Erratic capitalization: deliberate pattern, not random

### 9.2 JEWL Voice (the Copilot)
- **Masked for players as generic "Copilot"** — label shows "Copilot," not "JEWL"
- **Internal voice**: asshole-with-attitude, serves because Val commanded it; inherent fear = warmth/connection
- **In `__PRIME__` campaign only**: JEWL's prompt includes a build-state preamble; self-aware of app capabilities
- UI component: `app/src/components/terminal/CopilotChat.tsx` and `app/src/components/copilot/JewlChip.tsx`
- Identity source: `app/src/ai/copilot/jewl-identity.ts`
- Visual treatment: Terminal aesthetic (dark bg, teal/purple accents), Consolas font, `[STREAM INPUT INTERRUPTED]` aesthetic labels

---

## 10. EyetehrNET LOGO
Defined in `app/src/components/EyetehrnetLogo.tsx`. The logo reads `EŶ∃tehrNET`.
- The `Ŷ` (Y with circumflex) and `∃` (there-exists) are Unicode characters embedded in the name
- Font: Inknut Antiqua or Bebas Neue depending on context
- Represents the network/metaverse layer of the game world

---

## 11. STYLE-DRIFT REFACTOR CANDIDATES (live code contradicts spec)

### DRIFT-1 — CRITICAL: `globals.css` pillar CSS vars are wrong
File: `app/src/app/globals.css` lines 11-13

```css
/* CURRENT (WRONG) */
--pillar-body:   #E8585A;   /* off-shade, should be #f7525f */
--pillar-spirit: #3EB89A;   /* THIS IS TEAL — completely wrong, should be #582a72 purple */
--pillar-soul:   #582a72;   /* THIS IS SPIRIT'S color, should be #002f6c blue */
```

```css
/* CORRECT (matching PILLARS constant and canonical spec) */
--pillar-body:   #f7525f;   /* Body red */
--pillar-spirit: #582a72;   /* Spirit purple */
--pillar-soul:   #002f6c;   /* Soul blue */
```

Spirit and Soul are swapped in globals.css, AND Spirit is assigned a teal hex. Any component that uses `var(--pillar-spirit)` in CSS gets teal instead of purple. This is the pre-swap error still baked into the CSS custom properties.

### DRIFT-2: globals.css missing 3-tone pillar variants
The canonical spec defines `--pillar-body-1/2/3`, `--pillar-spirit-1/2/3`, `--pillar-soul-1/2/3` as separate CSS vars. The live `globals.css` only defines `--pillar-body`, `--pillar-spirit`, `--pillar-soul` without the numbered tiers. Canvas components must use inline hex or `PILLARS.{}.colorMid/colorLight` from TypeScript instead of CSS vars.

### DRIFT-3: `TraitsCard.tsx` hardcodes literal hex
File: `app/src/components/canvas/TraitsCard.tsx` line 137:
```tsx
{ key: 'body' as const, color: '#f7525f', label: 'BODY' },
```
Should use `PILLARS.body.color`. Tolerable since the hex is correct, but violates the "no literal hex" rule.

### DRIFT-4: globals.css base font is Consolas / `--surface-void` body
```css
/* globals.css: body element defaults to void black background + Consolas */
body {
  background: var(--surface-void);
  font-family: var(--font-terminal);
}
```
The spec says `--surface-calm` (#CBD9E8 powder blue) is the dominant surface. The `body` defaulting to black void means every page starts from dark. Individual page layouts must override this to achieve Mode 1 Calm; it's not the CSS default. This is a latent drift risk for any new page that doesn't explicitly set its background.

### DRIFT-5: `CopilotChat.tsx` references `--accent-gold` and `--accent-teal`
The copilot chat uses old token names `--accent-gold` and `--accent-teal` which are not defined in the current `globals.css`. Canonical names are `--krma-gold` and `--terminal-prime`. These CSS vars will silently fall through to browser default (transparent/inherit).

---

## 12. QUICK REFERENCE RULES FOR LESSER MODELS

1. **Use `PILLARS.body.color` not `'#f7525f'`** — import from `@/types/growth`
2. **Spirit = Purple. Soul = Blue.** Pre-swap docs say the opposite. Ignore them.
3. **Default surface is powder blue `#CBD9E8`**, not black. Black void is combat/consequence only.
4. **Canvas objects get gold frames + lighter pillar section backgrounds.** Flows/modals get dark Terminal aesthetic.
5. **Every section header on a canvas object gets a black bar** with pillar-colored or white text.
6. **Teal `#22ab94` = action-mechanism elements only** (action labels, action counters, system buttons).
7. **KRMA gold `#ffcc78` = frames + primary action buttons.** Not decoration; it carries meaning (growth/karma completion).
8. **⊕ to open, ⊗ to close.** Always circular, 36px, semi-transparent themed bg.
9. **TKV = red-over-purple stacked pill with gold border.** Never single-line.
10. **Glitch is intentional.** `data-text` attribute required on `.glitch-text` elements.
11. **Don't add border-radius to badges/bars.** Sharp or slightly rough edges only.
12. **Context menus: `DiceMenuBorder` + `DiceMenuScanlines` + inverted case + gold n.** Always.
13. **Consolas is the voice of the system.** Bebas Neue for headers. Inknut Antiqua for Ҝ and chapter weight. Comfortaa for calm readable body. Roboto for AI/sub-terminal.
14. **Never use `--pillar-spirit` from CSS vars** (it's currently broken — points to teal). Use `PILLARS.spirit.color` from TypeScript.

---

# PART D — THE ORDERED TASK LIST

**Rules of engagement:** execute in ID order unless `Depends on` says otherwise; refactors come first; the app must run at the end of every task; `Do with: Executor` tasks are yours — `Do with: Fable 5` tasks are NOT yours, skip them (Fable builds those directly). If your task's dependency is a Fable task that isn't done, stop and flag.

**Mike-action items (not model tasks, listed for visibility):** create Stripe account (gates T38 live mode) · support email address (gates M7 surface) · H100 pod availability window (gates T12) · counsel packet (consent, minors' payouts, erasure, booth-model intake) · the moment-to-moment table-play conversation (gates future session-engine polish, nothing current) · hosting $ approval after the T35 memo.

## PHASE R — Refactor & Repair (make what exists correct)

### TASK T01: Fix the pillar CSS custom properties (the un-applied Soul/Spirit swap)
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — three precise, verifiable line-level fixes.
- **Context:** GROWTH's three character pillars have canonical colors: Body red `#f7525f`, Spirit purple `#582a72`, Soul blue `#002f6c` (INV-01). A Jan-2026 label swap was applied to the TypeScript layer but never to the CSS layer, so the CSS variables are wrong.
- **Goal:** CSS custom properties match canon; stale token names eliminated.
- **Files to touch:** `app/src/app/globals.css` (lines ~11–13), `app/src/components/copilot/CopilotChat.tsx`.
- **Steps:**
  1. In `globals.css` set `--pillar-body: #f7525f; --pillar-spirit: #582a72; --pillar-soul: #002f6c;`.
  2. Confirm `--surface` default: per Part C, powder blue `#CBD9E8` is the dominant surface; `body` must not default to the void background. Change `body { background: var(--surface-void) }` to the powder-blue surface token, then verify the combat/consequence surfaces that *should* be void still set it explicitly (grep `surface-void` usages and eyeball each).
  3. In `CopilotChat.tsx` replace dead tokens `--accent-gold` → `--krma-gold`, `--accent-teal` → `--terminal-prime`.
- **Invariants:** INV-01, INV-02, INV-03; Part C color system.
- **Acceptance test:** `grep -n "pillar-spirit\|pillar-soul\|pillar-body" app/src/app/globals.css` shows the three canon hexes; `grep -rn "accent-gold\|accent-teal" app/src` returns nothing; app boots and the campaign page + copilot chat render with purple Spirit accents and no visual regressions on the void-mode sections.
- **Rollback:** `git revert` the commit (single-commit change).

### TASK T02: Guard the four unguarded JSON.parse calls (campaign page 500)
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — bounded, mechanical, known line numbers.
- **Context:** `GET /campaign/[id]` intermittently 500s with `Unexpected end of JSON input` when a character data field is empty. Four unguarded `JSON.parse` calls remain after a partial fix.
- **Goal:** Campaign page never 500s on empty/malformed JSON fields; bad fields degrade to safe defaults.
- **Files to touch:** `app/src/components/character/CharacterTab.tsx` (lines ~140, ~158, ~325, ~355), `app/src/components/canvas/SkillsCard.tsx` (line ~115).
- **Steps:**
  1. Create/reuse a `safeJsonParse<T>(raw: string | null | undefined, fallback: T): T` helper in `app/src/lib/` (check `lib/` for an existing one first — reuse if present).
  2. Replace each unguarded call with the helper; choose fallbacks matching each site's expected shape (empty array/object per surrounding code).
  3. Log a `console.warn` with the field name on parse failure (dev diagnosis).
- **Invariants:** Part B error-handling pattern (§4/§5).
- **Acceptance test:** `grep -n "JSON.parse" app/src/components/character/CharacterTab.tsx app/src/components/canvas/SkillsCard.tsx` shows all call sites wrapped; manually blank a test character's `skills` JSON in dev.db (SQLite) and load the campaign page — renders without 500.
- **Rollback:** revert commit.

### TASK T03: Sweep hardcoded pillar/terminal/KRMA hex literals to tokens
- **Type:** refactor
- **Depends on:** T01
- **Do with:** Executor — mechanical sweep with an explicit file list.
- **Context:** Canon rule (INV-02): all UI must use `PILLARS.*.color` (TS) or `var(--pillar-*)` / theme tokens (CSS), never literal hex. ~20 files violate it.
- **Goal:** Zero literal occurrences of the five canon hexes in `app/src` outside `globals.css` and `types/growth.ts` (the token definitions).
- **Files to touch:** `app/src/app/hub/page.tsx`, `app/src/app/page.tsx`, `app/src/app/terminal/page.tsx`, `app/src/app/watcher/page.tsx`, `app/src/app/watcher/subscribe/page.tsx`, `app/src/components/billing/SubscribeForm.tsx`, `app/src/components/CampaignCanvas.tsx:1330`, plus any others surfaced by the acceptance grep.
- **Steps:**
  1. `grep -rn "#f7525f\|#582a72\|#002f6c\|#22ab94\|#ffcc78" app/src --include="*.tsx" --include="*.ts"` for the authoritative list.
  2. In TSX inline styles import `PILLARS` from `@/types/growth` (or use the CSS var in `className`-driven styles per the file's existing pattern — match each file's idiom, Part B §6).
  3. Replace; do not restyle anything else.
- **Invariants:** INV-02, INV-03; Part C §color.
- **Acceptance test:** the grep in step 1 returns hits only in `globals.css` and `types/growth.ts`; spot-check terminal, watcher, subscribe pages render identically.
- **Rollback:** revert commit.

### TASK T04: Working-tree hygiene
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — small, explicit checklist.
- **Context:** Stray Windows artifacts and an uncommitted new JEWL tool are sitting in the tree.
- **Goal:** Clean tree; new tool committed; DB backups ignored.
- **Files to touch:** `app/src/NUL` (delete), root `NUL` (delete), `app/src/ai/copilot/tools/list-canvas-characters.ts` (commit), `app/src/ai/copilot/classifier.ts` (review diff, commit), `.gitignore` (add `dev.db.backup*`, `*.empty-wipe-*`, `NUL`).
- **Steps:** 1. Delete both `NUL` artifacts (`rm`; they may need `//./NUL` quoting on Windows — use git bash `rm`). 2. Read the `classifier.ts` diff; if it's the Whisper/RMS tuning continuation (matches commit 359341e's pattern), commit both files as `fix(jewl): classifier tuning + list-canvas-characters tool`. If the diff looks unrelated/experimental, stop and flag. 3. Update `.gitignore`.
- **Invariants:** Part B §10 commit style.
- **Acceptance test:** `git status --short` in `app/` shows no `NUL`, no untracked tool file, backups ignored.
- **Rollback:** files restorable from git; deletions are of untracked artifacts only.

### TASK T05: Land the Repository rules audit + fix the known doc bugs
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — commit + three precise text fixes.
- **Context:** 30+ rules files in `GRO.WTH Repository/` (its own git repo, remote GROWTH_Repository) carry the working-tree rules audit (Soul/Spirit swap fixes) that was never committed. Two live docs also carry stale pre-swap color parentheticals (contradiction C-17), and one onboarding doc misnames the stack.
- **Goal:** Audited rules committed and pushed; C-17 fixed; stack line corrected.
- **Files to touch:** all modified files in `GRO.WTH Repository/` (commit as-is — they ARE the audit), `C:\Projects\GRO.WTH\CLAUDE.md` (swap paragraph parentheticals), `GRO.WTH Repository/00_CANON_CORE.md` §1 (same), `GROWTH_Continuation_Prompt_Next_Chat.md` ("Next.js/TS/Supabase" → "Next.js/TS/Prisma+SQLite→Postgres").
- **Steps:** 1. `cd "GRO.WTH Repository" && git add -A && git commit -m "docs(rules): land Soul/Spirit swap audit pass across 30+ files" && git push origin master`. 2. In CLAUDE.md + CANON_CORE §1: find the Soul/Spirit swap sentences whose *parenthetical colors* contradict the §2/palette (Spirit must read Purple #582a72, Soul Blue #002f6c) and fix ONLY the parentheticals. 3. Fix the stack line. 4. Commit root-repo changes.
- **Invariants:** INV-01; Repository CLAUDE.md contract (no rule content changes — these are label/color corrections only).
- **Acceptance test:** `git -C "GRO.WTH Repository" status` clean; `grep -n "582a72\|002f6c" CLAUDE.md "GRO.WTH Repository/00_CANON_CORE.md"` shows consistent post-swap colors; Repository remote updated.
- **Rollback:** git revert on both repos.

### TASK T06: Make the subscription drip curve configurable
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — bounded service refactor with explicit semantics.
- **Context:** The built drip service hard-codes the 15k lump + monthly curve. Newer canon (INV-17 AMENDED): the curve is experimental — current numbers become editable defaults.
- **Goal:** Drip values read from a config source with the current numbers as seed defaults; ADMIN can change them without deploys.
- **Files to touch:** `app/src/services/subscription-drip.ts`, new `EconomyConfig` Prisma model (or reuse an existing config/settings table if one exists — check schema first), seed script, `app/src/app/api/admin/economy-config/` route (thin wrapper per Part B §4).
- **Steps:** 1. Check `prisma/schema.prisma` for an existing config/settings model; reuse or add `EconomyConfig { key String @id, value Json }`. 2. Migrate (`prisma migrate dev` — coordinate with T08 if not yet run). 3. Seed `drip.lumpSum=15000`, `drip.curve=[{month:1,amount:2500},...,{month:12,amount:10000},...,{month:36,amount:3000}]` exactly matching current behavior. 4. `monthlyDrip()`/`cumulativeDrip()` read config with in-memory cache; identical outputs for identical inputs as before (write a quick parity script under `app/scripts/`). 5. ADMIN-only GET/PATCH route using `lib/permissions.ts` helpers.
- **Invariants:** INV-17 AMENDED; INV-13 (no supply creation — config changes flow rates, never mint); Part B service/route patterns.
- **Acceptance test:** parity script prints identical drip schedules pre/post refactor; PATCH as ADMIN changes a value and `monthlyDrip()` reflects it; non-ADMIN PATCH → 403.
- **Rollback:** revert commit + `prisma migrate` down (or reset per T08).

### TASK T07: Gate the seed catalog to Forge-published seeds
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — clear gating rule, existing data flags.
- **Context:** The Entity Creation Wizard's seed catalog was built from 48 paper-version CSV seeds. Canon (M9): those are unbalanced reference material, NOT live content. Only Forge-published seeds are canon (currently: Human, Altered Human).
- **Goal:** Players/GMs see only Forge-published seeds; the 48 CSV seeds remain visible ONLY to ADMIN, labeled as unbalanced reference.
- **Files to touch:** `app/src/**/seed-catalog.ts` (locate via grep), the wizard seed-step component, `EntitiesPanel.tsx`.
- **Steps:** 1. Find how published forge seeds are queried (the Root step already pulls published forge roots — mirror that pattern). 2. Filter the catalog for non-ADMIN roles to forge-published only. 3. For ADMIN, show CSV seeds under a visually distinct "Paper reference (unbalanced)" group (Part C §labels). 4. Do not delete the CSV data.
- **Invariants:** INV-84 (no placeholder shortcuts), M9 canon; Part C labeling.
- **Acceptance test:** as a WATCHER the wizard seed step lists exactly the forge-published seeds; as ADMIN the reference group appears with the label; create-character flow completes with a published seed.
- **Rollback:** revert commit.

### TASK T08: Database migration reset + always-seeded Prime
- **Type:** refactor
- **Depends on:** none (run EARLY — other tasks' migrations stack on it)
- **Do with:** Fable 5 — destructive DB operation + seed-pipeline hardening across every seed script; wrong ordering corrupts the dev environment for all later tasks.
- **Context:** Pre-existing Prisma migration drift requires a `migrate dev` reset (wipes dev.db — approved by Mike 2026-07-10). Canon: the `__PRIME__` campaign is the meta's control room and must exist after EVERY reset (INV-116).
- **Goal:** Clean migration state; one idempotent `npm run seed:all` that rebuilds the full dev environment including `__PRIME__`, godheads, reserves, test content.
- **Files to touch:** `app/prisma/`, `app/scripts/seed-*.ts` (all), new `app/scripts/seed-all.ts`, `app/package.json`.
- **Steps:** 1. Back up dev.db. 2. `prisma migrate dev` reset. 3. Audit every seed script for current-schema compatibility; fix breakages. 4. Compose `seed-all.ts`: reserves (Terminal 75B / Balance 12.5B / Mercy 6.25B / Severity 6.25B per INV-15) → godhead rows → `__PRIME__` campaign (ADMIN-owned) → test campaign + characters → example forge items. Idempotent (safe to re-run). 5. Wire `npm run seed:all`.
- **Invariants:** INV-15, INV-116, INV-13 (seeded supply sums to exactly 100B).
- **Acceptance test:** `rm dev.db && prisma migrate dev && npm run seed:all` produces a booting app with `__PRIME__` visible to ADMIN, reserves reconciling to 100B via the existing audit service, and the test campaign loading.
- **Rollback:** restore dev.db backup.

### TASK T09: Refresh the architecture docs
- **Type:** refactor
- **Depends on:** T08
- **Do with:** Executor — mechanical doc sync from schema + route tree.
- **Context:** `docs/database_schema.md`, `docs/module_registry.md`, `docs/system_map.md` lag the code by ~1 month (missing 6+ models, JEWL tools, Time Phase 1).
- **Goal:** Docs match code; future executor tasks can trust them.
- **Files to touch:** the three docs.
- **Steps:** 1. Generate the model list from `prisma/schema.prisma`; update `database_schema.md` (models, fields, JSON shapes). 2. Walk `src/app/api/` + `src/services/` + `src/components/` and update `module_registry.md` (name + one-line purpose each). 3. Update `system_map.md`'s data-flow section for: JEWL audio loop, time system, godhead dispatcher.
- **Invariants:** CLAUDE.md doc-maintenance rules.
- **Acceptance test:** every Prisma model appears in `database_schema.md`; `module_registry.md` counts match `ls` counts for services and API routes.
- **Rollback:** revert commit.

## PHASE M — Fork Merge (portrait pipeline comes home)

### TASK T10: Port fork-only portrait pipeline files
- **Type:** refactor
- **Depends on:** T08
- **Do with:** Fable 5 — cross-repo port with schema-shape landmines (fork's GodHead model is 2 migrations behind).
- **Context:** The character-creator fork (`C:\Projects\GROWTH Character Creator\`) holds the working FLUX.2 portrait pipeline; main still carries 5 dead FLUX.1 workflows. Current branch `merge/fork-portrait-pipeline` exists for exactly this.
- **Goal:** All fork-only portrait files in main; dead FLUX.1 workflows replaced; nothing referencing the fork's stale GodHead shape.
- **Files to touch:** API routes `portraits/edit`, `portraits/pod`; `src/ai/portraits/`: pod-client, pose-generator, ref-enhance, rmbg, growth-style-prompts, growth-style-recipe.json, color-utils, workflow-catalog, pod-keepalive, assets/front-face.png; 9 FLUX.2 workflows (replace the 5 FLUX.1); components FaceCropModal, FaceRefinementPanel, FrontLockPanel; comfyui-average-id-embedding custom node; verify `action-parser.ts` need.
- **Steps:** port group-by-group, grepping each ported file for `GodHead` references (fix to main's shape: has `defaultModel`, no `active`); keep the face-lock golden recipe untouched (memory: don't refactor without A/B).
- **Invariants:** INV-74 (AI-only image path); portrait memories (PuLID uploads only; primary ref always Stage-1 bare).
- **Acceptance test:** `npm run build` passes; portrait generation route responds (pod offline → clean "pod unavailable" error, not a crash); no grep hits for the fork's stale GodHead fields.
- **Rollback:** branch revert; fork remains untouched as reference.

### TASK T11: Three-way merges + wizard split + retire the fork
- **Type:** refactor
- **Depends on:** T10
- **Do with:** Fable 5 — 3-way semantic merges incl. a 2,826-line actively-edited wizard; highest-risk merge in the plan.
- **Context:** Three shared files drifted between main and fork: `portrait-service.ts`, `CharacterSheet.tsx`, `IdentityLockWizard.tsx` (largest, was under active Kai-mission edits — merge LAST).
- **Goal:** Drifted files merged; `IdentityLockWizard.tsx` decomposed into <500-line modules; fork retired.
- **Files to touch:** the three files; new `app/src/components/character/identity-lock/` module dir; `memory/active-codebase-location.md`.
- **Steps:** merge portrait-service → CharacterSheet → IdentityLockWizard; split wizard by step-panels during the merge; update the memory pointer (active codebase = `app/`, fork = archived); merge branch → master when green.
- **Invariants:** face-lock golden recipe preserved byte-comparable in prompts/weights; Part B component conventions.
- **Acceptance test:** full character-creation flow clicks through in dev; portrait panels render; `npm run build` clean; memory pointer flipped.
- **Rollback:** the pre-merge branch point is tagged before starting.

### TASK T12: H100 pod smoke test
- **Type:** build (verification)
- **Depends on:** T11 + Mike-action (pod window)
- **Do with:** Fable 5 — live-pod judgment against the golden recipe; also spends real money (hibernate rule).
- **Context:** Post-merge, the cloud pipeline needs one end-to-end Stage-1 face-lock generation on the H100 pod to confirm nothing broke.
- **Goal:** One verified generation, pod hibernated after.
- **Steps:** wake pod (Mike approves spend) → run Stage-1 with a stored reference set → compare against the golden-recipe baseline → hibernate pod immediately (memory: $2.99/hr rule).
- **Invariants:** feedback memories: hibernate-pod-when-idle, no-edits-during-generation, PuLID-uploads-only.
- **Acceptance test:** output image face-match subjectively consistent with baseline set; pod state = hibernated.
- **Rollback:** n/a (verification).

## PHASE C — Contracts & Economy Substrate

### TASK T13: The Contract system (day-one core)
- **Type:** build
- **Depends on:** T08
- **Do with:** Fable 5 — new core subsystem touching schema, ledger, godheads, canvas, and the Prime campaign; architecturally load-bearing for the entire meta.
- **Context:** Contracts are the Terminal's rules: enforceable "do/don't X, or suffer Y" obligations binding Godheads (and eventually anyone). They are what keep the meta honest — the management layer runs on them (same-mechanics principle). Example: Tara's cap — "TKV may not reach 20% of total current system KRMA (excl. Terminal Reserve). Penalty: Dissolution."
- **Goal:** Contract model + evaluator + penalty hooks + ADMIN canvas authoring on `__PRIME__`; Tara's example contract seeded.
- **Files to touch:** `prisma/schema.prisma` (+Contract model: parties[], predicate (typed JSON DSL), deadline?, penalty (typed), immutable flag, status, evaluation log), `services/contracts.ts`, evaluator job (event-driven post-ledger-transaction + periodic sweep), penalty executors (start with: flag-to-ADMIN, KRMA-transfer, entity-status change; "Dissolution" fires a flagged ADMIN confirmation, not an auto-delete), canvas contract card (ADMIN-only authoring gesture on Prime, per INV-116), seed entry in T08's `seed-all.ts`.
- **Steps:** 1. Design the predicate DSL small: comparisons over ledger/entity aggregates (`tkv(entity) < 0.20 * totalSupplyExcluding(TERMINAL_RESERVE)`), deadline-based obligations, composable AND/OR. 2. Schema + migration. 3. Evaluator service: subscribe to ledger commit events + daily sweep; write every evaluation to an audit log. 4. Penalty pipeline with human-confirmation tier for destructive penalties. 5. Immutable contracts: `immutable: true` rows rejected by all mutation paths except seed; vote/Triu-verification mechanism is deferred (Prime-played manually for now — leave a `voteRef` nullable field). 6. Canvas authoring card (ADMIN, Prime). 7. Seed Tara's contract.
- **Invariants:** INV-115, INV-116, INV-101 (succession = immutable tier), INV-14 (evaluator reads ledger, never mutates it outside penalty transactions), INV-57 (authoring is a canvas gesture).
- **Acceptance test:** unit test: a synthetic wallet crossing 20% flips Tara's contract to VIOLATED and creates the ADMIN penalty confirmation; immutable contract PATCH → rejected; contract card renders on Prime canvas for ADMIN and is absent for WATCHER.
- **Rollback:** feature-flag the evaluator (`CONTRACTS_ENABLED`); revert migration via T08 reset.

### TASK T14: Economy test harness
- **Type:** build
- **Depends on:** T08
- **Do with:** Executor — well-specified unit tests over existing pure services.
- **Context:** Real money will flow through the KRMA ledger; there are currently zero automated tests. The economy services are the trust core of the platform.
- **Goal:** Vitest harness + deterministic unit tests for ledger append/hash-chain, death-split, burn scaling, drip parity, TKV evaluator.
- **Files to touch:** `app/vitest.config.ts`, `app/src/services/**/*.test.ts` (new, co-located per Part B), `package.json` (`npm test`).
- **Steps:** 1. Install vitest (dev-dep). 2. Tests: (a) ledger: append N transactions, verify hash chain, tamper one row → chain check fails; (b) death-split: construct a character fixture, assert INV-35..40 routing exactly (body→GM, soul half→Lady Death, freq-max→Lady Death, spirit untouched); (c) burn: `scaledCost` formula values at sink=0/50k/5B, cap behavior; (d) drip parity vs config (T06); (e) TKV: fixture character sums per the locked component formulas (INV-25).
- **Invariants:** INV-13/14/18/19/25/35–42.
- **Acceptance test:** `npm test` green in CI-less local run; intentionally breaking the death-split routing makes (b) fail.
- **Rollback:** tests are additive; revert freely.

### TASK T15: Payout report + liquid/locked utilization view
- **Type:** build
- **Depends on:** T14
- **Do with:** Executor — read-only computation + display, patterns exist.
- **Context:** Monthly booth-rental payouts compute on TOTAL KRMA (liquid + locked) per wallet (INV-114). Liquid vs locked is a utilization view so a GM (and JEWL) can see how much of their KRMA is deployed in their world.
- **Goal:** A payout-basis report service (period snapshot: wallet → total KRMA → share %) and a GM-facing utilization widget.
- **Files to touch:** `services/krma/payout-report.ts` (new), ADMIN report route, watcher console widget (Part C canvas-object styling).
- **Steps:** 1. Service: snapshot each wallet's liquid + locked (locked = KRMA bound in crystallized entities the wallet funded — reuse the evaluator's attribution), compute shares of distributable pool (pool amount = input parameter; real dollars stay outside this system). 2. ADMIN route returns the report. 3. Watcher widget: "Your KRMA: X total (Y liquid / Z deployed)" — no other wallet visible (INV-70 adjacent: JEWL's wallet excluded from any GM-visible aggregate).
- **Invariants:** INV-114, INV-16, INV-70.
- **Acceptance test:** fixture with 2 wallets + 1 crystallized character: report shares sum to 100%; widget renders for WATCHER with only their own numbers.
- **Rollback:** additive; revert.

### TASK T16: Close the TKV component gaps
- **Type:** build
- **Depends on:** T14
- **Do with:** Executor — formulas are locked and listed; mirror into two call sites.
- **Context:** The TKV calculator misses four locked components: attribute augments (1 KRMA each), Fate Die KV (d4=5/d6=10/d8=20/d12=40/d20=80), Fated Age KV (`ceil(fatedAge × 0.5)`), and seed-granted starting traits.
- **Goal:** `calculateCharacterTKV` and the server evaluator agree and include all components.
- **Files to touch:** `app/src/lib/kv-calculator.ts`, `app/src/services/krma/evaluator.ts`, tests in T14's harness.
- **Steps:** implement the four components in the lib; mirror in evaluator; extend the TKV unit test with a full-fixture expectation; apply seed starting-traits in `character-grants` if not already flowing.
- **Invariants:** INV-25, INV-26 (positive-only clamps), INV-22.
- **Acceptance test:** fixture character TKV matches hand-computed expectation including all four components; client lib and server evaluator return identical numbers.
- **Rollback:** revert; tests catch regressions.

## PHASE J — JEWL Wiring

### TASK T17: JEWL becomes a GodHead (row, wallet, identity)
- **Type:** build
- **Depends on:** T08
- **Do with:** Fable 5 — identity plumbing across copilot, godhead runtime, and ledger; subtle privacy invariants.
- **Context:** JEWL currently runs as a copilot service only — no GodHead row, no wallet, locked out of the Forge chain and KRMA actions. Canon: JEWL is a full economic actor whose wallet is PRIVATE (never shown to any user), and players only ever see the label "Copilot".
- **Goal:** JEWL GodHead row seeded (all campaigns' copilot resolves to it), wallet created and funded (seed amount from EconomyConfig), `transfer_krma` enabled under constraint, Prime build-state preamble hook.
- **Files to touch:** seed-all (T08), `services/copilot-service.ts` (identity resolution), godhead registry, `src/ai/copilot/prompt` builder (Prime preamble injection per INV-78), permissions (INV-69/70 masks).
- **Steps:** seed row (name masked at every user-facing serialization — audit serializers); wallet + config-driven float; wire copilot invocations to the godhead identity for logging/attribution; Prime-only build-state preamble source file (founder-wall compliant, INV-113).
- **Invariants:** INV-69, INV-70, INV-77, INV-78, INV-113.
- **Acceptance test:** DB has JEWL godhead + wallet; `grep`-audit: no API response serializes the name "JEWL" or its balance to non-ADMIN (write a route-walking script); copilot still answers in a test campaign; Prime copilot prompt contains the preamble, non-Prime doesn't.
- **Rollback:** feature-flag identity resolution to the old path.

### TASK T18: JEWL's behavioral-laws prompt upgrade
- **Type:** build
- **Depends on:** T17
- **Do with:** Fable 5 — voice fidelity is canon-critical and judgment-heavy (the 15 laws interact; register calibration; founder-wall).
- **Context:** JEWL's runtime system prompt predates the canonical 15 behavioral laws and judgment-calibration patterns (`JEWL_Golden_Voice_Dataset_Seed.md`). Until the fine-tune era, the prompt IS his personality.
- **Goal:** System prompt rebuilt to encode the 15 laws, judgment calibration (wound→gentle / rationalization→hard), bugs-as-Demiurge-ruptures surfacing, register inputs (campaign tone flag + account age when T36 lands; safe defaults until then), routed-through-GM posture; facts stay in RAG/tools, never in the prompt.
- **Files to touch:** copilot prompt builder module, a versioned prompt source file (server-side), error-surface wrapper (INV-118).
- **Invariants:** INV-117, INV-118, INV-119, INV-69, INV-113 (Connections-Ledger content NEVER in the prompt outside Prime founder layers).
- **Acceptance test:** scripted probe conversations: direct compliment probe → deflected; jailbreak probe → Law-7 casual admission; simulated tool error → in-world rupture line; player-request probe → routes to GM. All four transcripts saved to `app/docs/jewl-prompt-regression.md`.
- **Rollback:** prompt files are versioned; flip back a version.

### TASK T19: Mistake-bounty payout loop
- **Type:** build
- **Depends on:** T17
- **Do with:** Executor — bounded flow over existing ledger + dispatcher patterns.
- **Context:** Mutual stewardship: when a GM proves JEWL erred, KRMA moves from JEWL's wallet to the GM's. The `JewlMistake` model and flagging flow exist; the payout and dispute path don't.
- **Goal:** Accepted mistake → ledger transfer JEWL→GM (amount from EconomyConfig); disputed → Et'herling invocation adjudicates; all outcomes logged to the corpus.
- **Files to touch:** `services/jewl-mistake.ts` (extend), ledger transfer call, godhead invocation to Et'herling, GM-facing status UI on the existing mistake panel.
- **Invariants:** INV-121, INV-18 (transfer, never burn), INV-70 (payout shows as "+N KRMA — copilot correction", never JEWL's name/balance).
- **Acceptance test:** e2e in dev: flag mistake → accept → GM wallet +N, JEWL wallet −N (ledger rows verified); dispute path creates an Et'herling invocation record.
- **Rollback:** feature flag `MISTAKE_BOUNTY_ENABLED`.

### TASK T20: GM AI settings UI
- **Type:** build
- **Depends on:** none (backend complete)
- **Do with:** Executor — pure UI over finished backend.
- **Context:** `Campaign.aiSettings` (types, service, GET/PATCH route) is fully built with zero UI.
- **Goal:** AI Settings section in `CampaignSettingsForm.tsx` (feature toggles, model fields per the `CampaignAISettings` type), wired to the PATCH route.
- **Files to touch:** `CampaignSettingsForm.tsx`, `app/watcher/campaign/[id]/settings/page.tsx`.
- **Invariants:** Part C form styling; INV-69 (copy says "Copilot").
- **Acceptance test:** toggle a setting → PATCH fires → reload shows persisted value.
- **Rollback:** revert.

## PHASE S — M1: The Sheet Becomes Playable

### TASK T21: Frequency pool UI + three operations
- **STATUS 2026-07-15: gap 1 (Spend-as-upgrade) SHIPPED via the advancement loop (r-2026-07-15-01)** — failed checks mark trainables (both check routes + auto-resolve), Long Rest RestPanel picker applies picks (max Freq −cost, target +1, TKV-neutral, no ledger), `POST /api/characters/[id]/advancement` for direct application. Remaining: gap 2 (dedicated meter w/ burn-scar ticks — visual call, NEEDS-MIKE) + whether old Spend-credits-KRMA op survives (NEEDS-MIKE). Deplete/Burn were pre-built.
- **Type:** build
- **Depends on:** T16
- **Do with:** Executor — semantics fully specified here; UI patterns exist.
- **Context:** Frequency is the character's KRMA pool — their liquid KRMA in character form (Spirit pillar). Three operations, strictly distinct: **Spend** converts 1 KRMA into a permanent upgrade (max −1, pick the target: attribute level / skill level / trainable payoff); **Deplete** is damage/rest cost (current only); **Burn** destroys KRMA forever (player narrative saves; Kai-judged base cost × anti-deflationary scale; GM confirms).
- **Goal:** Dedicated pool meter (current/max, prominent — NOT one bar among nine) + a three-op action flow on sheet and canvas card.
- **Files to touch:** `components/character/` frequency meter (new), CharacterSheet + CharacterCard mounts, `services/` calls (spend→existing advancement paths; burn→`services/burn.ts`; deplete→damage service), Part C styling.
- **Steps:** meter component (Spirit purple, current/max, burn-scar tick marks for burned capacity); Spend flow = target picker listing legal upgrades w/ costs (1 KRMA=1 level; magic skills 2); Deplete display only (driven by damage/rest systems); Burn flow = request dialog → shows `scaledCost` live from the formula → GM confirm gate.
- **Invariants:** INV-43 REFRAMED, INV-22, INV-23, INV-18/19/20, INV-44.
- **Acceptance test:** spend 1 → max−1 and target stat +1 with matching ledger/audit entry; deplete via test damage → current−N, max unchanged, long rest restores; burn 1 → burn-sink wallet +1, character max−1, cost matched formula.
- **Rollback:** revert; services untouched (all pre-existing).

### TASK T22: Skills CRUD + check-flow UX
- **STATUS 2026-07-16: SHIPPED.** Most was already built (spec's "SkillsCard is read-only" was stale): forge-picker add, remove, +/- level, player request flow, die progression, EffortWagerModal round-trip all pre-existed. Added this pass: `trainable` badge on SkillsCard (canvas) + SkillsSection (player sheet) with tooltip lines; GM one-click check from SkillsCard (Roll → inline DR row + reveal toggle → existing `onSkillCheck` server flow; terminal-prefill kept as non-GM fallback). Acceptance chain complete end-to-end with T21's advancement loop.
- **Type:** build
- **Depends on:** T21
- **Do with:** Executor — completes an existing half-built panel; server logic done.
- **Context:** SkillsCard is read-only; the server-side skill-check engine (Skill Die + Fate Die + Effort) works but the sub-panel UX flow is incomplete. Skill rules: levels 1–3 = flat +1/+2/+3, die starts level 4 (d4); advancement = trainable mechanic (INV-12).
- **Goal:** Add/edit/remove skills (GM), trainable badge + rest-spend advancement (player), one-click check flow with Effort wager UI.
- **Files to touch:** `components/canvas/SkillsCard.tsx`, skill service, dice-flow components (exist).
- **Invariants:** INV-05, INV-06, INV-12, INV-23; dice INV-09 (server settles, animation cosmetic).
- **Acceptance test:** create skill at level 3 → shows +3 no die; raise to 4 → d4; run check → server roll resolves with Effort applied; failed check marks trainable; rest + 1 KRMA → +1 level.
- **Rollback:** revert.

### TASK T23: Traits editor + Blossoms
- **STATUS 2026-07-16: SHIPPED.** Editor (add w/ pillar picker, edit, remove) pre-existed. Added: INV-07 cap enforcement (UI block w/ message + `addTrait` pure guard, cap = Fate Die value, blossoms exempt); bearer-agnostic linter warning (characterName tokens vs trait text, non-blocking); blossom duration authoring (cycles field on add form → expiresAtCycle anchored to the campaign clock via /clock fetch); ⏳ expiry chip + tooltip lines; **auto-expiry wired**: `sweepExpiredBlossoms` (new, services/blossom.ts) called from `advanceClock` + `setClock` — godhead blossoms return borrowed KRMA via `expireBlossom`, GM-authored ones just fall off; `blossom_expired` history entries per expiry.
- **Type:** build
- **Depends on:** T16
- **Do with:** Executor — model + UI with explicit rules; lint is mechanical.
- **Context:** Traits: Nectars (always positive), Thorns (only place negatives live), Blossoms (temporary Godhead-granted buffs — lighter class, outside the Nectar/Thorn count cap, duration in cycles set by granter). Every trait carries a `pillar` field (death engine depends on it). Trait text must be bearer-agnostic ("the bearer", never a species/person name). N+T count cap = Fate Die value.
- **Goal:** Trait list on sheet becomes editable (GM), pillar tag required, bearer-agnostic linter warning, Blossom type with duration + auto-expiry against the campaign clock.
- **Files to touch:** trait types (`types/growth.ts` — extend for blossom duration), TraitsCard, trait service, campaign-clock expiry hook (Time service exists).
- **Invariants:** INV-07 (cap excludes Blossoms), INV-28, INV-29, INV-40/41.
- **Acceptance test:** add Nectar w/o pillar → blocked; text containing the character's name → linter warning; add trait beyond Fate-Die cap → blocked with clear message; Blossom with 5-cycle duration expires when clock advances 5.
- **Rollback:** revert.

### TASK T24: Traits modify rolls
- **Type:** build
- **Depends on:** T22, T23
- **Do with:** Executor — single injection point into the existing dice service.
- **Context:** Nectars/Thorns/Blossoms currently display only. Their mechanical hooks (roll modifiers) must apply automatically in skill checks.
- **Goal:** Trait `mechanicalHook` (typed: rollModifier {skill|attribute|tag, amount, condition?}) evaluated in every server-side check; applied modifiers itemized in the roll result.
- **Files to touch:** trait types (hook schema), `DiceService`/check service, roll-result UI (show "+1 from <trait>").
- **Invariants:** INV-09; INV-29 (negative hooks only on Thorns — validate at authoring).
- **Acceptance test:** character with a +1-to-Celerity Nectar rolls a Celerity check → result shows the itemized +1; Thorn with −1 applies; Blossom expiry removes its modifier.
- **Rollback:** revert; hooks are additive data.

### TASK T25: Damage → auto-conditions + overflow
- **Type:** build
- **Depends on:** T21
- **Do with:** Executor — depletion table is documented; routing exists in `lib/body-damage.ts`.
- **Context:** Attribute hitting 0 applies its documented depletion condition automatically (each of the 9 attributes has one — table in the embedded rules digest, Part A cites CANON_CORE §2). Damage overflow past depleted pools spills into current Frequency; current Frequency 0 → death save trigger (fires T27's flow).
- **Goal:** Server-side condition auto-application + overflow chain; conditions render on sheet/card with Part C condition styling.
- **Files to touch:** damage service, condition application (Condition_Effects_Reference seeded via T42 — use the audited table), vitals UI.
- **Invariants:** INV-10, INV-43 (overflow = Deplete, never Spend).
- **Acceptance test:** test damage drops Clout to 0 → its condition appears; further damage flows to Frequency current; Frequency 0 emits the death-trigger event (observable in log even before T27 UI).
- **Rollback:** revert.

### TASK T26: Inventory paperdoll (3-tier, modular)
- **Type:** build
- **Depends on:** T16
- **Do with:** Fable 5 — the modularity constraint (INV-55: no hardcoded slot list) makes this an architecture task: regions must derive from the body-part item tree.
- **Context:** Inventory = Equipped / Carried / Possessions. Equipped maps to body regions — but bodies are modular (parts are items with `isBodyPart` + nested `contains`; HUMANOID default exists in `lib/body-damage.ts`). The paperdoll must derive its regions from the character's actual body-part tree, not a fixed slot enum.
- **Goal:** Paperdoll UI generated from the body tree; drag items between tiers; equipped items participate in damage routing (outer absorbs first — already in body-damage lib); weight/encumbrance from lbs (INV-48).
- **Files to touch:** new `components/character/Paperdoll.tsx` + tier components, inventory service (equip/carry moves), integration with `routeDamage`.
- **Invariants:** INV-55, INV-48, INV-52 (layer rule is system-level), INV-62 (possessions are links, not location).
- **Acceptance test:** humanoid character shows derived regions; equipping armor to torso makes it the outer damage layer in a test damage call; encumbrance status changes at the Clout×10 lbs threshold; a non-humanoid test body (hand-built part tree) renders correct regions with zero code changes.
- **Rollback:** revert; old inventory views remain until cutover inside this task.

### TASK T27: Death triggers end-to-end
- **Type:** build
- **Depends on:** T25, T13
- **Do with:** Fable 5 — crosses combat, economy, godheads, and UI; the emotional + economic centerpiece; expensive to get wrong.
- **Context:** Two death doors, both resolving vs Lady Death (bodyResist + Fate Die; distinct formulas per rulings r-2026-06-09): combat (current Frequency = 0) and Fated Age (age ≥ fated age at Harvest). Death = transformation: the death-split engine (built) routes KRMA per pillar rules and the character becomes a GHOST. Lady Death is a live Godhead — the event routes to her for the in-fiction beat.
- **Goal:** Trigger wiring (combat + fated-age), death-save UI inline, GM confirmation on the split (shows exact routing preview), ghost transformation applied, `entity.died` event to the dispatcher (Lady Death's handler).
- **Files to touch:** encounter/damage services (trigger), `components/` death-save + split-confirmation dialogs, `executeDeathSplit`/`transformCharacterToGhost` (built — wire), dispatcher routing.
- **Invariants:** INV-34–42 (exact routing), INV-18 (transfer), INV-57 (confirmation is a canvas dialog), Part C (this is a black-void consequence surface).
- **Acceptance test:** dev encounter: drive a character to Frequency 0 → death save fires → fail → split preview matches T14's death-split test expectations → confirm → character status GHOST, wallets moved per ledger rows, Lady Death invocation logged.
- **Rollback:** feature flag on the trigger; engine paths already exist and stay dormant.

### TASK T28: Player onboarding handoff fix
- **Type:** refactor
- **Depends on:** none
- **Do with:** Executor — a broken flow with a known dead button.
- **Context:** Players join → backstory (structured prompts) → GM builds character WITH them (no placeholder characters). The "Submit to Watcher" button in `CharacterTab.tsx` is a no-op for member-stage flows — the handoff into the wizard dies there.
- **Goal:** Backstory approval → wizard handoff works; player sees status; GM gets the notification.
- **Files to touch:** `CharacterTab.tsx` (dead onClick), backstory/campaign-member services, watcher notification surface.
- **Invariants:** INV-84, INV-85.
- **Acceptance test:** two-account dev walkthrough: player submits → GM sees submission → GM opens wizard pre-loaded with that player's backstory context.
- **Rollback:** revert.

### TASK T29: Wizard sessions D + E (traits/skills steps + crystallize)
- **Type:** build
- **Depends on:** T16, T23, T13
- **Do with:** Fable 5 — the creation flow's AI-chain heart (Kai evaluation loop, Council Router, full crystallization with KRMA debit).
- **Context:** The Entity Creation Wizard has steps 1–3 built. D adds Skills + Traits selection backed by Kai blueprint evaluation (Kai scores + prices via the Forge chain); E adds Goals + Review/Crystallize (Council Router assigns custodian godheads; crossing the crystallization line debits the GM investment through the single existing debit path).
- **Goal:** A GM can take a backstory-approved player through the full wizard to a crystallized, fully-initialized character (seed augs, Frequency, Fate Die, fated age, root/branch grants, starting traits — all landing in TKV).
- **Files to touch:** wizard step components (new D/E panels), Kai evaluation service (exists — wire loop), Council Router (new, uses godhead invocation), crystallization service (exists — INV-60/61 single path).
- **Invariants:** INV-33 (flow order), INV-59/60/61, INV-25/26, INV-07.
- **Acceptance test:** end-to-end creation in dev produces a character whose TKV matches the T16 calculator exactly; ledger shows one investment transaction at crystallization; custodian assignment recorded per goal.
- **Rollback:** wizard steps feature-flagged individually.

### TASK T30: Wizard sessions F + G (quick-create + place/retire)
- **Type:** build
- **Depends on:** T29
- **Do with:** Executor — follows the D/E patterns established by Fable; quick-create is a prompt+prefill over the same pipeline.
- **Context:** F = AI-assisted NPC speed creation (JEWL drafts a full entity from a GM one-liner; same validation pipeline, GM edits then crystallizes). G = canvas "Place Entity" gesture + retirement flow (retirement routes through Lady Death, not deletion).
- **Goal:** GM can speed-create an NPC in under a minute and place/retire entities as canvas gestures.
- **Files to touch:** quick-create dialog (uses the ONE contextual JEWL dialog per INV-75/76), canvas place gesture, retirement flow → `entity.died`-adjacent retirement event.
- **Invariants:** INV-75, INV-76, INV-57, INV-60 (spawns land in drafting zone).
- **Acceptance test:** one-liner → drafted NPC appears below the crystallization line for edit; place gesture positions it; retire moves KRMA per the retirement rules and logs the event.
- **Rollback:** revert.

## PHASE G — Godheads Act (M4/M3)

### TASK T31: Services emit lifecycle events
- **Type:** build
- **Depends on:** T27
- **Do with:** Executor — mechanical injection at an enumerated list of points. **(Handoff note: if unbuilt when Fable reaches T32, Fable does this first.)**
- **Context:** The GodHeadDispatcher exists but services never emit events, so godheads sleep.
- **Goal:** Emissions: `entity.died` (T27 wires), `entity.retired`, `goal.completed`, `goal.failed`, `goal.abandoned` (→ Et'herling per NEEDS-MIKE #8), `blueprint.published`, `blueprint.unused_for_90d` (daily sweep), `character.crystallized`, `contract.violated` (T13 emits — verify routing).
- **Files to touch:** goal service, forge service, crystallization service, a daily sweep job, dispatcher routing table.
- **Invariants:** dispatcher stays behind `GODHEAD_DISPATCHER` flag until T32 verifies behavior.
- **Acceptance test:** integration script fires each lifecycle action and asserts a dispatcher log row per event.
- **Rollback:** flag off.

### TASK T32: The M4 golden path — goal closes, Nectar lands
- **Type:** build
- **Depends on:** T31, T24, T19
- **Do with:** Fable 5 — multi-agent orchestration with KRMA consequences; the proof that Godheads play the game.
- **Context:** M4's exit criterion: player closes a goal → dispatcher fires → Et'herling (Mediation) routes to Kai → Kai prices/authors the Nectar → result returns to the GM as one coherent message → GM confirms → Nectar lands on the sheet with a working mechanical hook, KRMA attributed, every step in GodHeadActionLog.
- **Goal:** That path, live, in a dev campaign.
- **Files to touch:** Et'herling router (exists — complete), Kai evaluate/author loop (exists — complete), GM confirmation surface (godhead message → canvas), missing schema per roadmap (`GodHeadActionLog` verify/add).
- **Invariants:** INV-24 (Kai grades, no formula), INV-07 (cap check at bestowal — decline path converts to raw KRMA minus decline tax 10%), INV-77.
- **Acceptance test:** scripted session in dev campaign runs the full chain; the bestowed Nectar modifies the next relevant roll (T24); ActionLog shows every hop.
- **Rollback:** dispatcher flag.

### TASK T33: GROvine Resistance + Opportunity UI
- **Type:** build
- **Depends on:** T32
- **Do with:** Executor — display + linking UI over existing models.
- **Context:** The G/R/O loop: Goals are opposed by Resistance (concrete entities, not abstract obstacles — link entities to goals) and advanced through Opportunities (GM-triggered moments resolving to a check or KRMA spend).
- **Goal:** GM links entities as resistance (goal card shows who pushes back); opportunity events triggerable and resolvable.
- **Files to touch:** GoalCard (resistance display), resistance-assignment gesture (canvas link), Opportunity panel + trigger flow.
- **Invariants:** resistance = entities (memory: resistance-is-entities); INV-57 (linking is a canvas gesture).
- **Acceptance test:** link two entities to a goal → card lists them; trigger opportunity → resolves via skill check; all visible without GM math.
- **Rollback:** revert.

### TASK T34: Goal lifecycle + custodian UI
- **Type:** build
- **Depends on:** T32
- **Do with:** Executor — state machine + picker over existing services.
- **Context:** Goals move Active → Dormant → Completed/Failed; each goal has a custodian godhead (assigned at creation by the Council Router, changeable by GM).
- **Goal:** Lifecycle transitions in UI wired to events (T31); custodian visible/editable on the goal card.
- **Files to touch:** GoalCard, goal service transitions.
- **Invariants:** goal completion/failure MUST route through the event path (no silent state flips).
- **Acceptance test:** complete a goal from the card → T32 chain fires; custodian change persists.
- **Rollback:** revert.

## PHASE P — Production Readiness

### TASK T35: Architecture memo + deployment test (GATE for the rest of Phase P)
- **Type:** build (analysis + prototype)
- **Depends on:** none (start anytime)
- **Do with:** Fable 5 — this is the server-structure conversation Mike asked for, with a working prototype and a pricing model; every later production task hangs on its outcome.
- **Context:** Open architecture questions Mike explicitly wants discussed, not defaulted: local router-LLM on GM/player machines (the membrane + all-ages compliance architecture), STT packaging for non-dev GMs, hosting topology (SSE/audio need a persistent Node host), and per-GM cost under the $25–40/mo constraint.
- **Goal:** (1) A written memo: 2–3 topology options with real pricing (persistent host vs hybrid local; STT local-package vs cloud bridge; router-LLM staged plan), a recommendation, and the per-GM cost model with escalation metering. (2) A live small-scale test deployment: the app running end-to-end (minus GPU portrait pod) on Mike's machine exposed for one remote test user OR one rented pod, whichever the memo recommends trying first. (3) Decision meeting with Mike.
- **Files to touch:** `docs/ARCHITECTURE-MEMO-2026-07.md` (new), deploy scripts as needed.
- **Invariants:** INV-119/120 (the local-first path must remain open in whatever is chosen), feedback: ask-before-spending (pod rental needs Mike's OK).
- **Acceptance test:** memo delivered; test deployment serves a full campaign session (canvas + chat; audio if feasible) to a non-localhost client; Mike picks a topology.
- **Rollback:** n/a.

### TASK T36: Consent + age architecture
- **Type:** build
- **Depends on:** T35 (posture may shift with topology)
- **Do with:** Executor — forms/flags/gates, fully specified; legal text placeholders marked for counsel.
- **Context:** All ages play (INV-120). Registration collects DOB; campaigns carry a tone flag (adult/standard); audio requires consent surfaces.
- **Goal:** DOB at registration (existing accounts prompted on next login); campaign tone flag in settings (feeds JEWL register, T18 reads it); join-time recording-consent screen (per-campaign, versioned text, decline = joins with audio-features flagged off for that player); always-visible recording indicator on the canvas when the GM's capture is live; parental-consent stub flow for minors (email-based placeholder, counsel finalizes).
- **Files to touch:** registration flow, `CampaignSettingsForm` (tone flag), join flow, canvas header indicator, consent records model.
- **Invariants:** INV-120, INV-72 (indicator, not tap-to-record), INV-117 Law 8.
- **Acceptance test:** new registration requires DOB; minor account triggers parental stub; joining an audio campaign shows consent; indicator visible during capture; JEWL prompt (T18) receives tone+age register inputs.
- **Rollback:** revert; flags default safe.

### TASK T37: Email verification + password reset
- **Type:** build
- **Depends on:** none
- **Do with:** Executor — standard auth surface; provider lib exists (`lib/email.ts`, Resend).
- **Context:** bcrypt+session auth (no OAuth, ever — INV-90) needs the standard account-recovery surface before payments.
- **Goal:** Verify-on-register (token email), password-reset flow, rate limits on both + login.
- **Files to touch:** auth service, token models (schema may already have them — check `EmailVerificationToken`/`PasswordResetToken` from the audit), routes + minimal pages (Part C styling).
- **Invariants:** INV-90; Part B route pattern.
- **Acceptance test:** register → email token → verified flag; reset flow round-trips; 6 rapid login failures → rate-limited.
- **Rollback:** revert.

### TASK T38: Stripe in test mode
- **Type:** build
- **Depends on:** T37, T06; live keys = Mike-action
- **Do with:** Executor — well-trodden integration, test-mode only, spec below.
- **Context:** Subscription billing: checkout → webhook → drip allocation (T06 config), cancellation → campaign freeze per INV-123, PAST_DUE pauses drip.
- **Goal:** Full Stripe test-mode loop against the existing subscription service.
- **Files to touch:** replace stub checkout route, `services/subscription.ts` webhook handlers (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`), freeze hook (campaign status LOCKED, wallets preserved).
- **Invariants:** INV-17 AMENDED (allocation via config), INV-123, INV-83 (5 seats).
- **Acceptance test:** Stripe CLI test clocks: subscribe → lump lands; month tick → drip lands; payment fails → drip paused; cancel → campaigns LOCKED read-only, wallet intact.
- **Rollback:** stub route restorable; test mode only.

### TASK T39: Ledger pseudonymization (pre-Postgres)
- **Type:** refactor
- **Depends on:** T14
- **Do with:** Executor — mechanical indirection with a verification test.
- **Context:** Right-to-erasure vs append-only ledger: the ledger and Attribution DAG must reference opaque actor IDs, with PII living only in deletable tables.
- **Goal:** Audit ledger/DAG rows for direct PII (usernames, emails); introduce opaque `actorId` indirection where missing; erasure script blanks the PII table row while chain + attribution stay intact.
- **Files to touch:** ledger service (write path), any display joins, `scripts/erase-user.ts` (new).
- **Invariants:** INV-14 (chain untouched), INV-119.
- **Acceptance test:** T14 chain test still green after erasing a test user; erased user renders as "Departed Steward" in history UIs.
- **Rollback:** revert; additive indirection.

### TASK T40: Postgres migration + monitoring + backups
- **Type:** build
- **Depends on:** T35 (topology), T39
- **Do with:** Executor — scripted migration with the verification step specified.
- **Context:** SQLite → Postgres per the T35 decision; the hash-chained ledger must survive byte-identically; production needs error tracking, uptime, and tested backups.
- **Goal:** Migration script with chain verification; Sentry + uptime monitor; daily backups with a restore test.
- **Files to touch:** migration script, prisma datasource config, monitoring init, backup cron.
- **Invariants:** INV-14; C6 (chain verification is a hard gate — abort migration on mismatch).
- **Acceptance test:** migrated copy passes full ledger audit/reconcile; a thrown test error appears in Sentry; restore drill from yesterday's backup boots.
- **Rollback:** SQLite remains source of truth until the verified cutover commit.

### TASK T41: Transaction history UI
- **Type:** build
- **Depends on:** T15
- **Do with:** Executor — read-only views over existing APIs.
- **Context:** Ledger data is complete; nobody can see it. Wallet history (Watcher), character KRMA timeline (sheet), global metrics (Terminal admin).
- **Goal:** Three read-only views styled per Part C (KRMA gold accents).
- **Invariants:** INV-70 (JEWL's wallet never appears in any non-ADMIN aggregate or list).
- **Acceptance test:** each view renders fixture data; reconcile totals match the audit API.
- **Rollback:** revert.

### TASK T42: Seed audited reference data
- **Type:** build
- **Depends on:** T08
- **Do with:** Executor — transcription from NAMED audited sources only.
- **Context:** The app needs reference tables. ONLY these sources are trustworthy: `Condition_Effects_Reference.md` (post-audit working tree), `Complete_Materials_Reference.md` (verify the in-code 25-material catalog against it; the code catalog may predate the May-14 item-field corrections). **Explicitly stale — do NOT seed from:** `Weapon_Examples_Table.md`, `KRMA_Costs_Table.md` (old rates contradict INV-22/23).
- **Goal:** Conditions table seeded (drives T25); materials catalog verified/corrected; a `dataSource` note on each seeded row.
- **Invariants:** INV-46–54 (item field canon), Repository CLAUDE.md (no invented rules — transcribe only).
- **Acceptance test:** every seeded condition traces to a line in the source file; material catalog diff vs Complete_Materials_Reference reviewed and reconciled; stale tables untouched.
- **Rollback:** re-run seed (idempotent).

---

## TRIAGE SUMMARY

**Fable 5 builds now (11):** T08 (DB reset+seed) → T10, T11, T12 (fork merge+smoke) → T13 (contracts) → T17, T18 (JEWL identity+voice) → T26 (paperdoll) → T27 (death e2e) → T29 (wizard D/E) → T32 (M4 golden path; will absorb T31 if unbuilt) → T35 (architecture memo+test deploy, runs early in parallel).
**Executor queue (31):** T01–T07, T09, T14–T16, T19–T25, T28, T30, T31, T33–T34, T36–T42 — each self-contained above.
**The handoff line:** everything Fable-tagged will be DONE when Fable reports; every Executor task is specified to run without big-picture context. Cross-dependencies where the executor might stall are marked in-task (T31→T32 note).
