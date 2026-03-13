# GRO.WTH — Design Decisions Log

**Last Updated:** 2026-03-13
**Status:** All questions from research phase resolved by Mike.

---

## 1. Core Mechanics Decisions

---

### 1.1 — Seeds: Source Data and Creation Philosophy

**Decision: Seeds are defined in a CSV reference sheet; basic examples will be AI-generated, and GMs create the rest for their campaigns.**

> "This is an unbalanced and albeit half created example sheet for seeds, and roots, etc. C:\Projects\GRO.WTH\docs\Character Creation Examples.csv. Remember that the basic examples will be created with AI generation and then the rest will be made by GMs for their campaigns (this goes for every aspect of GRO.WTH)"

**Implementation notes:** Use CSV as reference data for beta Seed catalog. Build Seed creation as a GM tool, not a hardcoded list. AI generation pipeline needed for baseline Seeds. Every content type (Seeds, Roots, Branches, etc.) follows this pattern: starter set via AI, expanded by GMs.

---

### 1.2 — Effort Is Always Spent

**Decision: Effort is always spent regardless of outcome. Effort exceeding the max possible (Fate Die Max + Skill Level) is wasted.**

> "Effort is always spent. any effort that is spent above the max possible ie (Fate Die + Level of skill) after roll is considered wasted effort"

**Implementation notes:** No effort refund on success. Server must track "wasted effort" as a distinct concept (effort spent beyond the cap). UI should warn players when wagering above the cap but not prevent it.

---

### 1.3 — Effort Pools: Governor-Based, Player Choice

**Decision: Effort comes from the skill's governor attributes matching the action's pillar type. Player chooses distribution across 1-3 eligible governors. Max effort = Fate Die Max + Skill Level.**

> "So the max possible check is Fate Die Maximum + Skill Level for skill checks. for unskilled checks it would just be Fate Die Maximum. So lets say fate die is a d8 and they are using a skill at level 14 they would add effort based on whatever governors that skill has (player choice but dependent on the type of action they are taking (body, spirit, or soul) so if it is a body action then the effort would come from governors of the skill that are body clout, celerity, or constitution) it can be from 1 or all 3 in whatever amount."

**Implementation notes:** Effort wager UI must show only eligible governor pools (filtered by action pillar type). Player splits effort freely across those pools. Unskilled checks: max effort = Fate Die Max only. Cap is on the *total added to the roll*, not on the amount spent from pools.

---

### 1.4 — Skill Die Progression (Levels 1-20)

**Decision: Skilled checks use Fate Die + Skill Die. Skill Die is determined by level: 1-3 = flat +1/+2/+3, 4-5 = d4, 6-7 = d6, 8-11 = d8, 12-19 = d12, 20 = d20.**

> "Skilled Checks are FD + Skill Die (Determined by level 1-20 (flat +1-+3, D4, D6, D8, D12, D20) so level 1-3 is flat, level 4-5 is d4, level 6-7 d6, level 8-11 is d8, level 12-19 is d12, level 20 is d20"

**Implementation notes:** `getSkillDieType()` in `lib/dice-utils.ts` must match this exact progression table. No d10 in the progression. Level 20 is the only level with d20.

---

### 1.5 — Short Rest: Deplete 1 Frequency, Heal 1 to All Others

**Decision: Short rest depletes 1 from Frequency pool (current, not max) and heals every other attribute by 1 point. May change to a more complex system in the future.**

> "Currently it is 1 point from frequency pool (THIS ISN'T SPENDING FREQUENCY (MAX POOL) just depleting the pool) heals every other attribute 1 point. This however may be changed in the future to number 3. still debating."

**Implementation notes:** Build the simple version (1 Frequency depleted = +1 to all 8 other attributes). Depletion reduces current pool only, never max. Design the rest system to be swappable if Mike adopts the pillar-specific rest model later.

---

### 1.6 — Combat Action Economy

**Decision: ActionMod base is 0 (modified by items/traits only). Actions generally cannot transfer between pillars, but any action can be used as movement. Multi-pillar skills can be used but effort is restricted to the matching action type's governors. Grid-based, 5ft squares.**

