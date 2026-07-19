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
| EconomyConfigService | `services/economy-config.ts` | Read/write ADMIN-tunable economy constants (EconomyConfig KV store). Falls back to code defaults when key absent | Prisma, subscription-drip |
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
| JEWL / Copilot | copilot/JewlChip | Always-visible JEWL status chip in canvas header: connection state, mute toggle, active audio indicator |
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
| JEWL Tools | `ai/copilot/tools/` | 15+ tool implementations: actors (read actor state), attribute-set, condition, damage, forge-blueprint, list-canvas-characters, memory, mistake-corpus, move-character, npc-speak, place-on-canvas, remove-from-canvas, time, time-metrics; plus index + registry + types |

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
