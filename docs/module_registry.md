# GRO.WTH Module Registry

Last updated: 2026-07-12 (T09 doc pass — 54 services, 80+ routes, all components inventoried)

## Services (Business Logic)

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| AuthService | `services/auth.ts` | Login, registration, access code redemption on signup | Prisma, auth lib, access-code service |
| CampaignService | `services/campaign.ts` | Campaign CRUD, invite code join, seat limits | Prisma, permissions |
| ContractService | `services/contracts.ts` | T13 Terminal contracts: predicate DSL evaluator, debounced post-ledger hook, human-gated penalty pipeline, immutable tier | Prisma, ledger, krma/evaluator (TKV), types/contracts |
| InventoryService | `services/inventory.ts` | T26 3-tier inventory: regions derived from body tree (INV-55), equip/unequip with layer caps (INV-52), Clout×10 encumbrance (INV-48), buildWornLayers for damage routing | Prisma, body-tree, body-damage, material, possession |
| DeathSaveService | `services/death-save.ts` | T27 Facing Death roll (FD vs Tara's chosen die, r-2026-07-11-01/-02): trait-modifier hook, restorations, fated-age strikes, pendingDeathSplit + mercy spare, dispatcher beat to Tara | Prisma, trait-modifiers, campaign-stream, godhead-dispatcher |
| CharacterService | `services/character.ts` | Character CRUD, access control | Prisma, permissions, defaults |
| BackstoryService | `services/backstory.ts` | Structured backstory submit/review | Prisma, permissions |
| AccessCodeService | `services/access-code.ts` | Code generation, validation, redemption | Prisma, permissions |
| ChangeLogService | `services/changelog.ts` | Create changelog entries with diff/coalescence (5s window), query with pagination and filters, revert with conflict detection | Prisma, changelog-utils |
| CampaignEventService | `services/campaign-event.ts` | Campaign event CRUD (dice rolls, chat, commands, game events), session management (start/end/list), auto-assigns events to active session | Prisma |
| ForgeService | `services/forge.ts` | ForgeItem CRUD (seed/root/branch/skill/item/nectar/blossom/thorn blueprints), publish/unpublish, PlayerRequest CRUD, global catalog (list + pull), Zod validation per type | Prisma, permissions |
| EntityService | `services/entity.ts` | Campaign entity listing (excludes GODHEAD), draft creation, step save/load for creation wizard | Prisma, permissions, defaults |
| EntityContextService | `services/context/entity-context.ts` | Build token-efficient context string for any entity (Character). Used by God-heads. Includes identity, attributes, goals, inventory, relationships. | Prisma |
| GoalContextService | `services/context/goal-context.ts` | Build focused context window for a goal by traversing EntityRelationship graph (2-hop max). Returns only connected entities. | Prisma, EntityContextService |
| LocationService | `services/location.ts` | Location CRUD (settlement/wilderness/dungeon/building/POI/region), GM-only create/update/delete, Zod validation | Prisma, permissions |
| CampaignItemService | `services/campaign-item.ts` | World item CRUD (weapon/armor/accessory/consumable/tool/artifact/prima_materia/misc), holder/location assignment, drag-and-drop inventory transfer via holderId, GM-only | Prisma, permissions |
| EncounterService | `services/encounter.ts` | Encounter CRUD (combat/social/exploration/puzzle/event), round/phase tracking, GM-only | Prisma, permissions |
| KRMA Ledger | `services/krma/ledger.ts` | Core transaction engine — ALL KRMA mutations. Append-only, checksummed, idempotent, atomic. Single/batch execution. | Prisma, krma types |
| KRMA Wallet | `services/krma/wallet.ts` | Wallet CRUD (user/campaign/character/system), fund/defund campaigns, transaction history, global metrics | Prisma, ledger, permissions |
| KRMA Evaluator | `services/krma/evaluator.ts` | Deterministic KV calculator (TKV breakdown by pillar, skills, bodyResist at 2:1, fate die pricing 5/10/20/40/80, trait guardrails, root age floor validation). Death split calculator (component-level routing by pillar/governor, bodyResist routes with Body). Versioned + hashable. | krma types, growth types |
| KRMA Death Split | `services/krma/death-split.ts` | Orchestrates multi-transaction death process: Body→GM, Soul→50/50, Spirit→player, Frequency→Lady Death. Atomic batch. | ledger, wallet, evaluator |
| KRMA Reconciliation | `services/krma/reconciliation.ts` | Balance reconciliation, global supply invariant check, checksum chain verification, full audit | Prisma, ledger |
| KRMA Crystallization | `services/krma/crystallization.ts` | Crystallize/dissolve entities across KRMA line. Ledger stored as campaign events. Prevents double-crystallization. Pool tracking | Prisma, permissions |
| DiceService | `services/dice.ts` | Single entry point for all dice rolling. Skilled/unskilled checks, death saves, contested rolls, quick rolls, custom rolls. Integrates crypto RNG, Godhead injection, event bus | dice lib, dice-events, dice-injection |
| DiceInjectionRegistry | `services/dice-injection.ts` | Godhead override system. Register/remove/apply injections that silently modify die results. Filter by character/source/skill/next-roll. Override types: set values, ensure success/failure, clamp, hidden modifier. Audit-logged | dice types |
| ProfileService | `services/profile.ts` | Get/update trailblazer profile, get/update watcher profile (WATCHER+ only), public profile view (strips topicsToAvoid) | Prisma, permissions |
| HubService | `services/hub.ts` | List LISTED campaigns (public, filterable), campaign listing detail (public), update listing (GM-only), apply to campaign (auth, creates member+application atomically with profile snapshot) | Prisma, permissions |
| GoalService | `services/goal.ts` | Goal CRUD + lifecycle (create/update/abandon/complete/fail/dormant/reactivate — complete+fail GM- or system-callable, always via dispatcher events, T34), Zod schemas, 5-active cap (dormant exempt), custodian assignment + GM setCustodian override, opportunity declare/resolve (Goal.opportunities JSON, T33) | Prisma, permissions, godhead-dispatcher |
| GoalResistanceService | `services/goal-resistance.ts` | Entity-based resistance management. GM assigns entities (NPCs, creatures, locations) as resistance to goals via EntityRelationship edges ('resisted_by'). List/assign/remove resistance entities. | Prisma, permissions |
| GoalCustodianService | `services/goal-custodian.ts` | AI-driven God-head custodian assignment. Reads goal + context, matches to God-head domain, assigns custodian to goal | GoalContextService, Claude provider, GoalService |
| ForgeAuthoringService | `services/forge-authoring.ts` | Kai AI authoring pipeline. GM provides name + narrative description → Kai (Claude) generates mechanical stats + KV → GM reviews and confirms. Supports all forge types (seed/root/branch/skill/item/traits). Confirm flow persists as draft ForgeItem | Claude provider, ForgeService schemas, Prisma, permissions |
| ApplicationService | `services/application.ts` | Campaign application CRUD: submit structured responses, GM approve/deny/request-revision, AI-expand responses, profile snapshot at submit time | Prisma, permissions |
| BurnService | `services/burn.ts` | Permanent KRMA removal from the metaverse. Character burn (voluntary, costs KRMA), BurnLedger total tracking, hard cap enforcement (5B) | ledger, wallet, Prisma |
| CharacterAttributeService | `services/character-attribute.ts` | Applies attribute-pool changes (spend/restore/setLevel) via character-actions pure functions, persists, returns FieldChange[] for changelog | character-actions, character.ts, Prisma |
| CharacterGrantsService | `services/character-grants.ts` | Applies Seed/Root/Branch ForgeItem data onto a character's GrowthCharacter blob at assignMechanics time | ForgeService, Prisma |
| AdvancementService | `services/advancement.ts` | Pure trainable→upgrade engine (r-2026-07-15-01): mark attr/skill trainable on failed checks, listTrainables grouped by pillar, applyAdvancements (all-or-nothing, spends max Freq, TKV-neutral, no ledger), clearTrainables | character-actions, types/growth |
| AdvancementOpsService | `services/advancement-ops.ts` | DB wrapper for advancement: permission check (canEditCharacter), load→applyAdvancements→save, broadcasts character_update | advancement, permissions, campaign-stream, Prisma |
| CharacterLocationService | `services/character-location.ts` | Moves a character between Locations by replacing their located_at EntityRelationship edges in a single transaction | Prisma, EntityRelationship |
| DamageService | `services/damage.ts` | Applies typed damage to character body anatomy via body-container cascade (lib/body-damage.ts), triggers death save at 0 Frequency / vital destruction | body-damage, frequency, Prisma |
| DayaAffectService | `services/daya-affect.ts` | DAYA persona harness — event-driven mood vector (morale/stress/grief) for AI-controlled characters. Drives move ONLY on real game events (frequency loss, death saves, goal outcomes, advancement, dream-tick residue), decay toward baseline on the campaign clock. `applyDispositionEvent` create-if-missing upserts the character's DayaEntity before upserting DayaAffect (1:1 off DayaEntity, not Character), writes a first-person HistoryEntry beat. `dream_consolidation` event kind (dream-tick's own affect drift, pre-computed and clamped by `daya/dream.ts`) threads through the same decay/history pipeline as every other event. `getDisposition`/`renderDispositionLine` feed JEWL prompt assembly (context-assembler, npc-speak). Absorbs the prototype `CharacterDisposition` scaffolding (WP1, 2026-07-28) | history, Prisma |
| EconomyConfigService | `services/economy-config.ts` | Read/write ADMIN-tunable constants (EconomyConfig KV store): drip curve, mistakeBounty, magicCasting (manaPerKrma default 4, systemEngagementDR default 50 — r-2026-07-22-02). Falls back to code defaults when key absent | Prisma, subscription-drip |
| MagicCastService | `services/magic-cast.ts` | Pure cast-resolution engine (r-2026-07-22-01): computeCastPlan (weakest-school die, woven associated-skill die, DR system-review flag) + resolveCast (FD+school+associated+mana vs DR; wild-fail → Monkey Paw + school trainable mark). No db, no randomness | types/growth, dice-utils |
| MagicCastOpsService | `services/magic-cast-ops.ts` | DB/rolling wrapper for casting: permission check, reads magicCasting config, previewCast (plan only, no roll — JEWL coax loop) + executeCast (rolls FD [seed baseFateDie, d6 fallback] + school/associated dice via lib/dice, resolves, deducts mana from magic.mana + persists, broadcasts character_update + cast_result SSE). Canon-silent defaults flagged in NEEDS-MIKE: mana consumed on fail; DR≥threshold flags review, doesn't block. Trainable mark reported, not persisted (storage awaits ruling) | magic-cast, economy-config, dice, permissions, campaign-stream, Prisma |
| SpellGrantService | `services/spell-grant.ts` | Teaches an authored ForgeItem('spell') to a character: enforces mechanics completeness (dr+manaCost+kv), derives pillar from primary school, requiresSystemReview from config, writes magic.<pillar>.knownSpells, dedupes, broadcasts. Ledger (r-2026-07-23-04): spell KV campaign→character LOCK SPELL_LEARNED + weave fee campaign→Kai FLUID SPELL_WEAVE_FEE (magicCasting.weaveFeeRate). GM/ADMIN-only | forge, economy-config, krma/ledger, krma/wallet, campaign-stream, Prisma |
| ManaService | `services/mana.ts` | Mana lifecycle (r-2026-07-23-02/-05): adjustMana (GM/ADMIN narrative gain/drain, clamps [0,max]); recordCastResidue (spent mana lingers with the spell); sweepManaResidues (decay over ~dr cycles on clock advance; bookkeeping-only — KRMA custody pending ruling). ManaResidue model | Prisma, campaign-stream |
| EntityContentsService | `services/entity-contents.ts` | Reads/writes located_at EntityRelationship rows to anchor child entities (Locations, Characters, CampaignItems) inside a parent entity | Prisma |
| EntityQuickGenService | `services/entity-quick-gen.ts` | AI-assisted NPC speed creation: expands a freeform prompt into a wizard-shaped EntityDraft via Claude | Claude provider, Prisma |
| FrequencyService | `services/frequency.ts` | Deplete Frequency (current pool only). Spend-credits-KRMA op RETIRED (r-2026-07-19-01 — upgrades go through advancement; no character→wallet conversion except post-death spirit-package breakdown). Triggers death save when hitting 0 | death-save, Prisma |
| GodHeadAdminService | `services/godhead-admin.ts` | Read/update AI persona rows, surface metrics (invocation count, token cost, wallet balance) without loading full memory | Prisma, permissions |
| GodHeadDispatcher | `services/godhead-dispatcher.ts` | Event bus for godhead invocations. Services emit named events (goal.completed, blueprint.published, etc.); dispatcher consults routing table and triggers godhead agent runs | godhead agent, Prisma, GODHEAD_DISPATCHER env flag |
| HistoryService | `services/history.ts` | Writes and queries HistoryEntry rows — per-canvas-object perspective-based history timestamped in meta cycles. One event → N perspective entries sharing eventGroupId | Prisma |
| InventoryService | `services/inventory.ts` | T26 3-tier inventory: regions derived from body tree (INV-55), equip/unequip with layer caps (INV-52), Clout×10 encumbrance (INV-48), buildWornLayers for damage routing | Prisma, body-tree, body-damage, material, possession |
| JewlMistakeService | `services/jewl-mistake.ts` | GM flags a JEWL CopilotMessage as wrong (records a claim, NO payout). JEWL resolves via `acceptMistake` (bounty pays JEWL→GM) or `disputeMistake` (invokes Et'herling to adjudicate). `payMistakeBounty` = single transfer path. Feature-flag `MISTAKE_BOUNTY_ENABLED`; amounts from EconomyConfig `mistakeBounty` | ledger, wallet, economy-config, godhead/agent, Prisma |
| NectarBestowService | `services/nectar-bestowal.ts` | T32 golden path landing half: GM confirms a godhead's structured Nectar proposal → trait lands on character with rollModifiers, KRMA transfers Kai→character (GROVINE_NECTAR) | ledger, ForgeService, Prisma |
| PossessionService | `services/possession.ts` | Reads/writes owns EntityRelationship rows linking a character to entities they possess (locations, items, goals, etc.) | Prisma |
| SessionRewardService | `services/session-reward.ts` | ADMIN-triggered session-end KRMA rewards distributed to participating characters | ledger, Prisma, permissions |
| SttVocabularyService | `services/stt-vocabulary.ts` | Builds per-campaign proper-noun vocabulary string for Whisper STT to bias recognition of unusual names (Val, Et'herling, etc.) | Prisma |
| SubscriptionService | `services/subscription.ts` | Manages GM Subscription lifecycle (subscribe/cancel) and runs monthly KRMA drip schedule | subscription-drip, ledger, Prisma |
| SubscriptionDripService | `services/subscription-drip.ts` | Anti-frontloading bell-curve KRMA drip calculator. Computes how many drips are owed and how much each is worth based on month index | ledger, Prisma |
| TimeService | `services/time.ts` | Timescale CRUD, campaign clock get/advance/set, ensureDefaultTimescale, resolveTimescaleForLocation (walks located_at upward), characterDualAge. Clock advance/set triggers sweepExpiredBlossoms (T23) + blossom_expired history | Prisma, blossom |
| TraitModifierService | `services/trait-modifiers.ts` | Sums roll-affecting effects from Nectars/Blossoms/Thorns into a single bonus for skill checks and death saves | Prisma, growth types |

## Infrastructure (lib/)

| Module | File | Purpose |
|--------|------|---------|
| Auth | `lib/auth.ts` | Password hashing, session management, cookie handling, typed auth/forbidden errors |
| Database | `lib/db.ts` | Prisma client singleton with LibSQL adapter |
| Permissions | `lib/permissions.ts` | Reusable role/ownership checks |
| Errors | `lib/errors.ts` | Typed error classes (AppError, ValidationError, etc.) |
| API Utils | `lib/api.ts` | Error-to-HTTP-response conversion |
| Defaults | `lib/defaults.ts` | Default GrowthCharacter factory |
| ChangeLog Utils | `lib/changelog-utils.ts` | Pure diff/summary utilities: diffObjects (deep object comparison), inferCategory (maps changed fields to changelog categories), summarizeChanges (generates human-readable descriptions from FieldChange arrays) |
| Dice | `lib/dice.ts` | Crypto-RNG dice primitives: rollDie (rejection sampling), rollDice (batch), rollSkillDie, rollFateDie, skilledCheck, unskilledCheck. Uses crypto.getRandomValues() for uniform distribution |
| Dice Events | `lib/dice-events.ts` | Pub/sub event bus for roll results. Subscribers: terminal log, 3D overlay, roll history. DiceService emits after every roll |
| Character Actions | `lib/character-actions.ts` | Pure functions for character state mutations: attribute CRUD (update/spend/restore/setLevel), skill CRUD (add/remove/updateLevel/update with governors), rest (restShort/restLong). Returns { character, changes[] } for audit trail |
| Terminal Commands | `lib/terminal-commands.ts` | Command parser + executor for Campaign Terminal: /roll, /check, /deathsave, /spend, /restore, /rest, /session, /inject. /check and /deathsave use DiceService, /rest calls campaign REST API, /inject manages Godhead overrides |
| KV Calculator | `lib/kv-calculator.ts` | Client-side KRMA Value calculation utilities for character/entity valuation |

## Components

| Group | Components | Purpose |
|-------|-----------|---------|
| Character Display | CharacterSheet, AttributeBlock, MagicSection, SkillsSection, VitalsSection, InventorySection | Full character sheet rendering |
| Character Display | Paperdoll | T26 3-tier paperdoll on the character sheet — equipped/carried/possessions with body-derived regions |
| Character Display | MechanicsPanel | GM panel for assigning Seed/Root/Branch mechanics to a character |
| Character Display | FrequencyOpsPanel | Frequency spend/restore UI (per-character sub-panel) |
| Character Display | CharacterTab | Tab wrapper for character sheet in campaign context |
| Character Display | CreationReviewBanner | Banner shown on DRAFT characters prompting GM to review/crystallize |
| Character Display | PortraitPanel | Portrait display and generation trigger (shows current portrait, generate button) |
| Persona Harness | DayaTestCanvas (`components/daya/DayaTestCanvas.tsx`) | WP12 test canvas — the create-and-converse flow at `/campaign/[id]/daya` (server page gates GM/ADMIN via `canManageCampaign`): pick a Character, wrap/author/seed-vines/seed-memories/enable, converse 1:1, run one time-skip. Thin — every control is a plain fetch against `/api/characters/[id]/daya/*`. WP14: fires the `daya/warm` trigger on mount/character-select and polls it while `'warming'`; shows an in-world "she's stirring, coming awake…" loader (with a small secondary-line technical hint) instead of infra language, both before sending and while a reply is in flight after a cold start; the converse chat log now also handles a `'warming'` status distinctly from `'core_offline'` |
| Character Identity Lock | IdentityLockWizard | Full identity-lock wizard: front discovery → angle steps → persona lock → finetune |
| Character Identity Lock | FrontLockPanel, FaceRefinementPanel, FaceCropModal | Sub-steps for front-image selection, crop, and refinement |
| Character Identity Lock | identity-lock/steps/* | Individual wizard step components (FrontDiscovery, AngleSteps, BodyDiscovery, PersonaLock, CustomPrompt) |
| Death | DeathSaveDialog | Black-void Mode 2 GM takeover: die ladder, DO NOT REAP button, dramatic result reveal, SPARE THEM / OPEN THE SPLIT |
| Death | DeathSplitModal, SplitConfirmDialog | Death split manifest preview (exact KRMA routing) and two-step GM confirmation → GHOST |
| Contracts (T13) | canvas/ContractsDock | ADMIN-only overlay on the `__PRIME__` canvas: contract cards, evaluate, penalty confirm/reject, JSON-forward create dialog |
| Character Builder | CharacterBuilder | 4-step wizard (Identity → Origin → Attributes → Review) |
| Entity Wizard | entity/EntityCreationWizard | 8-step entity creation wizard (wizard crystallizes on Review — T29, INV-59/60/61) |
| Canvas | RelationsCanvas | SVG infinite canvas with pan/zoom, node dragging, KRMA Line, viewport culling, folder groups, localStorage persistence |
| Canvas | FolderGroup | Card grouping system — visual bounding box, drag-all-together, party type with REST button |
| Canvas | RestPanel | GM rest UI — short/long toggle, character checkboxes with warnings (Overwhelmed/F=0), apply + results. Long Rest: per-character trainable-upgrade picker grouped by pillar, Frequency-budget-guarded (r-2026-07-15-01) |
| Canvas Cards | CharacterCard | Expanded/compact character sheet on canvas, dynamic name sizing, drag support |
| Canvas Cards | InventoryCard | Draggable inventory sub-panel showing real CampaignItems (HeldItemData). Weight level display, carry capacity tracking, condition/material/damage info, equip toggle, remove-from-inventory button, drop-target highlighting |
| Canvas Cards | PossessionsCard | Possession relationships sub-panel (entities owned via 'owns' EntityRelationship edges) |
| Canvas Cards | SkillsCard | Skill sub-panel with governor badges, +/- level, trainable badge (r-2026-07-15-01), Roll button (GM: inline DR row → one-click server check; else terminal prefill), Request button (player), forge-picker add form (GM). No categories or combat flags |
| Canvas Cards | LocationCard | Expandable location card on canvas. Compact (280px) and expanded (480px) views. Shows description, tech/wealth/danger levels, features, ley lines, tags |
| Canvas Cards | WorldItemCard | Expandable world item card on canvas. Compact (280px) and expanded (420px) views. Shows damage (P:S:H/D\\C:B:E), armor resistance/layer/coverage, prima materia, material modifiers, weapon properties, weight labels, condition, GM notes. Compact view shows material + damage/resist summary |
| Canvas Cards | GROvinePanel | GROvine management sub-panel for characters. Add/complete/fail/abandon GRO.vines, G/R/O detail view, capacity tracking |
| Canvas Cards | VitalsCard | Character vitals sub-panel on canvas — body part grid, damage tracking, conditions |
| Canvas Cards | TraitsCard | Character traits sub-panel — Nectars (permanent), Blossoms (temporary), Thorns (permanent negative). T23: INV-07 cap block (FD value, blossoms exempt), bearer-agnostic linter warning, blossom duration field + ⏳ expiry chip |
| Canvas Cards | MagicCard | Character magic sub-panel — mercy/severity/balance spell display |
| Canvas Cards | BackstoryCard | Character backstory sub-panel — structured prompt responses, narrative view |
| Canvas Cards | HarvestCard | Harvest log sub-panel — GROvine completion history across characters |
| Canvas Cards | GoalCard | GRO.vines sub-panel (MOUNTED as 'goals' character panel, T33/T34) — create, lifecycle buttons (Complete/Fail/Sleep/Reactivate/Abandon via /transition), DORMANT filter, GM-editable custodian (godhead picker), resistance add/remove (entity picker), opportunity declare + resolve (SEIZED/MISSED via check|krma|narrative), milestones, JEWL observations |
| Canvas | CampaignCanvas | Campaign page wrapper that loads characters, locations, items and renders RelationsCanvas with tabs (Relations/Forge/Essence/Encounters) |
| Change Log | ChangeLogPanel | (Legacy — absorbed into Campaign Terminal) Bottom overlay panel, retained as reference |
| Terminal | CampaignTerminal | Unified campaign activity feed — merges changelog + campaign events. Resizable bottom overlay, session grouping, filter toggles, auto-poll (5s). Replaces ChangeLogPanel |
| Terminal | TerminalEventRow | Renders one terminal event — dispatches by type (changelog, dice_roll, chat, command, ai_message, game_event) with distinct styling |
| Terminal | CommandInput | Command input bar with history (up/down arrows), auto-submit on Enter, imperative prefill via ref |
| Terminal | CopilotChat | JEWL copilot chat panel embedded in campaign terminal — sends messages, displays streaming responses |
| Forge | forge/ForgePanel | GM design workshop — type filter, full item builder: material combination, weapon/armor/prima-materia fields, publish/unpublish/delete, pending request queue |
| Forge | forge/ForgeWorkshop | Kai AI authoring panel: GM describes in prose → Kai generates stats → GM confirms → ForgeItem draft |
| GodHead | godhead/GodHeadMessagesPanel | GM panel for godhead ↔ GM messages: Nectar proposal cards with confirm/decline, unread badge |
| GodHead | character/GodheadPersonaPanel | Per-character godhead settings: aiActionMode toggle, model override, system prompt edit |
| JEWL / Copilot | copilot/JewlChip | JEWL as the campaign OS overlay (no corner chip). Summoned by right-click ANYWHERE in a campaign page — he materializes AT the click point in a `^v^v`-chrome panel (CtxMenuBorder/CtxMenuScanlines, Inknut Antiqua title) seeded with the clicked subject (`[data-jewl-subject]` ancestor, canvas world coords, or a card/folder menu entry via the `jewl:open` CustomEvent `{seed,x,y}`); dismissed by click-away or Esc; "/" and Ctrl-K summon at the fallback corner. A more specific contextual menu preventDefaults its own right-click and wins. Posts [ui] navigation breadcrumbs to /api/campaigns/[id]/ui-activity on surface changes, and while closed runs a slow (15s) history poll so a new JEWL reply (e.g. a classifier `proact`) BURSTS THROUGH — the panel opens itself and speaks. Audio recorder + mute + TTS unchanged (header controls) |
| Time | time/CampaignClock | Campaign clock chip in canvas header: presented date + holiday + cycle count, GM advance popover, Calendar & Timescale editor |
| Tapestry | tapestry/TapestryTab, tapestry/EntitiesPanel | Entity list/management tab (Tapestry view — alternate to canvas for entity management) |
| Application | application/PlayerApplicationForm | Structured application form for hub-apply flow (renders applicationTemplate prompts) |
| Campaign | CampaignCreator, JoinCampaign | Campaign creation with world context, invite code join |
| Campaign | campaign/CampaignSettingsForm | GM campaign settings form (listing, requiredFields, maxTrailblazers, AI settings) |
| Campaign | campaign/EffortWagerModal | Player effort wager modal during multi-step skill check (SSE-driven) |
| Backstory | BackstoryEditor, BackstoryReview | Structured prompt editor, GM review interface |
| Auth | AuthForm, RedeemCode | Login/register with access code, post-registration upgrade |
| Billing | billing/SubscribeForm | GM subscription purchase form (stub Stripe checkout flow) |
| Hub | hub/CampaignCard, hub/HubApplyForm, hub/HubFilters, hub/InterestButton | EŶ∃tehrNET hub — campaign browsing cards, apply form, filter controls, interest button |
| Profile | profile/ProfileEditForm, profile/ProfileSummary, profile/WatcherProfileForm | Trailblazer and Watcher profile edit + display |
| KRMA | krma/TransactionHistory | Transaction history display component (paginated, filterable) |
| 3D Dice | DiceOverlay, DiceOverlayLoader, DiceResultBar, DiceToggle | Full 3D dice rolling visualization. Three.js + Cannon-es physics. Lazy-loaded via next/dynamic. Mounted in root layout. Auto-subscribes to DiceService events. Snap-to-result after physics settle. Death save dramatic effects. Toggle ON/OFF via localStorage |
| UI | ComplexTooltip | 500ms lock-on-hover tooltip with nested tooltip support via createPortal |
| UI | ConfirmDialog, Modal, ContextMenu | Reusable dialog/modal primitives and right-click context menu |
| Branding | GrowthLogo | Canonical logo rendering, scalable via `scale` prop. DO NOT modify without Mike's approval |
| Branding | GlitchText | Glitch text effect component for reality layer transitions |
| Branding | EyetehrnetLogo | EŶ∃tehrNET hub logo component |
| Layout | DashboardShell | Role-aware page wrapper with header |

## Types

| File | Contents |
|------|----------|
| `types/growth.ts` | GrowthCharacter, GrowthAttributes, GrowthConditions, GrowthCreation, GrowthSkill (with SkillGovernor[], no categories/combat flag), GrowthMagic, GrowthTrait, GROvine, GrowthFear, GrowthVitals, GrowthInventory, SKILL_GOVERNORS, PILLARS constant. Note: GrowthLevels (WTH) removed 2026-04-05; characters use fatedAge instead |
| `types/krma.ts` | WalletType, KrmaState, ActorType, TransactionReason (30+ codes), genesis constants (supply, distribution, burn cap), KV evaluator constants, pillar classification helpers, TKVBreakdown, DeathSplitManifest, WalletSummary, TransactionRecord, ReconciliationReport |
| `types/changelog.ts` | ChangeActor (player, gm, ai_copilot, system), ChangeCategory, FieldChange (field/oldValue/newValue), ChangeLogEntry (full DB record type), query/create/revert input types |
| `types/terminal.ts` | TerminalEvent (unified event type), TerminalEventType, TerminalPayload (discriminated union), payload types (ChangeLogPayload, DiceRollPayload, ChatPayload, CommandPayload, AIMessagePayload, GameEventPayload), GameSessionInfo, TerminalFilter |
| `types/dice.ts` | DieType, DieColor, RollSource (discriminated union — 10 source types), DieSpec, RollRequest, DieOutcome, RollResult, ContestedRollResult, InjectionFilter, InjectionOverride, DiceInjection, legacy compat types |
| `types/location.ts` | LocationType (settlement/wilderness/dungeon/building/POI/region), Location fields, create/update input types |
| `types/item.ts` | ItemType, WorldItem fields, damage/armor/material types, HeldItemData (bridge type for inventory display) |
| `types/material.ts` | Material system: ResistType (soft/hard), MaterialMod union type, Material interface, weight level labels, condition labels, armor layer rules |
| `lib/materials.ts` | Material catalog (25+ materials: Linen→Dragonscale), getMaterial(), combineMaterials(), getAvailableMaterials() |
| `types/encounter.ts` | EncounterType (combat/social/exploration/puzzle/event), EncounterPhase (intention/resolution/impact), Encounter fields, participant/round tracking types |
| `types/crystallization.ts` | CrystallizationEntry, CrystallizationLedger, crystallize/dissolve request/response types |

## Hooks

| Hook | File | Purpose |
|------|------|---------|
| useDiceEvents | `hooks/useDiceEvents.ts` | Subscribe to dice roll events from DiceService event bus |
| useDiceQueue | `hooks/useDiceEvents.ts` | Accumulate roll results in a queue for sequential 3D animation |
| useCampaignStream | `hooks/useCampaignStream.ts` | SSE connection to campaign stream. Provides: connection status, connected users, typed event subscriptions via `on()` |

## AI — JEWL Copilot (ai/copilot/)

| Module | File | Purpose |
|--------|------|---------|
| CopilotService | `ai/copilot/copilot-service.ts` | Main JEWL inference dispatcher: builds context, selects tools, streams response to campaign |
| Classifier | `ai/copilot/classifier.ts` | Haiku-powered no-wake-word intent classifier. Routes to CopilotService (Sonnet) only when GM/player input warrants; idle audio dropped |
| Runtime | `ai/copilot/runtime.ts` | Claude API call wrapper with retry, streaming, tool-use loop |
| ContextAssembler | `ai/copilot/context-assembler.ts` | `buildTableState` — injects TABLE STATE block: all non-draft character attributes, conditions, traits + rollModifiers, held/equipped items. Soft cap 15 characters |
| CreateDialog | `ai/copilot/create-dialog.ts` | JEWL entity/location creation dialog handler (new + edit modes) |
| FormSuggest | `ai/copilot/form-suggest.ts` | AI prefills form fields from freeform prose |
| JewlIdentity | `ai/copilot/jewl-identity.ts` | Name masking: serializes JEWL as "Copilot" to players; wallet hidden |
| RulesSearch | `ai/copilot/rules-search.ts` | Vector/text search over game rules for JEWL context injection |
| TimeAwareness | `ai/copilot/time-awareness.ts` | Injects current campaign clock and timescale context into JEWL's system context |
| JEWL Tools | `ai/copilot/tools/` | 25 tool files: actors (read actor state), attribute-set, cast (preview_cast + resolve_cast — the casting co-pilot, r-2026-07-22-01), condition, damage, forge-blueprint, list-canvas-characters, memory, mistake-corpus, move-character, npc-speak, place-on-canvas, remove-from-canvas, time, time-metrics; plus the 7 WP11 persona-harness observation tools (`daya-ledger-read`, `daya-affect-read`, `daya-sheet-diff`, `daya-routing-log`, `daya-world-inspect`, `daya-pov-view`, `daya-recall-probe`) and the 2 WP12 authoring tools (`daya-author-entity`, `daya-seed-memory` — see below); plus index + registry + types |
| Persona-harness observation tools (WP11) | `ai/copilot/tools/daya-*.ts` | GM/ADMIN-only (`isWatcherOrAbove`), READ-ONLY inspection tools over the persona-harness state (Addendum C — no standalone debug console, JEWL's own tool surface IS the console). A non-GM/ADMIN actor gets `{revealed:false}` from every one of them, mirroring the JEWL-identity/wallet-private masking convention. None ever upsert a DayaEntity or write memory/affect/believed-sheet content. `daya-ledger-read.ts`: `daya_ledger_read` — raw DayaMemoryEntry rows for a characterId (content, source, cycle, valence/arousal/salience, classification, clusterId), filterable by source/sinceCycle/minSalience/limit. `daya-affect-read.ts`: `daya_affect_read` — current DayaAffect vector + `renderDispositionLine` + recent affect-moving HistoryEntry beats. `daya-sheet-diff.ts`: `daya_sheet_diff` — True Sheet (Character.data) vs Believed Sheet (DayaBelievedSheet.data, `pool.<attribute>` convention) per `SKILL_GOVERNORS` attribute, plus introspection + bias profile; reads DayaBelievedSheet directly rather than through `renderer.ts`'s upserting `getBelievedValue()`. `daya-routing-log.ts`: `daya_routing_log` — DayaModelCall rows (tier/subsystem/model/tokens/usd/sanitized/rationale) + a cost-per-entity-hour rollup (`prisma.aggregate`) + `tierAvailability()`. `daya-world-inspect.ts`: `daya_world_inspect` — live WorldFact rows for `ctx.campaignId`, optional subjectKey PREFIX filter (`currentFacts()` has no prefix mode, so this filters client-side). `daya-pov-view.ts`: `daya_pov_view` — invokes `daya/renderer.ts`'s `render()` as `asObserver` ('entity' | 'terminal' | another characterId); dry by construction (`render()` never calls `applyRevision()`) and asserts it live via a DayaBelievedSheet before/after snapshot compare. `daya-recall-probe.ts`: `daya_recall_probe` — a non-ingesting twin of `daya/recall.ts`'s `recall()`: re-runs the same scoring/gating math via its exported pure primitives (`scoreCandidate`, `wisdomThreshold`, `wisdomBudget`, `witPasses`, seeded template pick) against a plain memory read, deliberately skipping recall's rehearsal-salience-touch and failed-recall self-ingest writes | model-client, entity types, renderer, recall, mechanics/thorns, world-ledger, services/daya-affect, services/history, Prisma |
| Persona-harness authoring tools (WP12) | `ai/copilot/tools/daya-author-entity.ts`, `daya-seed-memory.ts` | GM/ADMIN-only (`isWatcherOrAbove`), MUTATING tools — the "prefer a JEWL tool over a bespoke form" surface (Addendum C / AI-forward-creation) for authoring a persona-harness entity conversationally. Both are thin wrappers over `daya/authoring.ts`; a non-GM/ADMIN actor gets an `{ok:false}` refusal. `daya-author-entity.ts`: `daya_author_entity` — wraps a Character as a DAYA entity on first call (idempotent), then applies whatever authoring fields were supplied (introspection, voice, bias, identityNarrative, voiceNotes); callable again anytime to tune (spec §8: nothing here is one-shot). `daya-seed-memory.ts`: `daya_seed_memory` — writes 1-20 seeded DayaMemoryEntry rows in one call; all-or-nothing sealLint check, one mechanical-vocabulary hit anywhere in the batch rejects the whole call | daya/authoring |

## AI — JEWL Prompt System (T18)

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| System prompts | `ai/copilot/prompts/system/{v1,v2}.ts` | Versioned personality prompts. v2 = the 15 behavioral laws from JEWL_Golden_Voice_Dataset_Seed.md; v1 = frozen pre-T18 rollback | — |
| Prompt builder | `ai/copilot/prompts/system/index.ts` | Version selection (`JEWL_PROMPT_VERSION`), register injection (tone/age, safe defaults until T36), `formatToolErrorAsRupture` (INV-118) | v1, v2 |
| Prompt regression | `scripts/test-jewl-prompt.ts` → `docs/jewl-prompt-regression.md` | Four live probes (compliment/jailbreak/rupture/player-routing) through the real dispatch pipeline | runtime |

## AI — GodHead Agent Runtime (src/godhead/)

| Module | File | Purpose |
|--------|------|---------|
| GodHead Agent | `godhead/agent.ts` | Agentic tool-use loop for godhead invocations: loads persona, runs Claude with the godhead's tool registry, logs every hop to GodHeadActionLog |
| Tools Registry | `godhead/tools/registry.ts` | Maps tool names to implementations; godheads get domain-filtered subsets |
| adopt-goal | `godhead/tools/adopt-goal.ts` | Assign a goal's custodianId to this godhead |
| decay-blueprint | `godhead/tools/decay-blueprint.ts` | Mark a ForgeItem as FLAGGED/DISSOLVING (Lady Death domain) |
| draft-blueprint | `godhead/tools/draft-blueprint.ts` | Create a ForgeItem draft proposal (Kai domain) |
| evaluate-blueprint | `godhead/tools/evaluate-blueprint.ts` | Score a blueprint's karmicValue and set evaluatedAt (Kai) |
| list-goals | `godhead/tools/list-goals.ts` | Query goals by status/campaign for custodian assignment |
| process-death | `godhead/tools/process-death.ts` | Tara's post-death-save action (confirm/spare) |
| propose-nectar-bestowal | `godhead/tools/propose-nectar-bestowal.ts` | Land a structured Nectar proposal in godhead→GM channel |
| propose-resistance | `godhead/tools/propose-resistance.ts` | Send GM a resistance entity suggestion for a goal |
| query-relationships | `godhead/tools/query-relationships.ts` | Graph-walk EntityRelationship edges for context |
| read-blueprint / read-entity / read-goal | `godhead/tools/read-*.ts` | Read-only context tools |
| read-my-memory / write-my-memory | `godhead/tools/read-my-memory.ts`, `write-my-memory.ts` | GodHeadMemory key-value persistence per godhead |
| read-my-wallet / read-wallet | `godhead/tools/read-*-wallet.ts` | Wallet balance reads |
| release-goal | `godhead/tools/release-goal.ts` | Remove custodianId from a goal |
| route-to-godhead | `godhead/tools/route-to-godhead.ts` | Et'herling routing tool: maps event to target godhead by name/alias, dispatches invocation |
| rule-jewl-mistake | `godhead/tools/rule-jewl-mistake.ts` | Et'herling adjudicates a disputed JEWL mistake flag: `upheld` pays the bounty (JEWL→GM via payMistakeBounty), `overturned` pays nothing; row → resolved (T19) |
| search-blueprints | `godhead/tools/search-blueprints.ts` | Search ForgeItem catalog by name/type/tags |
| send-message-to-gm | `godhead/tools/send-message-to-gm.ts` | Write a GodHeadMessage (GODHEAD_TO_GM direction) |
| transfer-krma | `godhead/tools/transfer-krma.ts` | Executes a KRMA transfer through the ledger (godhead as actor) |

## AI — Portrait Pipeline

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| PortraitTypes | `ai/portraits/types.ts` | All interfaces: PortraitInput, PersonaLock, provider types, stub pipeline schemas | — |
| StyleConfig | `ai/portraits/style-config.ts` | Style bible prompt, negative prompts (4 layers), campaign theme modifiers | types |
| PromptBuilder | `ai/portraits/prompt-builder.ts` | Character data → structured prompt (7 visual weight tiers: identity, body, equipment, status, narrative, traits, environment) | types, style-config |
| CharacterAdapter | `ai/portraits/character-adapter.ts` | Prisma Character + GrowthCharacter JSON → flat PortraitCharacterData | types, growth types |
| StateDiff | `ai/portraits/state-diff.ts` | Compare two character states, detect visual changes (equipment/wounds/traits/identity/environment) | types |
| PortraitService | `ai/portraits/portrait-service.ts` | Main orchestrator: generate, accept, lock persona, check visual changes, portrait history | Prisma, providers, prompt-builder, character-adapter, state-diff |
| LocalProvider | `ai/portraits/providers/local.ts` | ComfyUI REST client: queue prompts, poll history, download images, upload references, VRAM management (Ollama unload) | types, prompt-builder, style-config |
| CloudProvider | `ai/portraits/providers/cloud.ts` | Stub for future cloud-based generation | types |
| ProviderFactory | `ai/portraits/providers/index.ts` | getPortraitProvider() factory with local/cloud fallback | local, cloud |

## AI — DAYA Persona Harness (src/daya/)

| Module | File | Purpose | Dependencies |
|--------|------|---------|-------------|
| DayaAffect service | `services/daya-affect.ts` | Event-driven mood vector (morale/stress/grief) for AI-controlled characters; decays toward baseline, writes first-person HistoryEntry beats | Prisma, services/history |
| Model client | `daya/model-client.ts` | ONE uniform chat interface across tiers L1/L2 (self-hosted vLLM, OpenAI-compatible) and C (Anthropic); every call writes a DayaModelCall metering row; unavailable tier throws DayaTierUnavailableError, never silently falls back. `DayaChatParams.model` (WP9 FIX-1) is an optional per-call override of the tier's default model — lets a caller (the router's within-C ladder pick) select a model for one call without mutating `process.env`, which raced under concurrency. WP14 (serverless L1/L2 billing, scale-to-zero): `callOpenAiCompatible` (exported for DB-free unit testing) sends `Authorization: Bearer <DAYA_{tier}_API_KEY>` when that env var is set (absent = no header, unchanged for the current always-on pod), and wraps every L1/L2 call in an `AbortController` timeout (`DAYA_{tier}_TIMEOUT_MS`, default 240000ms) generous enough for a cold worker spin-up; a fired timeout throws the typed `DayaWarmingTimeoutError` (distinct from `DayaTierUnavailableError`) so callers can tell "still waking up" from "genuinely down". Per-tier transport switch: `DAYA_{L1,L2}_PROVIDER=anthropic` (`tierProvider()`) runs that tier over the Claude API instead of the self-hosted endpoint (dev/cost-saving mode, pod parked) — routing/clamping/metering unchanged, model resolved via `DAYA_{tier}_ANTHROPIC_MODEL` then the C-tier default chain; `tierAvailability()` follows `ANTHROPIC_API_KEY` for a Claude-backed tier | Prisma, @anthropic-ai/sdk |
| L1 warm/readiness probe (WP14) | `daya/l1-warm.ts` | `warmL1()`/`l1Status()` — a cheap `max_tokens:1` chat-completion probe against the configured L1 endpoint (same request IS the trigger that spins up a serverless worker; there's no separate ping API). Maps to `L1Status`: `'disabled'` (URL/model unset), `'ready'` (quick 2xx), `'warming'` (reachable but slow — our short `DAYA_L1_STATUS_TIMEOUT_MS` probe timeout fired, or a reachable non-2xx like a queued 503), `'offline'` (genuine network-level failure). Never throws; never writes a DayaModelCall row (infrastructure plumbing, not entity cognition — model-client's `chat()` remains the only metered path). Shares the same `DAYA_L1_API_KEY` bearer-header convention as model-client. A Claude-backed L1 (`DAYA_L1_PROVIDER=anthropic`) short-circuits without probing: `'ready'` when `ANTHROPIC_API_KEY` is set, else `'disabled'` — no cold start exists | model-client (tierProvider + types) |
| Entity id resolution | `daya/entity.ts` | `resolveDayaEntityId(characterId)` (WP9 FIX-2) — the ONE canonical Character id -> DayaEntity.id upsert. Convention: every upstream caller speaks Character id; the ensemble resolves to DayaEntity.id exactly once per wake and threads it down to every `chat()`/`routeAndChat()` call for metering | Prisma |
| Event bus | `daya/events.ts` | WP3 wake-on-trigger lifecycle (plan Ruling 14: nothing runs between events). `DayaTrigger` union (stimulus/dream_tick/adjudication_result/vine_tick/gm_intervention) + `wake(trigger, overrides?)` entry point, gated on `DAYA_ENABLED==='enabled'` (re-read live, not module-cached — mirrors services/godhead-dispatcher.ts's disabled-state audit convention but supports in-process test toggling). `overrides` (optional, WP9) threads mocked model transports through to whichever handler is registered, for testability only. Handler registry (`registerHandler`) — `daya/ensemble.ts` (WP9) registers real handlers for stimulus/gm_intervention/adjudication_result/vine_tick at import time, overwriting the WP3 stub handlers that remain here as a fallback; `daya/scheduler.ts` self-registers dream_tick. `HandlerResult.action` (WP9) reports what an entity actually did, when a handler resolved one | Prisma, services/history, daya/memory |
| Memory ingest (tagger) | `daya/memory.ts` | Meta-memory tagger pipeline: `tagStimulusWithModel` calls the tagger role (model-client tier C haiku-class, fallback L1) and defensively parses its JSON, retrying once then falling back to neutral tags — never throws (ingest always records). Accepts an optional `entityId` (DayaEntity.id, WP9 FIX-2) so its metering row attributes to the entity like every other subsystem's. `ingestStimulus` applies the OOC residency check (OOC content processed in-flight, never persisted) and writes a DayaMemoryEntry via `writeMemoryEntry`, amplifying stored salience by encode-time arousal (flashbulb effect). `writeMemoryEntry` is a direct low-level write reused by `daya/recall.ts` for self-ingesting failed-recall experiences | model-client, prompts/roles/tagger, recall-tuning, Prisma |
| Stat-gated recall | `daya/recall.ts` | `recall(req)`: scores every memory for an entity (relevance = stemmed keyword Jaccard + entityRefs overlap; recency = power-law decay resisted by salience; mood-congruence = asymmetric cosine over mood/memory valence-arousal with mood-repair + threat-sharpening), gated by a Wisdom breadth threshold+budget and a per-candidate seeded-PRNG Wit speed roll (deterministic per entity/memory/cycle — passing candidates that miss the roll land in `deferred`). Thorn blocks suppress/distort/affect-only matching memories. Surfaced memories get a rehearsal salience touch AND are flagged `labileUntilNextDream` in their `classification` JSON (WP10: retrieval re-opens a memory to reconsolidation; the flag is cleared by the next dream tick that actually processes the memory); a best-candidate that clearly reached but was gated out produces `failedFeel` template prose and self-ingests the failed attempt (Ruling 5: the system never forgets, retrieval just weakens). Exports the single `RECALL_TUNING` tunables table (re-exported from `recall-tuning.ts`) and a minimal local `sealLint`-style check (`localSealLint`) kept separate from WP9's canonical `daya/seal.ts` to avoid destabilizing this module's own passing test suite | model-client, daya/memory, recall-tuning, Prisma |
| Recall tunables | `daya/recall-tuning.ts` | Leaf constants module (no daya imports) holding `RECALL_TUNING` — every numeric knob for ingest+recall (Wisdom/Wit gate params, scoring weights, decay/mood/rehearsal constants), calibrated final values | — |
| Tagger role prompt | `daya/prompts/roles/tagger.ts` | `buildTaggerPrompt({roster})` — machinery-zone-only prompt text for the meta-memory tagger; JSON contract consumed by `daya/memory.ts`, never reaches an entity's phenomenal stream directly | — |
| Dream-tick scheduler | `daya/scheduler.ts` | WP3 cadence scheduling, not a background daemon. `computeNextDreamTick`/`computeNextDreamTickFromState` derive next-due timestamp from `DAYA_DREAM_INTERVAL_MS` (default 6h) modulated by Frequency pool state read off the character sheet JSON (`dreamIntervalModulation` — drained pool -> longer interval, degraded cognition per plan Ruling 20, up to 2x at empty). `runDueDreamTicks()` manual sweep over existing DayaEntity rows, fires `wake({kind:'dream_tick'})` for due ones; self-registers the dream_tick handler (writes a source:'dream' tick-marker DayaMemoryEntry, then calls `runDreamConsolidation`, re-exported unchanged from `daya/dream.ts` — WP10 owns the real dynamics; this module keeps only cadence + the trigger handler) | Prisma, services/history, daya/events, daya/dream |
| Dream consolidation | `daya/dream.ts` | WP10: the real `runDreamConsolidation(characterId, overrides?)` — clusters an entity's recent/labile/high-salience memories (code-side union-find over shared entityRefs/keyword overlap/temporal proximity, no model), selects up to `N=round(3·contextDepth)` clusters (contextDepth read from the same WP6 pool-degradation lever `daya/router.ts` uses for routing), calls the Dream role prompt per cluster (tier L1) for clusterTheme/links/meta-memory synthesis, and applies retag drift capped by `perTickDriftCap` and scaled by a reconsolidation age-gradient (`distortability`, young memories move freely, old ones barely). Rumination/trauma dynamics (T0 §C) are deliberately CODE-driven, not LLM-derived: a negative/high-arousal cluster with no counterweight since the last tick enters/deepens a `ruminationLock` (fixed per-tick valence/arousal/salience steps, mood-repair implicitly bypassed since the deepening formula has no repair term); a reactivated (selected) locked cluster WITH a counterweight present (`social_contact`/`goal_progress`/`rest_safety`/`positive_recall`, heuristically detected from recent memory source/tags) heals toward neutral and may break the lock via a seeded-PRNG roll (`counterweightBreakP`); a locked cluster crossing a tick threshold logs a Thorn PROPOSAL (a zero-cost `DayaModelCall` audit row, subsystem `thorn_proposal` — never auto-created, Ruling 7) and its suppression erodes on ticks it isn't reactivated (extinction, not erasure). A salience maintenance sweep (power-law decay toward a floor + spacing-penalized rehearsal credit) runs over every memory every tick. contextDepth < 0.3 skips all model calls and meta-memory synthesis (cheap affect-only/light-retag tick). Every written meta-memory content string passes `daya/seal.ts`'s `enforceSeal`. Lock/suppression/thorn-proposal state lives in the cluster anchor memory's existing `classification` JSON (no schema change) | model-client, entity, memory, recall, recall-tuning, dream-tuning, router, seal, prompts/roles/dream, services/daya-affect, services/history, Prisma |
| Dream tunables | `daya/dream-tuning.ts` | Leaf constants module (no daya imports) holding `DREAM_TUNING` — the final T0-psych-digest-calibrated dream-consolidation knobs (drift caps, reconsolidation age exponent, rumination step sizes, heal magnitude, counterweight break probability, suppression decay) | — |
| World ledger | `daya/world-ledger.ts` | WorldFact CRUD: `establishFact`, `currentFacts` (excludes superseded), `supersede` (append-and-supersede, never mutates a live row in place) — nothing physical exists only in prose (plan Ruling 19) | Prisma |
| World Adjudicator | `daya/adjudicator.ts` | `resolveIntent(input, overrides?, mechanicsHook?)`: loads live WorldFacts + character sheet basics, resolves the entity's DayaEntity.id (WP9 FIX-2), calls model-client (tier C, subsystem 'adjudicator', metered against that id) with the WP9 v1 role prompt (`prompts/roles/adjudicator.ts`'s `buildAdjudicatorPrompt()`, replacing the v0 inline const), writes/supersedes facts (same-subjectKey contradiction guard prevents duplicate live facts regardless of the model's own factsToSupersede accuracy). When the model calls for a check: the optional `mechanicsHook` (WP8, `MechanicsRollHook`) resolves the REAL roll (motivated effort + skill-fit DR adjustment + pool spend) when supplied; omitting it (every pre-WP8 caller) keeps the original zero-effort `unskilledCheck` placeholder exactly as before. Returns outcome + experienceEvent. Implements the `WorldResolver` interface so a future physics engine can replace it without callers changing (plan Ruling 19) | model-client, world-ledger, entity, prompts/roles/adjudicator, lib/dice, Prisma, daya/mechanics (optional hook) |
| Mechanics coupling | `daya/mechanics/effort.ts`, `skill-fit.ts`, `resolve.ts`, `thorns.ts` | WP8: wires the shipped GROWTH engine into the ensemble loop so effort/pool-spend/Thorns/vine-progress are LIVE, not placeholders. `effort.ts`: `computeEffort()` — motivated pool wager (Ruling 10) from an effortContext band × a 0.5-1.5 `careWeight` (goal-salience + arousal blend, `careScalarFrom`) × a 0.7-1.3 `selfSkillFactor` from the entity's BELIEVED (never true) skill level, clamped to `min(ceiling[context], poolCurrent)` — never defaults to max. `EFFORT_TUNING` exported. `skill-fit.ts`: `selectCandidateSkills()` (code-only keyword prefilter) + `judgeSkillFit()` (small/haiku-class judge call, tier C, subsystem `skill_fit`, through the WP6 sanitize boundary) rating skill-specificity 0..1 -> `drAdjust = round((fit-0.5)*SPECIFICITY_SWING)` (narrower fit lowers effective DR). `SPECIFICITY_SWING` exported. `resolve.ts`: `resolveEffortCheck()` replicates the wager route's formula (skillDie+fateDie+effort+traitFlat vs DR — that route itself is untouched, duplication flagged as a future shared-resolver refactor) at service level for the entity path, persists the spend via `spendAttribute`/the canonical prisma pattern, marks trainable on fail, fires a `pool_spent` DispositionEvent (NEEDS-MIKE: a conservative margin-scaled extra-damage default stands in for the uncodified narrative-harm mapping, hard-DR-and-failure-gated only). Also `maybeAdvanceVine()` (resolves an EXISTING open GoalOpportunity via `services/goal.ts` when a check-driven outcome matches one — never creates/forces one, Ruling 22) and `restAndRecover()` (Short/Long Rest -> `pool_restored` event). `thorns.ts`: `detectAndFireThorns()` interprets a TRUE-sheet Thorn's own `description`/`mechanicalEffect`/`rollModifiers` (never inventing new rules) into an affect delta (`thorn_fired` DispositionEvent), a WP4 `ThornBlock` (persisted on `DayaEntity.personaProfile.activeThornBlocks`, no schema change), and a felt line (never named) logged to the ledger; detection is code-only/deterministic (stemmed Jaccard, same primitive as recall/dream). `isRuminationLockActive()` is the WP4<->WP10 connector: reads dream.ts's `ruminationLock` classification-JSON flag so recall.ts's mood-repair bias can suppress itself mid-loop | model-client, router, sanitize, recall, memory, lib/dice, lib/character-actions, services/advancement, services/trait-modifiers, services/daya-affect, services/goal, daya/renderer, Prisma |
| Room seed | `scripts/seed-daya-room.ts` | Idempotent apartment-scale WorldFact seed (21 facts: 3 rooms + hallway, furniture, door/window states, positioned objects) for a named test campaign (default `__DAYA_TEST__`); creates the campaign + a WATCHER GM user if missing. Exports `seedDayaRoom()` for reuse by test scripts | Prisma, world-ledger, bcryptjs |
| Router | `daya/router.ts` | Routing layer in front of model-client's `chat()`: `routeAndChat()`/`decideRoute()` pick a processing tier + depth per request from a deterministic tier matrix (difficulty class × skill × pool-state degradation), attach clamp constraints to entity-voiced output, and enforce the sanitization boundary before anything reaches the cloud tier (hard-fail reroutes to a degraded local call on a detected leak). Within-C ladder model pick is passed via `chat()`'s per-call `model` override (WP9 FIX-1) instead of the old temporary-env-var toggle, which raced under concurrent C-tier calls. One `ROUTER_TUNING` export holds every numeric default (env-overridable: `DAYA_C_MODEL_TOP`, `CLAMP_AUDIT_RATE`). `poolFraction`/`degradationForFraction` (exported for WP10) are the same contextDepth degradation lever `daya/dream.ts` reuses so dream ticks shallow out under a drained pool exactly like routing does | model-client, clamp, sanitize |
| Clamping | `daya/clamp.ts`, `daya/clamp-tables.ts` | Produces authentically limited output below a model's native capability: `generateClampConstraints()` maps a skill level to a band-appropriate constraint set from per-domain tables (six everyday domains seeded, extensible), `buildClampPromptText()` renders it as positive-identity system-prompt material; `auditClampedOutput()` is a sampled runtime judge pass, not run on every call | model-client |
| Sanitization boundary | `daya/sanitize.ts` | `classifyTraffic()` (code-first sensitivity/IC-OOC heuristics, fails local to sensitive when inconclusive), `stripAndForward()` (identifier -> role-token replacement before an outbound cloud call; also calls the T15 `screen()` tap as its choke point — see `jewl/screening.ts`, inert in Phase 1), `assertClean()` (hard-fail regex sweep on the stripped payload), `sweepForSentinel()` (test helper proving OOC content never persists anywhere in the DB) | Prisma, jewl/screening |
| Perceptual renderer | `daya/renderer.ts`, `daya/renderer-math.ts` | `render(request, observer)`: how an AI-controlled entity perceives its own stats, possessions, environment, other entities, or relationships — a deterministic fidelity ladder (F0 blind through F5 exact, attunement- and subject-capped) plus five signed bias operators (selfRegard/optimism/projection/denial/catastrophize) and mood-tilted phrasing compute a seeded (`entityId`,`subjectKey`,`revisionEpoch`)-deterministic content envelope, which a single L1 model call voices in-character (post-check + one re-voice + deterministic-template fallback — perception never fails loudly). `observer.entityId===null` bypasses to raw truth (Terminal view). `applyRevision()` converges an entity's `DayaBelievedSheet` numeric estimate toward a fresh distorted read at attunement's rate on exertion/rest/dream/feedback events, tracking epochs under `data._epochs`. Character id -> DayaEntity.id resolution now defers to `daya/entity.ts` (WP9 FIX-2) instead of a local upsert | model-client, entity, Prisma |
| Embodiment seal (canonical) | `daya/seal.ts` | `sealLint(text): SealHit[]` — the canonical mechanical-vocabulary/meta-vocabulary lint (Ruling 13): HARD hits (numeric-mechanics patterns, unambiguous meta terms) vs. SOFT (attribute names used descriptively, log-only). `enforceSeal(text, opts)` is the shared re-voice-once-then-template-fallback loop every phenomenal-zone boundary uses (Soul Sim, Body Interface inward, Spirit Core, Dream, and an inbound-only hold-or-pass mode for gm_intervention); every hit at every attempt writes a zero-cost synthetic DayaModelCall audit row (subsystem 'seal', content-free rationale) | Prisma |
| Six role prompts | `daya/prompts/roles/spirit.ts`, `soul.ts`, `body.ts`, `dream.ts`, `adjudicator.ts` (`tagger.ts` is WP4's) | Repo-safe TS template exports for the six model roles. `spirit.ts`: `buildSpiritPrompt()` (tenets block + identity/voice/felt-state/perception/recall/desires/stimulus), `buildDesiresBlock()`/`toWantClause()` (Ruling 22 guard — vines render as want-language, never task/quest phrasing), `parseSpiritOutput()` (lenient Say:/Do:/Attend:/Rest parsing). `soul.ts`: `buildSoulPrompt()` + `buildDeltaSummary()` (state->felt-language mapping conventions, never echoes numbers). `body.ts`: `buildBodyOutwardPrompt()`/`parseBodyOutwardResponse()` (intent -> structured JSON for the Adjudicator) and `buildBodyInwardPrompt()`/`outcomeBandFor()` (outcome -> sensation prose). `dream.ts`: `buildDreamPrompt()` role shell (WP10 supplies dynamics). `adjudicator.ts`: `buildAdjudicatorPrompt()`, the v1 prompt `daya/adjudicator.ts` calls into, keeping the shipped JSON contract exact | — |
| Ensemble orchestrator | `daya/ensemble.ts` | The integration keystone: wires the six roles together per `DayaTrigger` kind, registered as the real handlers over the WP3 stubs. `stimulus`: Tagger ingest -> Thorn detection/fire (WP8, `mechanics/thorns.ts`) -> stat-gated recall (fed the entity's persisted active ThornBlocks + the WP4<->WP10 rumination-lock flag; fired Thorns' felt lines fold into the recall block) -> Soul Sim -> Spirit Core -> Say:/Do:/Attend:/Rest branch. Do: -> Body outward -> builds a `care` scalar (top active goal priority + current stress) and a `MechanicsRollHook` closure (WP8, `mechanics/resolve.ts`'s `resolveEffortCheck`) -> Adjudicator (now mechanics-coupled: real effort/skill-fit/pool-spend when it calls for a check) -> fires `adjudication_result`. Attend: -> renderer -> recurses once as a perception stimulus, hard depth cap 1. Rest: now actually attempts a Short Rest (WP8, `restAndRecover`) rather than a no-op. `adjudication_result`: WP8 vine-progress check (`maybeAdvanceVine`, existing-opportunities-only) -> Tagger -> Body inward (sensation, always computed) -> wakes Spirit only when salience >= 0.4. `gm_intervention`: sealLint-checked inbound — a breach is held and flagged, never delivered; a clean intervention runs the full stimulus pipeline verbatim. `vine_tick`: coarse Spirit-lite "weeks pass" summary (Phase-1 stub, exercised by WP12's time-skip). Resolves DayaEntity.id once per wake (FIX-2) and enforces the seal on every phenomenal-zone-crossing string | entity, model-client, events, memory, recall, renderer, world-ledger, adjudicator, seal, prompts/roles/*, daya/mechanics/* |
| Test canvas / authoring flow (WP12) | `daya/authoring.ts`, `daya/conversation.ts`, `daya/timeskip.ts` | The "Mike authors the first soul himself, in-app" flow (spec: no pre-authored persona — this is plumbing only). All mutation entry points GM/ADMIN-gated (`isWatcherOrAbove`). `authoring.ts`: `wrapCharacterAsDaya()` (create-if-missing DayaEntity + DayaAffect baseline + ONE `renderer.ts` `applyRevision()` pass on `pool.willpower` so the believed sheet diverges from the true sheet on first wrap only — idempotent past that), `updateDayaAuthoring()` (introspection/voice/bias/identityNarrative — the soul-level params not on the standard sheet, all live-editable post-wake), `seedInitialVines()` (1-3 goals via the EXISTING `services/goal.ts` — createGoal/setGoalDormant/declareOpportunity, no new goal mechanics), `seedEntityMemories()` (direct `writeMemoryEntry` rows, all-or-nothing `sealLint`-checked so one mechanical-vocabulary hit rejects the whole batch), `setDayaStatus()` (the DORMANT<->ACTIVE wake gate), `getDayaAuthoringState()` (GM read view: entity/persona/affect/believed sheet/goals/recent memories). `conversation.ts`: `converseWithEntity()` — the 1:1 talk surface, `deliverStimulus()` wrapped to degrade gracefully into `'disabled'`\|`'dormant'`\|`'core_offline'`\|`'warming'` statuses instead of a raw thrown error (never reroutes her core to cloud tier C). WP14: a caught `DayaWarmingTimeoutError` (checked before `DayaTierUnavailableError`, since it's not a subclass) surfaces `'warming'` — a cold-start-in-progress, not a hard failure. Also exports `warmEntityCore(actorRole, overrides?)`, a GM/ADMIN-gated wrapper around `l1-warm.ts`'s `warmL1()` for the persona canvas's mount-time warm-up trigger (no characterId needed — warming the L1 core is infrastructure, not per-entity). `timeskip.ts`: `runTimeSkip()` — Ruling 15: `wake({kind:'vine_tick'})` for her coarse stated intent -> `adjudicator.ts` `resolveIntent()` -> delivered back as `adjudication_result` (the same path a live Do: outcome takes, which is what stamps it as a lived memory) -> optional `runDreamConsolidation()` thickening pass. Both `conversation.ts` and `timeskip.ts` import `daya/ensemble.ts` for its side-effect handler registration (nothing else in the production import graph did before WP12 — production stimulus/vine_tick triggers would otherwise silently hit the WP3 ingest-only stub) | entity, renderer, memory, seal, events, adjudicator, scheduler, model-client, services/goal, services/history, Prisma |
| Screening tap (T15) | `daya/jewl/screening.ts` | `screen(streamChunk, ctx): ScreenVerdict {action:'pass'\|'flag'\|'restrict', reasonTag?}` — Addendum B3's "Jewel Doctrine" choke point (reads everything, retains nothing). Phase 1: stateless pass-through, always `{action:'pass'}`, zero DB writes. Wired into `daya/sanitize.ts`'s `stripAndForward()` as the one call site the future pattern-flagging/GM-routing project (full JEWL always-listening vision, out of Phase-1 scope) extends, rather than threading a new parameter through every caller | — |
| Client-store tap (T15) | `daya/jewl/client-store.ts` | `readClientStore()`/`writeClientStore()` — a local-file-backed interface seam for Addendum B3's user-owned OOC/wellbeing store (sovereignty is literal: never routed through campaign data). Default path `.local/daya-client-store.json` (gitignored, override via `DAYA_CLIENT_STORE_PATH`). Phase 1 establishes the seam only; a full client app is out of scope. Carries a single commented seam (no code) marking where a jurisdictional-review-gated legal-mandate reader would attach — NEEDS-MIKE/legal, not built | fs |
| JEWL as a persona-harness entity (WP13) | `daya/jewl-persona.ts`, `daya/jewl-action.ts` | JEWL is not a separate system — he is a persona-harness entity like any other (same ensemble: memory, affect, continuity), distinguished ONLY by elevated access. `jewl-persona.ts`: `ensureJewlDayaEntity()` resolves JEWL's ONE character sheet — the `JEWL` Character (entityType GODHEAD) in the Prime campaign (`__PRIME__`); the Prime Campaign drives the meta, his sheet is never duplicated into or fabricated in another campaign (missing sheet = seeding defect, throws; `opts.campaignId` is a TEST-ONLY override for a throwaway campaign that seeded its own stand-in via exported `jewlSheetData()`) — and finds-or-creates his 1:1 DayaEntity — near-1.0 introspection, `personaProfile.omniscient=true`, ACTIVE from creation (never dormant), identityNarrative folding in the 15 behavioral-law summary (`JEWL_FIFTEEN_LAWS`, paraphrased, so his real Spirit prompt carries them) — idempotent, never resets persona/affect/memory on re-ensure. `jewl-action.ts`: `runJewlToolAction(entityDaId, campaignId, intent, overrides)` — his unrestricted action layer; asks the C-tier (clean) model which registered copilot tool (`ai/copilot/tools`) fulfills a `Do:` intent, then dispatches it with `actorRole:'GODHEAD'` (satisfies every tool's `isWatcherOrAbove`/`isAdminRole` gate regardless of target) — operable on ANY character or the world, never self-only. `ensemble.ts` wires both in behind one `persona.omniscient` flag, read once per wake: `renderAttention` builds an `Observer{entityId:null}` (Terminal-truth bypass) instead of the entity's own attunement/bias lens; the 'act' branch dispatches to `runJewlToolAction` instead of Body-outward+adjudicator (self-only, unchanged for every other entity — the absence of this branch IS the gate); recall/spirit content skips `enforceSeal` entirely for him (seal inversion — he is allowed to hold mechanics in his own context), but the 'speak' branch still runs `enforceSeal` on the isolated spoken content (subsystem `jewl_speak`) so he cannot leak mechanics into a normal entity's phenomenal stream. Mask (`ai/copilot/jewl-identity.ts`'s `maskJewlName`) is unchanged/regression-only. `scripts/test-daya-wp13.ts` exercises all of the above end-to-end, mocked | entity, model-client, renderer, seal, memory, events, ai/copilot/tools, Prisma |

## API Routes (80+ total)

| Route | Methods | Service |
|-------|---------|---------|
| /api/auth/register | POST | Direct (uses AccessCodeService for validation) |
| /api/auth/login | POST | Direct |
| /api/auth/logout | POST | Direct |
| /api/auth/me | GET | Direct |
| /api/campaigns | GET, POST | CampaignService |
| /api/campaigns/join | POST | CampaignService |
| /api/characters | GET, POST | CharacterService |
| /api/characters/[id] | GET, PATCH | CharacterService |
| /api/characters/[id]/backstory | POST, PATCH | BackstoryService |
| /api/access-codes | GET, POST | AccessCodeService |
| /api/access-codes/redeem | POST | AccessCodeService |
| /api/changelog | GET | ChangeLogService (query with filters: campaignId, characterId, actor, category, pagination) |
| /api/changelog/[id]/revert | POST | ChangeLogService (revert entry with conflict detection) |
| /api/campaigns/[id]/events | GET, POST | CampaignEventService (create + query campaign events with type/session filters). POST now broadcasts via SSE |
| /api/campaigns/[id]/stream | GET (SSE) | Campaign real-time stream. SSE endpoint for live events (dice, checks, state changes, chat, connections) |
| /api/campaigns/[id]/skill-check | POST | Initiate multi-step skill check. Rolls SD, stores pending check, broadcasts wager prompt to player via SSE |
| /api/campaigns/[id]/skill-check/wager | POST | Submit effort wager for pending check. Rolls FD, computes result, deducts effort, broadcasts result |
| /api/campaigns/[id]/rest | POST | Rest system (short/long rest for selected characters, GM-only, creates changelog + game event) |
| /api/campaigns/[id]/sessions | GET, POST | CampaignEventService (list sessions, start/end session) |
| /api/campaigns/[id]/forge | GET, POST | ForgeService (list + create forge items, GM-only create, players see published only) |
| /api/campaigns/[id]/forge/[itemId] | GET, PATCH, DELETE | ForgeService (get/update/delete forge item, GM-only edit, delete draft only) |
| /api/campaigns/[id]/forge/[itemId]/publish | POST, DELETE | ForgeService (publish/unpublish forge item, GM-only) |
| /api/campaigns/[id]/forge/author | POST, PUT | ForgeAuthoringService (POST: GM describes → Kai generates stats for review; PUT: GM confirms → persists as draft ForgeItem) |
| /api/campaigns/[id]/requests | GET, POST | ForgeService (list + create player requests, players see own only) |
| /api/campaigns/[id]/requests/[requestId] | PATCH | ForgeService (player edit or GM resolve with approve/deny/modify) |
| /api/krma/wallets/me | GET | KRMA Wallet (authenticated user's wallet balance) |
| /api/krma/wallets/me/transactions | GET | KRMA Wallet (paginated transaction history, filterable by reason) |
| /api/krma/campaigns/[id]/balance | GET | KRMA Wallet (campaign wallet balance, GM-only) |
| /api/krma/campaigns/[id]/fund | POST | KRMA Wallet (GM funds campaign from personal wallet) |
| /api/krma/campaigns/[id]/defund | POST | KRMA Wallet (GM withdraws from campaign to personal wallet) |
| /api/krma/campaigns/[id]/transactions | GET | KRMA Wallet (campaign transaction history, GM-only) |
| /api/krma/campaigns/[id]/economy | GET | KRMA Wallet (campaign fluid/crystallized/total breakdown, GM-only) |
| /api/krma/campaigns/[id]/crystallize | POST, GET | Crystallization (crystallize/dissolve entities, get ledger + crystallized IDs) |
| /api/krma/metrics | GET | KRMA Wallet (global KRMA metrics, Admin-only) |
| /api/krma/audit/verify | POST | KRMA Reconciliation (full ledger audit, Admin-only) |
| /api/daya/tick | POST | daya/scheduler runDueDreamTicks (ADMIN-only manual sweep — no background daemon; fires any due dream ticks, returns fired/skipped) |
| /api/characters/[id]/daya | GET, PATCH | daya/authoring (WP12 test canvas) — GET reads full authoring state (wrapped?, introspection, persona, affect, believed sheet, goals, recent memories); PATCH sets introspection/voice/bias/identityNarrative, GM/ADMIN-only |
| /api/characters/[id]/daya/wrap | POST | daya/authoring wrapCharacterAsDaya (create/enable the 1:1 DayaEntity substrate, idempotent, GM/ADMIN-only) |
| /api/characters/[id]/daya/vines | POST | daya/authoring seedInitialVines (1-3 goals via the existing GoalService, GM/ADMIN-only) |
| /api/characters/[id]/daya/memories | POST | daya/authoring seedEntityMemories (N seeded DayaMemoryEntry rows, all-or-nothing sealLint-checked, GM/ADMIN-only) |
| /api/characters/[id]/daya/enable | POST | daya/authoring setDayaStatus (the DORMANT<->ACTIVE wake gate, GM/ADMIN-only) |
| /api/characters/[id]/daya/converse | POST | daya/conversation converseWithEntity (the 1:1 talk surface — stimulus in, Say:/Do:/Attend:/Rest out, or a graceful disabled/dormant/core_offline/warming status, GM/ADMIN-only) |
| /api/characters/[id]/daya/timeskip | POST | daya/timeskip runTimeSkip (Ruling 15 time-skip: vine_tick -> adjudicator -> adjudication_result, optional dream-tick thickening, GM/ADMIN-only) |
| /api/characters/[id]/daya/warm | POST | daya/conversation warmEntityCore -> daya/l1-warm warmL1 (WP14 fire-and-forget trigger for the self-hosted L1 core's serverless worker spin-up; test canvas calls this on mount, before the GM types anything; action is global not per-character, GM/ADMIN-only) |
| /api/dice/roll | POST | DiceService (quick roll — one or more dice, no DR/effort) |
| /api/dice/check | POST | DiceService (full skill/unskilled check with DR, effort, modifiers) |
| /api/dice/inject | GET, POST, DELETE | DiceInjection (Godhead-only — list/register/remove injections) |
| /api/campaigns/[id]/locations | GET, POST | LocationService (list + create locations, GM-only create) |
| /api/campaigns/[id]/locations/[locationId] | GET, PATCH, DELETE | LocationService (get/update/delete location, GM-only) |
| /api/campaigns/[id]/items | GET, POST | CampaignItemService (list + create world items, GM-only create) |
| /api/campaigns/[id]/items/[itemId] | GET, PATCH, DELETE | CampaignItemService (get/update/delete item, GM-only) |
| /api/campaigns/[id]/encounters | GET, POST | EncounterService (list + create encounters, GM-only create) |
| /api/campaigns/[id]/encounters/[encounterId] | GET, PATCH, DELETE | EncounterService (get/update/delete encounter, GM-only) |
| /api/portraits/generate | POST | PortraitService (queue portrait generation for a character) |
| /api/portraits/history | GET | PortraitService (portrait history for a character) |
| /api/portraits/accept | POST | PortraitService (accept portrait as current) |
| /api/portraits/lock | POST | PortraitService (persona lock — permanent identity anchor) |
| /api/portraits/status | GET | PortraitService (check for visual state changes) |
| /api/portraits/provider | GET | PortraitService (provider health/status check) |
| /api/portraits/edit | POST | PortraitService (edit/regenerate portrait) |
| /api/portraits/existing | GET | PortraitService (check for existing portraits) |
| /api/auth/forgot | POST | AuthService (initiate password reset — sends token) |
| /api/auth/reset | POST | AuthService (consume reset token, set new password) |
| /api/auth/verify-email/request | POST | AuthService (request email verification resend) |
| /api/auth/verify-email/[token] | GET | AuthService (consume email verification token) |
| /api/auth/view-as | POST | AuthService (ADMIN impersonate a user for debugging) |
| /api/billing/subscription | GET, POST, DELETE | SubscriptionService (get status, subscribe, cancel) |
| /api/billing/stub-checkout | POST | SubscriptionService (dev stub for Stripe checkout flow) |
| /api/campaigns/[id]/ai-settings | GET, PATCH | Campaign AI provider preferences (GM-only) |
| /api/campaigns/[id]/application | GET, POST | ApplicationService (player submit application) |
| /api/campaigns/[id]/application/expand | POST | ApplicationService (AI-expand a response draft) |
| /api/campaigns/[id]/application/template | GET, PATCH | ApplicationService (GM get/set application template) |
| /api/campaigns/[id]/application/template/suggest | POST | ApplicationService (AI suggest template prompts for GM) |
| /api/campaigns/[id]/applications | GET | ApplicationService (GM list all applications) |
| /api/campaigns/[id]/applications/[appId] | PATCH | ApplicationService (GM approve/deny/revision) |
| /api/campaigns/[id]/audio-chunk | POST | JEWL audio loop — receives WebM audio chunk, transcribes via Whisper STT, routes to JEWL copilot |
| /api/campaigns/[id]/clock | GET, PATCH | TimeService (get campaign clock, advance/set cycle) |
| /api/campaigns/[id]/contested-check | POST | DiceService (contested skill check between two characters) |
| /api/campaigns/[id]/context | GET | Context service (build token-efficient campaign context for AI) |
| /api/campaigns/[id]/copilot | POST | JEWL copilot chat (main inference endpoint) |
| /api/campaigns/[id]/copilot/history | GET | CopilotMessage history for campaign |
| /api/campaigns/[id]/entities | GET, POST | EntityService (list campaign entities, create draft entity) |
| /api/campaigns/[id]/entities/[entityId] | GET, PATCH, DELETE | EntityService (get/update/delete entity, step save/load for wizard) |
| /api/campaigns/[id]/entities/[entityId]/crystallize | POST | EntityService crystallizeEntity (TKV debit, GM wallet → character wallet, LOCK) |
| /api/campaigns/[id]/entities/quick-generate | POST | EntityQuickGenService (AI-expand prompt → wizard draft) |
| /api/campaigns/[id]/forge/pull | POST | ForgeService (pull a global blueprint into the campaign catalog) |
| /api/campaigns/[id]/godhead-messages | GET | GodHeadMessage list for campaign (GM-only) |
| /api/campaigns/[id]/godhead-messages/[messageId]/resolve-bestowal | POST | NectarBestowService (GM confirms or declines Nectar proposal) |
| /api/campaigns/[id]/history | GET | HistoryService (query per-object perspective history) |
| /api/campaigns/[id]/jewl-mistakes | POST | JewlMistakeService (GM flags a JEWL message as wrong) |
| /api/campaigns/[id]/timescales | GET, POST | TimeService (list timescales, create custom calendar) |
| /api/campaigns/[id]/timescales/[timescaleId] | GET, PATCH, DELETE | TimeService (get/update/delete timescale) |
| /api/contracts | GET, POST | ContractService (list contracts, create new contract) |
| /api/contracts/[id] | GET, PATCH, DELETE | ContractService (get/update/revoke contract; PATCH/DELETE blocked on immutable) |
| /api/contracts/[id]/evaluate | POST | ContractService (manual trigger contract evaluation) |
| /api/contracts/sweep | POST | ContractService (sweep all active contracts — daily cron target) |
| /api/copilot/create-dialog | POST | JEWL entity creation dialog (new + edit modes, Location and entity types) |
| /api/copilot/form-suggest | POST | JEWL form suggestion (AI prefills form fields from prose) |
| /api/admin/economy-config | GET, PATCH | EconomyConfigService (ADMIN read/write economy constants) |
| /api/admin/godheads | GET | GodHeadAdminService (list all godheads with metrics) |
| /api/admin/godheads/[name] | GET, PATCH | GodHeadAdminService (get/update single godhead) |
| /api/admin/subscription-drip | POST | SubscriptionService (ADMIN manually trigger a drip run) |
| /api/godhead/[id]/invoke | POST | GodHead agent runtime — dispatch a manual invocation |
| /api/penalty-actions/[id] | PATCH | ContractService (ADMIN confirm or reject a PenaltyAction) |
| /api/characters/[id]/ai-action-mode | PATCH | GodHeadAdminService (toggle aiActionMode on a godhead character) |
| /api/characters/[id]/advancement | POST | AdvancementOpsService (apply trainable upgrade picks, r-2026-07-15-01) |
| /api/characters/[id]/cast | POST | MagicCastOpsService (resolve a wild/woven cast server-side, r-2026-07-22-01: schools/method/dr/manaSpent/associatedSkillName; broadcasts cast_result) |
| /api/characters/[id]/spells | POST | SpellGrantService (GM teaches an authored spell ForgeItem — confirm step of the player→GM→godhead Woven pipeline, r-2026-07-22-01 #5; settles KV lock + weave fee) |
| /api/characters/[id]/mana | POST | ManaService.adjustMana (GM/ADMIN narrative mana adjustment — no regen loop exists, r-2026-07-23-05) |
| /api/characters/[id]/burn | POST | BurnService (character voluntarily burns KRMA) |
| /api/characters/[id]/canvas-position | PATCH | Lightweight canvas position persistence (no character data change) |
| /api/characters/[id]/controller | PATCH | Character controller assignment (GM transfers control) |
| /api/characters/[id]/damage | POST | DamageService (body cascade) or CharacterAttributeService (`mode:'attribute'` — pool depletion w/ conditions + Frequency overflow + death trigger, T25) |
| /api/characters/[id]/death | POST | CharacterService (confirm death, trigger KRMA death split) |
| /api/characters/[id]/death-save | GET, POST, DELETE | DeathSaveService (get pending save, resolve roll, cancel mercy window) |
| /api/characters/[id]/frequency | PATCH | FrequencyService (spend/restore Frequency) |
| /api/characters/[id]/inventory | GET | InventoryService (3-tier inventory: equipped/carried/possessions) |
| /api/characters/[id]/inventory/equip | POST, DELETE | InventoryService (equip/unequip item to body region) |
| /api/characters/[id]/lock | GET, POST | PersonaLock (get lock status, write persona lock after portrait accepted) |
| /api/characters/[id]/mechanics | PATCH | CharacterService (assignMechanics — seeds Seed/Root/Branch from Forge) |
| /api/characters/[id]/possessions | GET, POST, DELETE | PossessionService (list/add/remove possession relationships) |
| /api/characters/[id]/request-changes | POST | ApplicationService / BackstoryService (GM request revision) |
| /api/dice/deathsave | POST | DiceService (death save roll — separate from /check for UI routing) |
| /api/entities/[id] | GET, PATCH | EntityService (cross-campaign entity get/update — used by godhead tools) |
| /api/locations/[id]/status | PATCH | LocationService (change location status: ACTIVE/HIDDEN/DESTROYED) |
| /api/krma/wallets/character/[id] | GET | KRMA Wallet (character wallet balance) |
| /api/krma/wallets/character/[id]/transactions | GET | KRMA Wallet (character wallet transaction history) |
| /api/hub | GET | HubService (list LISTED campaigns, public, filterable) |
| /api/hub/[id] | GET | HubService (campaign listing detail, public) |