> ActionMod: "Yeah these are from items and traits base is 0"
> Cross-pillar: "Generally no. Any action can be used as movement though. (Skills that have governors from multiple pillars may be used but effort can only be put into the roll for that skill from the matching action type)"
> Positioning: "grid 5ft squares"

**Implementation notes:** Default ActionMod = 0. Movement is not a separate resource; any action can become movement. Multi-pillar skills require effort tracking per pillar type within a single roll. Grid system = standard 5ft squares (likely AI-generated encounter maps on canvas).

---

### 1.7 — KRMA Reserves: 100 Billion Total

**Decision: 100B total KRMA is correct with the current app split (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%). May change before release.**

> "100B is total and app has current split. this may change by the time release happens."

**Implementation notes:** Keep current genesis seed as-is. Build reserve system to support re-seeding if percentages change. No action needed now.

---

### 1.8 — Energy Damage Type (Not Electric)

**Decision: The damage type is "Energy." Electric is deprecated terminology.**

> "Energy. Electric is old wording"

**Implementation notes:** Replace all references to "Electric" with "Energy" in material properties, damage types, and UI labels. The 7 damage types are: Piercing, Slashing, Hacking, Crushing, Bludgeoning, Corrosive, Energy.

---

## 2. Combat & Resolution Decisions

---

### 2.1 — Skill Levels 1-3 Confirmed as Flat Bonuses

**Decision: Yes, levels 1-3 are flat +1/+2/+3. No Skill Die until level 4.**

> "Yes"

**Implementation notes:** Already implemented correctly. No changes needed.

---

### 2.2 — Death System: Fated Age + Combat Death Saves

**Decision: Two separate death systems. (1) Fated Age: annual background rolls (Health Level + mods vs Lady Death) starting at Fated Age; failure = aging Thorn; 3rd failure = death of old age. (2) Combat death: FD + Health Level vs Lady Death; success restores 1 Frequency but often incurs a Death Blossom with temporary penalties.**

> "These are not saves. Fated Age determines when these rolls begin. Every year (game time) the character lives starting at fated age and up a roll is made in the background against lady death. Essentially their Health Level + any mods vs her roll. If her roll is higher then the character receives a thorn given to by her (represents aging) on the 3rd failure they die of old age. Death saves from combat and injury are still against lady death but handled differently. They involve FD plus Health Level against her roll. If success then they restore 1 Frequency but often have a Death Blossom that incurs temporary penalties."

**Implementation notes:** Two distinct systems in code: `agingCheck()` (background, annual, HL + mods vs Lady Death) and `combatDeathSave()` (FD + HL vs Lady Death). Aging Thorns are a specific Thorn type. Death Blossoms are temporary penalty traits from surviving combat death. Lady Death has her own roll (not a fixed DC).

---

### 2.3 — Death Split: Full Character Decomposition

**Decision: Everything about the character is split, not just attributes. Body attributes -> GM as KRMA. Spirit: Frequency (MAX) -> Lady Death; Flow and Focus remain in Spirit Package. Soul: 50% -> GM as KRMA, 50% remains in Spirit Package. Lost-on-death Nectars -> KRMA to the Godheads who provided them. Other Nectars stay in Spirit Package. Skill levels split by governing pillar following the same rules as attributes.**

> "SO this isn't just attributes that are split: it is everything about the character: Attributes: Body pillar all points go back to GM, Spirit: Frequency (MAX not current as current would be 0) goes to Lady Death. Flow and Focus remain in SPIRIT PACKAGE (not soul package). Soul is split 50% GM and 50% remains as those attributes in the Spirit package. Nectars that are marked as lost on death return as KRMA to the GODHEADS who provided them. The ones that aren't are kept as is on the character Spirit Package. Skill Levels are divided based on what the pillars they are governed with the same movement as Attributes."

**Implementation notes:** Death split service must handle: attributes (by pillar), Frequency max (to Lady Death), Nectars (check lost-on-death flag -> Godhead KRMA or Spirit Package), skills (split by governor pillars). Note: it is "Spirit Package" not "Soul Package." 1 attribute level = 1 KRMA for conversion purposes.

---

### 2.4 — Frequency: Three Operations (Spend, Deplete, Burn)

**Decision: Frequency has three distinct operations. Spend: upgrades character (reduces max permanently). Deplete: damage absorption (reduces current, not max). Burn: alters dice/consequences (KRMA is destroyed permanently, like burning crypto; hard metaverse-wide limit with meta-gameplay consequences).**

> "Frequency is essentially the Characters Reserve KRMA it acts as their last health pool (doesn't remove the max) and as upgrade currency (removes the max) A better wording would be like Spend: used to upgrade any aspect of the character (depletes actual frequency max), deplete: (used when taking damage and doesn't reduce max but changes current pool value. Burn: Special instance that changes outcomes of dice rolls or alters consequences or events (this is a special thing and it actually burns it as in no one gets it. (burning KRMA essentially like Crypto) There is a hard limit on amount of burning that can be done in the entire metaverse and it has meta gameplay consequences)"

**Implementation notes:** Three Frequency operations in code: `spendFrequency()` (max -= N), `depleteFrequency()` (current -= N), `burnFrequency()` (current -= N, KRMA destroyed globally, check metaverse burn cap). Burn tracking needs a global ledger. Burn cap is a system-wide constant with gameplay consequences when approached/reached.

---

### 2.5 — GROWTH Acronym: GRO.vines + WTH Meta-Levels

**Decision: G = Goals, R = Resistance, O = Opportunity (GRO = GRO.vines for traits and Frequency Max increases). W = Wealth, T = Tech, H = Health (WTH = meta-level "levels" of a character). The Thread model from brainstorming is NOT canonical.**

> "No all of that was brainstorming. G = Goals, R = Resistance, O = Opportunity. W = Wealth, T = Tech, H = Health. GRO represents GRO.vines that the characters use to get new traits, and increase their Frequency Max. WTH represents the Meta level 'levels' of a character"

**Implementation notes:** Discard the entire Thread model (Goal/Ritual/O/Worry/T/H with KV tracking). GRO.vines = character growth system (traits + Frequency Max). WTH = Wealth/Tech/Health levels (already partially built as 1-10 scales). These are the two halves of character progression.

---

### 2.6 — Values & Addictions: Not In Current System

**Decision: Values and Addictions do not exist in the current system. Far future content only.**

> "Values and Addictions do not exist in current system. simply an idea for far future content"

**Implementation notes:** Do not build. Remove any references from active design docs or schemas. Archive the concept for future reference only.

---

### 2.7 — Depletion Conditions (All 9 Defined)

**Decision: All 9 depletion conditions are now fully specified.**

> Full list from Mike:
> - Weak (Clout=0): Carry Level becomes 1
> - Clumsy (Celerity=0): DR 5 FD check before any action; fail = hesitate + GM negative outcome
> - Exhausted (Constitution=0): All ability point costs doubled
> - Muted (Focus=0): Cannot add Effort to rolls
> - Death's Door (Frequency=0): FD + Health Level vs Lady Death
> - Deafened (Flow=0): Cannot roll dice for any checks
> - Overwhelmed (Willpower=0): Cannot take Short Rest; all recovery effects restore half (round down, min 1)
> - Confused (Wisdom=0): No color code hints, no Oracle assistance, forced upfront wagering
> - Incoherent (Wit=0): Must use Unskilled checks only

**Implementation notes:** All 9 conditions need enforcement in the check/combat systems. Confused is particularly complex: disables Terminal color hints, disables Oracle, forces effort wagering before any roll (like unskilled flow). Deafened = checks become effort-only (no dice at all). These are status effects triggered automatically when an attribute hits 0.

---

### 2.8 — Contested Checks: Ties Favor Defense or Initiative

**Decision: Both sides roll normally. Ties: defensive side wins. If both offensive, initiative decides (AI-driven initiative stack considering conditions and character state). Massive margin bonuses are not inherent but can come from traits or items.**

> "Yes. ties are decided: If one side is defensive in nature then the defensive side wins. If both are opposing offensively then it is determined by initiative (This is a complex system (AI driven initiative stack that takes into consideration everything about conditions and the characters) Massive margin bonuses are not inherent but could be added by something based on traits, or items."

**Implementation notes:** Contested check resolver needs: tie-breaking logic (defensive wins, else initiative order), no built-in massive margin bonuses. Initiative system is AI-driven and complex — defer full implementation, use simple tiebreak for beta.

---

### 2.9 — Armor Multipliers: Based on Item Type, Not Layer

**Decision: Resist multipliers come from the item type (Heavy Armor = 1.5x base resist), not from abstract armor layers.**

> "not the layer they are based on the item type. So a material used to craft Heavy Armor would be 1.5x its base resist"

**Implementation notes:** Armor resist calculation: `material.baseResist * itemTypeMultiplier`. Heavy Armor = 1.5x, Light Armor = 1x, Cloth = 0.5x (multiplier lives on the item type definition, not a layer system). Update Forge crafting calculations accordingly.

---

### 2.10 — Max Effort Confirmed

**Decision: Yes, max effort per check = Skill Level + Fate Die Maximum (as detailed in 1.3).**

> "yes, I explained in more detail on a previous question."

**Implementation notes:** Already covered by decision 1.3. Single validation check in dice service.

---

### 2.11 — Materials: KRMA-Graded Cost, Not Discrete Tiers

**Decision: Materials are not tiered. Each material has a continuous KRMA cost from .0000000000001 to .9999999999999 based on KRMA grading.**

> "These aren't tiers really just the cost of essentially 1 'unit of a material' .0000000000001 to .9999999999999 based on KRMA grading of the material"

**Implementation notes:** Remove tier-based material categorization. Material cost = continuous decimal KRMA value (13 decimal places of precision). Material "tier" in UI is just a convenience label derived from cost magnitude, not a game mechanic. KV grading determines placement on the scale.

---

### 2.12 — Wealth Level Purchase System (Check-Based)

**Decision: Wealth Level > item value = purchase freely (GM/AI discretion for absurd quantities). Wealth Level = item value = remove 1 check (3 checks lost = drop 1 level). Purchasing 1 level above = costs 3 checks (equivalent to 1 full level). Checks restored through narrative. Wealth Levels gained through big narrative moments. No "one item above your level" limit.**

> "Wealth Level > than item value level purchase freely (within reason AI and GM discretion)... Wealth level = item value (remove 1 check from wealth (not same as a level) 3 checks gone it drops a level (Checks are restored through narrative etc) Wealth Levels are gained via big wealth narrative moments... only one item above your level at a time is not true. Purchasing an item 1 level above your wealth level is essentially 3 checks or 1 whole level down."

**Implementation notes:** Wealth system needs: level (1-10), checks (3 per level). Purchase logic: above level = free, equal = -1 check, 1 above = -3 checks (or -1 level). Check restoration is narrative (GM action). No hard limit on above-level purchases. Build as a service with GM override capability.

---

### 2.13 — Spirit Package and Attribute-KRMA Equivalence

**Decision: Attributes are crystallized KRMA (1 attribute level = 1 KRMA). The Spirit Package retains attributes as attributes; "lost" portions return to GM or Lady Death as KRMA.**

> "I think I already answered this in detail but remember Attributes are essentially KRMA crystallized on a character. 1 attribute level is 1 KRMA so a Spirit package retains them as attributes and the ones 'lost' go back to gm or lady death as KRMA"

**Implementation notes:** The 1:1 attribute-to-KRMA conversion is fundamental. Spirit Package is a data structure containing: Flow, Focus, retained Soul attributes (50%), non-lost Nectars, and pillar-matched skill levels. Death split math is straightforward given this equivalence.

---

## 3. Character System Decisions

---

### 3.1 — GROWTH Acronym: GRO.vines and WTH Levels

See decision 2.5. GRO = Goals/Resistance/Opportunity (GRO.vine progression). WTH = Wealth/Tech/Health (meta-levels).

---

### 3.2 — Mana Is a Separate Resource

**Decision: Mana is its own tracked resource, separate from Frequency. Regained through mechanical and narrative means. Has an associated KV value (TBD with balancing).**

> "Mana is a separate resource. It is regained through various mechanical and narrative ways. It still has a KV value associated with it (TBD with balancing)"

**Implementation notes:** Character sheet needs a Mana pool field. Mana regeneration rules are TBD — build the pool tracking now, leave regen mechanics for the magic system phase. KV grading applies to Mana (cost/value of magical energy).

---

### 3.3 — Harvests: Similar to Branches in Character Creation

**Decision: Harvests function similarly to Branches during character creation, offering the same types of progression options.**

> "They act very similar to branches in character creation. they will have all those types of things."

**Implementation notes:** Reuse Branch data structures and UI patterns for the Harvest system. Harvests = between-arc character growth using the same mechanical framework as creation-time Branches.

---

### 3.4 — Fated Age: See Character Creation Examples CSV

**Decision: Fated Age data (including Health Levels per Seed) is in the Character Creation Examples CSV.**

> "see character creation examples I mentioned earlier"

**Implementation notes:** Parse Health Level and lifespan data from `C:\Projects\GRO.WTH\docs\Character Creation Examples.csv`. Fated Age = 60-80% of effective lifespan (2d100 roll by Lady Death at character creation).

---

### 3.5 — Inventory: Equipped Slots + Inventory + Possessions

**Decision: Three-tier system. Equipped slots = body regions (Head, Body, Upper/Lower Left/Right Arms, Upper/Lower Left/Right Legs — customizable per Seed). Inventory = carried items using Weight system (levels 1-10). Possessions = owned but not carried (houses, vehicles, etc.).**

> "So we have equipped slots, inventory, and possessions. Equipped slots and inventory use the Weight system 1-10 levels... possessions are things they own but don't carry like houses, vehicles... Equipped will be based on generalized areas. For a humanoid that is Head, Body, Upper Left Arm, Lower Left Arm, Upper Right Arm, Lower Right Arm, Upper Left Leg, Lower Left Leg, Upper Right Leg, Lower Right Leg. This will need to be customizable and made during Seed Creation so the gm should be able to make different regions and place them in a paperdoll sense. Tails, wings, etc."

**Implementation notes:** Equipped slot regions are defined per Seed (not hardcoded). GM creates custom body region maps during Seed creation (paperdoll editor). Default humanoid has 10 regions. Non-humanoid Seeds can have tails, wings, extra limbs, etc. Weight system applies to both equipped and inventory items.

---

## 4. Economy & KRMA Decisions

---

### 4.1 — Godhead Dummy System Required for Beta

**Decision: A basic Godhead system must exist for beta because it is the backbone of GRO.vines. Blossoms cannot exist without it.**

> "We will have to have at least a Godhead dummy system in place because that is the backbone of GRO.vines."

**Implementation notes:** Build a simplified Godhead system for beta: GM acts as proxy Godhead, manually bestowing Blossoms/Thorns. The system must track which Godhead provided which Nectars (needed for death split KRMA return). Full AI Godhead personality is post-beta.

---

### 4.2 — KV System Must Be Fully Functional

**Decision: The KV (KRMA Value) system is the backbone of the entire game and must be fully functional. It is the starting point for the Godhead system.**

> "The KV system will have to be fully functional and is basically the backbone of the entire game. It is our start to the Godhead system too."

**Implementation notes:** KV grading is not optional or deferrable. The current TKV evaluator needs to evolve into a full KV system. Every created entity (items, materials, spells, traits, Seeds) gets a KV grade. This is the foundation that Godhead AI personality grading layers onto later.

---

### 4.3 — Synchronicity: Secret GM Metric

**Decision: Synchronicity is a hidden metric the GM can see but is not explained to them. Labels GMs as content creator, consumer, or balanced. Future effects TBD.**

> "yes this is a sort of secretive metric that the gm can see but not explained. It is essentially a way for the system to label a content creator, consumer, or perfect balance. (It will have varying effects in the future)"

**Implementation notes:** Track content creation vs consumption ratio per GM. Display as an unexplained metric in Watcher Console (no tooltip, no explanation). Effects are deferred — just track and display for now.

---

### 4.4 — KRMA Subscription Diminishing Curve: Post-Beta

**Decision: Confirmed as post-beta economics design.**

> "Yes"

**Implementation notes:** No action needed for beta. Document the vision: subscription KRMA generation follows diminishing returns over time, eventually making social/creative contributions the primary KRMA source.

---

## 5. UI/UX Decisions

Mike's general note on UI/UX: *"We have already designed a lot in the app that shows the direction of UX/UI design. Aesthetics can be referenced from the GROWTH Rulebook too."*

---

### 5.1 — Combat: Canvas-Based with Special Cards

**Decision: Combat takes place on the Canvas using special cards — AI-generated Encounter Maps, Initiative Order cards, etc.**

> "Combat will take place on the Canvas via special cards (Encounter Maps (AI GENERATED), Initiative order cards, etc)"

**Implementation notes:** No separate combat screen. Build new card types: EncounterMapCard (AI-generated grid), InitiativeCard (turn order display). Combat is a canvas mode, not a different view.

---

### 5.2 — Player Canvas: Fog of War on Cards

**Decision: Players see the canvas with their own card positions. Other cards are progressively revealed as their character learns things (portrait first, then name, then possessions, etc.). Essentially character-level fog of war.**

> "Players see the canvas too but they have their own positions for their cards they control... They are revealed other cards as their character learns about things. So an NPC they meet might just be their portrait at first, then name, then maybe some of their possessions... Essentially character sheets and cards with their own 'fog of war'"

**Implementation notes:** Each card has per-player visibility levels (hidden, portrait-only, name+portrait, partial stats, full). Players have independent card positions. GM controls reveal state per player per card. This is a significant data model addition.

---

### 5.3 — Effort Wager Flow

**Decision: Skill Die rolls openly -> player sees result + Terminal color hint -> wager effort from allowed pools -> confirm -> Fate Die rolls -> results calculated -> GM sees success/fail.**

> "So a button next to the skill would roll, They would see a popup of the result and the Terminal Hint in that same popup they could wager points from fields they are allowed to wager from. Then confirm and their fate die would be rolled and results would be calculated and the gm would see if they succeeded or not, and continue the narration."

**Implementation notes:** Check flow is a multi-step modal: (1) Roll SD (visible to all), (2) Show SD result + color-coded Terminal hint in popup, (3) Effort wager fields (only eligible governor pools), (4) Confirm button, (5) FD rolls server-side, (6) Total calculated, (7) GM sees pass/fail. DR is never revealed to player directly.

---

### 5.4 — Player Terminal: Filtered Feed

**Decision: Players see a character-relevant feed — their rolls, results, and party member activity. Not the full GM feed.**

> "They would see a feed for them. They wouldn't see all changes like the GM would. Character relevant, rolls and results from them and their party members."

**Implementation notes:** Terminal feed filtering per role: GM sees everything, players see only events tagged to their character or party. Build event tagging system (character ID, party visibility flag).

---

### 5.5 — Magic: Text-Based Initially, AI-Determined DR

**Decision: Magic casting starts as text input. AI determines DR with GM input. Eventually moves to voice (always-on mic).**

> "This will probably be text based at first but move into always on Mic. Yes essentially the AI determines the DR of the spell etc with GM input."

**Implementation notes:** Beta magic: text input field -> AI parses intent -> suggests DR to GM -> GM confirms/adjusts -> standard check flow. Voice input is post-beta.

---

### 5.6 — Dice Visualization: Player Toggle

**Decision: Players can toggle 3D dice display: party + theirs, just theirs, or none.**

> "players can toggle it (Party members and theirs, just theirs, none)"

**Implementation notes:** Three-state dice visibility toggle in player settings: "All party", "Mine only", "None". Stored per-user. 3D dice are always visual-only (server authoritative).

---

### 5.7 — Session Start: Active Indicator + Recording

**Decision: Session start shows an "active" indicator somewhere and begins recording all inputs. Tools for GM to show/play recap.**

> "Yes Session active somewhere. The system would start recording inputs/etc. There will be tools for GMs to show/listen to recap etc."

**Implementation notes:** Session model needs: `isActive` flag, `startedAt` timestamp, event log recording. GM tools: recap generation, playback. "Session active" indicator in canvas UI.

---

### 5.8 — NPC Cards: Identical to Player Cards

**Decision: NPC cards are exactly the same as player cards.**

> "NPC cards are exactly the same as players."

**Implementation notes:** No separate NPC card component. Use the same CharacterCard for NPCs and players. Differentiation comes from visibility/fog-of-war, not card design.

---

### 5.9 — Character Sheet: Expanding Card with Sub-Panels

**Decision: Already designed — a card that expands with sub-panels. Just needs wiring.**

> "We have already designed this mostly it just isn't completely wired or done. It is a card that expands and then has sub panels"

**Implementation notes:** Existing CharacterCard implementation is correct direction. Focus on wiring data to the sub-panels rather than redesigning layout.

---

### 5.10 — Real-Time: WebSocket Worth It

**Decision: Yes, WebSocket for actual real-time results and input.**

> "Yes websocket is probably worth it if you mean actual realtime results and input."

**Implementation notes:** Add WebSocket infrastructure for: dice rolls, combat updates, Terminal feed, card reveals. Replace 30s KRMA polling with WebSocket push. This is a significant infrastructure addition — plan as its own phase.

---

### 5.11 — KRMA Display: KV on Known Things, GM Balance Hidden

**Decision: Players see KV values on things their character knows about. GM's KRMA balance is GM-only knowledge.**

> "Player will see KV on things their character knows. GM KRMA balance is just GM knowledge"

**Implementation notes:** KV display is gated by character knowledge (fog of war system). Player never sees GM's KRMA pool. KV appears on items, materials, traits that the character has encountered/identified.

---

### 5.12 — Mobile: Desktop-First, Mobile Post-Beta

**Decision: Desktop-focused. Mobile comes post-beta. Web app may work passably on mobile as-is.**

> "most desktop focused with mobile post beta (it is a web app so it could sort of work on mobile out the gate)"

**Implementation notes:** No mobile-specific work for beta. Use responsive CSS where easy but don't optimize for it. Canvas interaction assumes mouse/keyboard.

---

### 5.13 — Audio: Simple for Beta

**Decision: Simple audio for beta. Eventually AI-generated encounter music, plus local file support.**

> "Audio can be simple for beta, but eventually AI audio too for encounters music etc, as well as local files."

**Implementation notes:** Beta: basic SFX (dice, notifications). Post-beta: AI audio generation, ambient music, local file upload for GMs.

---

### 5.14 — Onboarding: Simplified Tutorial + Backstory Prompts

**Decision: Simplified tutorial, structured backstory prompts, GM assigns Seed/Roots/Branches, initial character sheet generated from those, player and GM discuss and agree, GM crystallizes the sheet. AI portrait generation available.**

> "Simplified tutorial, Backstory prompts, GM will create/assign seed, roots, branches and then the player cs is initially created from them. the player and gm can discuss and agree on things then GM can confirm and crystallize the sheet into the campaign. Player will also have options like character profile creation with AI generation"

**Implementation notes:** Character creation flow: (1) Tutorial, (2) Backstory prompts, (3) GM assigns Seed/Roots/Branches, (4) System generates initial sheet, (5) Player + GM discussion phase, (6) GM confirms/"crystallizes" into campaign. Crystallization = locking the character sheet as active.

---

### 5.15 — GM Content Creation: Canvas + Templates + AI

**Decision: Canvas-based creation, community templates via server, and AI-assisted generation — all at once.**

> "Canvas, templates (via server the community), and AI assisted all at once"

**Implementation notes:** GM creation tools: right-click canvas to create, template browser (server-hosted community templates), AI generation from description. All three methods available simultaneously.

---

### 5.16 — GRO.WTH Dot: Not a Direct UI Concept

**Decision: The dot is thematic, not a UI separator. It appears in the logo and through existing systems (GRO.vines, WTH levels).**

> "It will come through. it isn't a direct UI concept. The logo has it, the cs already has GRO.vines and WTH levels"

**Implementation notes:** No special UI treatment for the dot. It emerges naturally through the GRO.vine and WTH level systems already in the character sheet.

---

### 5.17 — Terminal Injection: Godhead + Terminal Lore/Rule Injection

**Decision: Metaverse injection is broader than just spells. It is lore and rule injection from Godheads and The Terminal. Not incredibly frequent but high-level spells are a good example.**

> "So Metaverse injection isn't just spells but yes. it isn't incredibly frequent but high level spells is a good example. It is essentially lore and rule injection from Godheads and The Terminal"

**Implementation notes:** Terminal injection system: messages from Godhead/Terminal entities appear in campaign feed. Triggered by high-power events, not just spells. Build as a message type in the Terminal feed with special styling.

---

### 5.18 — Magic Schools: 10 Universal Schools + Woven Spells

**Decision: There are 10 schools of magic, same across all tables. Woven spells are governed by skills and allow contextual framing (flavor varies, mechanics don't).**

> "There are 10 Schools of magic. Woven spells allow for the sort of context framing you are talking about as a woven spell is governed by a skill. but the 10 schools of magic are the same across tables."

**Implementation notes:** 10 magic schools are universal constants (need specific list from Mike or repository). Woven spells = skill-governed magic that allows narrative reflavoring. School definitions are global, not per-campaign.

---

### 5.19 — Forge: Player View = Request System

**Decision: Players see the Forge but only their requests, known elements, their own traits, revealed party/NPC traits, and known materials. Forge for players is primarily a request system to the GM.**

> "SO the players will see the Forge but will only see their requests essentially and any elements their character knows about, their own traits, revealed party member traits, revealed npc traits, materials they know about, etc. So the forge for them is used primarily to make requests for things to the GM."

**Implementation notes:** Forge has two modes: GM (full creation tools) and Player (filtered view + request submission). Player Forge filters all content through character knowledge. Request system: player describes desired item/trait -> GM receives in their Forge queue -> GM crafts or denies.

---

## 6. Deferred Systems (Confirmed Post-Beta)

These decisions confirm systems that are NOT being built now but are part of the long-term vision.

---

### 6.1 — Character Retirement -> AI Agent
**Status:** Far future.
> "yes this is far future"

---

### 6.2 — Cross-Campaign Invasions
**Status:** Post-launch update. Some GM shared simulation space may exist at or near launch.
> "post launch update, although we may have some GM shared simulation space in or near launch."

---

### 6.3 — Values & Addictions System
**Status:** Far future content. Not in current system.
> "Values and Addictions do not exist in current system. simply an idea for far future content"

---

### 6.4 — EtehrNet Consciousness Interface
**Status:** Launch marketing, most likely.
> "This will be for launch marketing most likely"

---

### 6.5 — Environmental Rest Resonance
**Status:** Not a formal system. Resting may be affected by environment contextually based on GM and conditions.
> "Idk where you got this from. That isn't to say resting won't be affected by the environment but that will be contextually based on GM and conditions."

---

### 6.6 — Lucidity Mechanics
**Status:** Confirmed — do NOT build or document. Intentionally secret.
> "correct"

---

### 6.7 — Canvas Visual Grammar
**Status:** Will develop organically through building and testing. No formal wire/visual grammar system planned.
> "Idk about that visual grammar part. Cards will all have similar styling. We will have lots of different cards... This entire system is something that will develop organically as we build and test."

---

### 6.8 — KRMA Subscription Diminishing Curve
**Status:** Post-beta economics.
> "Yes"

---

*This document is a permanent reference. No further questions pending.*
