# First Test with Violet: what's left (audit 17 Oct 2026)

**Goal (Mike, 17 Oct):** run the first test with Violet within a week (by ~24 Oct).

**Sources.** Three read-only sweeps on 17 Oct:
- every memory note since August, plus the critical older ones;
- ROADMAP and the design/plan docs;
- the app code and Violet's live data: database reads, a full test run, a type check.

Nothing was changed by the audit.

**Verdict:** **Yes, a first test inside a week is possible, if we agree what the test is.**
- **Possible this week:** one scene, Mike as Watcher, Violet AI-run in her own apartment. That is about 4–5 days of build plus a handful of Mike decisions.
- **Not possible this week:**
  - the "full" first game: the three novel worlds, her alters, the anonymity translator tested with sensitive subjects, and a Pattern Stability ledger;
  - several days of Mike authoring the novels' stories, on top of the build.

---

## 0. What the first test IS (scope to confirm)

From Mike's rulings:
- Mike GMs as Watcher. The AI GM is parked.
- Violet is played by AI through DAYA. She has no idea she is in a game: "the mechanics are the simulation she lives in."
- Blind play is OFF (10-11): "Don't worry about me playing violet blind."
- **The four-beat table:**
  1. Mike narrates.
  2. Every being listens through its own perception.
  3. The ask: one streamed answer, with first words in ≤2 s.
  4. A check, then the result.
- **Truth order:** a ledgered fact beats a GM declaration, which beats a sim inference. Canon is never erased.
- **The bigger "first game" (10-16):**
  - Violet's three novels become three campaigns, and her alters come from them.
  - Sensitive subjects test the anonymity wall and the mature censor.
  - Pattern Stability gets tracked.

**Proposed scope for Test 1 (to confirm):**
- **Where:** the Incubator, at Violet's studio.
- **Who:** Mike as Watcher. Violet AI-run. Rosemary is dead or absent (see B5). Mike voices anyone else.
- **What happens:** 1–3 scenes of ordinary life, at least one skill check, and time passing (a narrated jump).
- **Excluded:**
  - no sensitive subjects, until the translator wall exists;
  - no combat, until the damage/KV scale is re-anchored;
  - no novel worlds yet.

Each later test adds one of the excluded pieces.

---

## A. Hard blockers: the test can't happen without these

| # | Item | Status | Who | Effort |
|---|---|---|---|---|
| A1 | **Portrait.** Settle the bust framing for the 2:3 frame, repaint at 1024×1536, approve it onto `Character.portrait`, set `GENESIS_PORTRAIT_GATE=on`. Right now her portrait field points at a training-folder thumbnail, `approvedPortraitPath` is empty, and there are 0 generation rows. | the 2 proofs are the old 864×944 shape | Mike: framing call, OK to spend. Me: prompt and run. | ½ day |
| A2 | **4th GRO.vine.** The fix shipped (73cf120); right-click → Complete. | needs Mike's click (JEWL cloud call) | Mike | minutes |
| A3-done | **DONE 17 Oct.** 89 memories dated from their own text (ages 3.5 → 24.99); source tags normalized; `daya_seed_memory` now takes `atAge`. **NEW, Mike to decide:** two genesis runs left TWO conflicting biographies. Rows from the older runs (Rosemary dies "Tuesday" vs "Thursday in March"; one self-published book with 47 downloads vs the THREE published novels of the newest run) sit beside the new ones. | decision |
| A3 | **Her memories are all at cycle 0.** All 93 are dated "now", but she was born at cycle −25. Recall by time ("when I was a girl…") and fallible memory need dates. Build a re-dating pass that places each genesis memory in her life, using its source (item/mark/place/person story), her blocks' years and the root/branch timeline. Also fix the source tags, which are written two ways (with and without brackets; 4 items have a memory under both). | not built | me (deterministic plus a JEWL pass; ask before spending) | ½–1 day |
| A4 | **Session start has never been run in the Incubator.** 0 GameSession rows. The only way in is typing `/session start`, and the TABLE tab only appears while a session is open. Add a Start/End Session button, then do a **dry-run session**. | code exists, never exercised | me + Mike rehearsal | ½ day |
| A5 | **Table loop speed.** `TABLE_SPLIT_LOOP` is off, so the old serial loop runs at ~50 s per turn (10-01 measurement). Turn it on and run the U2d live harness (billable). Check the cold-start overlay and keep-warm (~100–340 s cold start). | built behind the flag, never run live | Mike: OK to spend, plus the 4 owed U2c answers | 1 day |
| A6 | **Production-build breaker.** `api/portraits/paint/route.ts:12` exports `DRESS_FIRST_MESSAGE`, which Next.js forbids in a route file. | bug | me | minutes |
| A7 | **3 failing tests.** `character-genesis-born.test.ts` has two (Born→ACTIVE times out; "a wake failure never blocks Born" throws a null error). `sketch-genesis.test.ts` has one (markForDeepening times out). 1973 of 1976 pass. | bug | me | ½ day |
| A8 | **Consent / network mode.** Mike's META consent is false, so Incubator traces go to quarantine. Choose: set consent and play META, or play DISCONNECTED (every feature still works). | decision | Mike | minutes |
| A0 | **RunPod balance is empty** (17 Oct ~10:50 UTC: `Local lane error (402): Insufficient Balance`). JEWL's local text lane (`DAYA_L1_URL` api.runpod.ai), Violet's being lane and the serverless portrait painter all run there. Nothing at the table works until it is topped up. | **blocker** | Mike (billing) | minutes |
| A10 | **Mike is "seated" in Violet.** She is owned by Mike's ADMIN account, and the per-viewer feed treats a user's newest PLAYER_CHARACTER as their seat (`perceived-feed.ts:42`). So the Watcher could get Violet's perception instead of the truth, and her "AI-run" status is ambiguous. Fix: the GM/Watcher always gets the truth feed, regardless of what they own. Alternatives: move her to an AI/GODHEAD owner, or give her an explicit "no seat" controller. The Incubator has 0 members and the controller route has no UI. | bug | me | ½ day |
| A9 | **Her places are all in PLANNING.** 4 locations sit below the line, uncrystallized. Crystallize the studio, and the rooms the scene uses, before play. | data | Mike (KRMA click) or me via the route | minutes |

## B. Violet's data: should fix before the test

| # | Item | Status |
|---|---|---|
| B1 | **Wardrobe gaps.** She wears a tee, sweater, cardigan, jeans and boots, but no underwear, no bra and no socks. Her cash is also stored twice: in `wealth` and as a "cash in her wallet" item. The jeans are equipped to `Body/Left Upper Leg` only; a spanning garment should cover both legs (the region JEWL picks beats the spanning rule). Fix the spanning rule in the equip path, then add the missing garments from her wardrobe kit. | bug + data |
| B2 | **The genesis order on her sheet is backwards.** VINES was stamped at 03:52, before WORLD (06:36) and MEMORIES (06:37), which is the opposite of Mike's 9-step order. Her vines were chosen before her rerun world existed. Consider re-choosing the vines after A3 (Complete only fills the empty slot). | decision |
| B3 | **The legacy body map sits beside the new anatomy.** `vitals.bodyParts` coexists with `bodyAnatomy`. Pick one; the new one is canon. | cleanup |
| B4 | **Her wealth lines are on the old scale.** Her root/branch `accumulatedWealth` and cash rate predate the regrade, and the currency ruling (17 Oct: a dollar is belief, not stored KRMA) changes what accumulatedWealth means. Not needed for an ordinary-life scene; needed before anyone counts money. | decision pending |
| B5 | **Rosemary Marsh** (her grandmother) is a DRAFT NPC with no AI-being record, and isn't marked `tableHidden`. Seeding her memory would bounce (`daya/authoring.ts:278`). Is she dead? If so, she's a memory and not a seat: mark her deceased/retired. If alive, make her an AI being. | decision |
| B7 | **TKV is wrong.** The card shows 244, but her blocks sum to 408 (−79 thorns) and her items count 0. Mike, 17 Oct: "TKV should be everything. Everything she owns, her, all of it." Canon check in progress, then fix `calculateCharacterTKV` / facts to count traits, owned and held things, and whatever else canon says. The box position was fixed 17 Oct (now straddles the portrait's bottom edge). | in progress |
| B6 | **Her character KRMA wallet is 0** (the campaign wallet holds 100,000). Check that nothing in play (Burns, Frequency spends) needs her wallet. | check |

## C. The table loop: what works vs what's missing

**Works (code verified):**
- sessions (by command);
- per-viewer feed + live stream (`PERCEPTION_FEED` on);
- GM-started skill checks and contested checks with server dice;
- encounters, initiative and rest;
- AI characters answering GM speech (`DAYA_ENABLED` on);
- the campaign clock: `advanceClock`, a JEWL clock tool, automatic advance from encounter rounds and bridges. The handoff note saying "sim advances time NOT BUILT" is out of date, but the Incubator clock has never moved (currentCycle 0).

**Missing or partial, by importance for Test 1:**
1. **Narrated time jumps and per-action durations** ("that evening…", "three days pass"). Not built. **Decision owed:** base durations (proposed: speech 6 s, action/check 1 min, short rest 1 h, long rest 8 h); how jumps are inferred from prose. *Needed if the test spans more than a few minutes.* ~1 day.
2. **OOC / table-talk filter.** Ruled, not built. Everything typed counts as in character. *Workaround for Test 1:* Mike keeps out-of-character talk in the terminal or another window. Defer.
3. **JEWL has no roll / skill-check / narrate tool.** Mike calls checks himself (that works). Fine for Test 1.
4. **U2c-5: JEWL's "mistake or new?" read on spoken chunks.** Not built. Fluid canon still works on typed narration. Defer.
5. **AI beings act only when spoken to.** Nothing makes Violet act on her own between asks. That fits the ruling "beings speak when asked or named" (10-06). Fine for Test 1.
6. **The planning board lives in memory only** and is lost on restart (U3). Don't restart mid-session.
7. **U4 (mirror overlay, fog follows memory, GM see-in):** not built. Defer.
8. **Narration reads speech only:** the engine reads speech, not NPC actions, and matches entities by name only. Mike should name Violet when addressing her.
9. **Perception attunement** may still be a flat 0.8. Check before the test; low priority.
10. **Seating a human in Violet: no UI.** The controller route exists, but the Incubator has 0 members. Not needed if Violet is AI-run; needed for a later test with a seated player.

## D. Canvas character sheet (Mike's cleanup list, 17 Oct)

**Done (73cf120):** possessions off the main card; ghost tethers; KRMA/Backstory tabs removed; the tab bar follows the vines; skill points per pillar; no "+ add trait"; the 2:3 portrait frame; every vine slot filled.

**Remaining:**
| # | Item | Status | Effort |
|---|---|---|---|
| D1 | **Vitals & Equipment** ("needs the most work"). `VitalsCard` reads only the legacy flat body map, shows the same resist on every part, and ignores `bodyAnatomy` and worn layers. Worn layers per part DO work off-canvas (`CharacterTab.tsx:1340-1392`, `Paperdoll.tsx`) and can be reused. Needs a design pass with Mike: body tree to fingers and toes, organs internal, layers ON/OVER each part, resist per part, conditions. | needs a design pass | 1–2 days after the design |
| D2 | **Inventory card.** Shows material, condition, weight, resist, damage, value and abilities. Missing: KV, volume, capacity, worn location, state, quantity, **container contents** (the wallet's cash, the drawer's things). The equip toggle doesn't record where an item is worn, and Remove is wired but never called (`InventoryCard.tsx:250`). Mike to name the "buggy" parts. | partial | 1 day |
| D3 | **FIGURE (full body) image** isn't in the UI. It probably belongs in D1. | not built | with D1 |
| D4 | **GRO.vine panel is dead code** (mounted nowhere). Vines show via `GoalCard`. Delete it or wire it up. | cleanup | small |
| D5 | **Governor buffing** (3 Frequency + a skill point) is canon but has no UI. | not built | ½ day, not needed for Test 1 |
| D6 | **Where the KRMA ledger view goes** (Tapestry / JEWL's table history). | decision | later |
| D7 | **Canvas map** (footprints, levels, item tokens): the browser check passed today. A hook that rewrites facts and descriptions when a thing is moved is not built. | partial | later |

## E. Privacy, anonymity, consent (hard rules)

- **The table-talk wall is live:** `JEWL_TABLE_LANE=local`. Table talk and real life never go to the cloud. Good.
- **The anonymity translator is not built.** The ruling is to swap every proper name per cloud call and store only the result. Only the identifier seam exists (`enforceWall`, `stripAndForward`). **Known leak:** the account username goes to the model as "Owner: <username>" (`ai/copilot/context-assembler.ts`, `services/context/entity-context.ts`). Also not done: an audit of the stored rows that could tie a cloud request to a user (DayaModelCall, CopilotMessage metadata, traces). The swap set beyond names is a Mike decision.
  - **Test 1 without sensitive subjects:** fix the username leak (small) and defer the translator.
  - **Test 1 WITH sensitive subjects:** the translator is a blocker. ~2–3 days.
- **Pattern Stability ledger:** Mike, 10-16: "design… before the first session of the first game." Not designed. A minimal v1 is ~1 day to design with Mike + 1 day to build: record prediction vs GM/player decision + context on the truth record, with a consumer/producer signal. **Decision:** must Test 1 have it, or is Test 1 a "systems shakedown" before the first game proper?
- **Harness prompts** have never been audited end to end for game-talk leaking into Violet's frame. ½ day; do before the test.

## F. Economy and items (only matters if the test uses money, combat or grading)

All are decisions pending from Mike (17 Oct thread), deferred for an ordinary-life scene:
- Damage → intrinsic KV curve.
  - Paper .38 = 46P + 34B base, plus ammo.
  - Canon `Weapon_System.md` still says .38 = 18P.
- Re-anchor the modern materials list (glass 2 → paper 22 + Brittle/Fragile; aluminum and polycarbonate too low).
  - The thickness basis of resist.
  - Resist subtraction is now the stated rule.
- What `accumulatedWealth` becomes now that cash holds no KRMA; whether bank balances are a belief ledger.
- Ability KVs above an item's price (83 items).
- Item lines state only real mechanical changes (Mike still deciding).
- Plural archetypes → singles (boots, gloves).

## G. Bugs and housekeeping

| # | Item | Status | Effort |
|---|---|---|---|
| G1 | Campaign-page JSON 500: a dev-server race on `.next` manifests during compiles. It goes away if nobody edits code during the session (rule: no edits while JEWL runs). | dev only | rule |
| G2 | **B6 idle polling**: `JewlChip.tsx:572` polls every 5 s while open, plus 15 s polls at :455 and :1058. Adds noise and load during play. | present | ½ day |
| G3 | B4 dice overlay "Initializing physics" can block clicks; `[DiceOverlayLoader] engine not ready after 6s` warning seen today. | present | check |
| G4 | **NPCs created as PLAYER_CHARACTER**: the schema default plus `services/character.ts:97`, via the canvas "Create NPC here" action. Genesis paths are fixed. One-line fix. | latent | minutes |
| G5 | NPC memory seeding bounce (not an AI being; one bad line rejects the whole batch). | present | ½ day |
| G6 | Random page reloads from dev hot-reload when code is saved. Rule for the session: **no code edits during play.** | rule | — |
| G7 | Branch `merge/fork-portrait-pipeline` not merged to master. | housekeeping | ½ hour |
| G8 | Stale docs: ROADMAP (header 10-09, log stops at 10-06, wrong 🔴 marks), system_map ("zero external services", "ComfyUI local"), ai_systems (04-04, FLUX/Ollama), PORTRAIT-STAGE-PLAN ("nothing built"), NEEDS-MIKE (still holds live items). | stale | ½ day |
| G9 | 34 type errors in test files (BigInt target, possibly-undefined). | noise | ½ day |

## H. Not this week (the bigger first game)

- **The three novel campaigns:** created, ACTIVE and **empty** (0 characters, 0 locations). DISCONNECTED; no way to switch networkMode. Their stories are Mike's to author, and JEWL never invents them. This is the bulk of the "first game" and needs Mike's authoring time.
- Her alters from those worlds.
- Live portrait: Qwen 2.1 licence, warm-worker cost, mood stills.
- The portrait-to-canvas token (portrait plan step D).
- Coax-mode rerun of her genesis: Mike's call; the sail result stands for now.
- Routing prods to a seated Trailblazer; a "fill in the rest" button.
- U3 board persistence; U4 fog/mirror overlay.

---

## Decisions Mike owes for Test 1 (one at a time)

1. **Scope:** an ordinary-life shakedown first (recommended), or include sensitive subjects (adds the translator, +2–3 days)?
2. **Pattern Stability:** required in Test 1, or does Test 1 come before it?
3. **Portrait framing** in 2:3 (head to hips like EmptyPortrait.png?), plus OK to spend on the repaint.
4. **Consent:** META (set your consent) or DISCONNECTED.
5. **Rosemary:** dead (a memory) or alive (an AI being)?
6. **Time durations:** accept speech 6 s / action 1 min / short rest 1 h / long rest 8 h? Should narrated jumps be inferred from prose?
7. **Vines:** re-choose all 4 after re-dating her memories, or just fill the 4th?
8. **Vitals & Equipment design** (a 20-minute session).
9. **Inventory:** what looks buggy to you?
10. **OK to spend:** the U2d live run, the A3 JEWL pass, the repaint, and Complete.

## SESSION 0 — the five-dollar bill (Mike, 17 Oct: "could we do an actual test of that… sort of a session 0")

**The scene:**
- **When:** Saturday 17 October 2026, ~7 pm. Cycle 0 = 17 Oct; the clock is set to 0.0022 ≈ 19:00. The campaign proper opens a week later, on 24 Oct.
- **Who:**
  - Violet, AI-run, in her studio. She has DECIDED (a 1 pm memory): the bill is folded by the door, she will give it to him as the tip tonight, and the terms are call → something new / no call → the Fifth Street shelter and the cat.
  - Kristopher (NPC, **voiced by Mike as Watcher**), on the Fourth-floor landing at her door, holding the pizza (Hawaiian + black olives).
- **The door:** locked from inside; tap a door to cycle it.

**Built 17 Oct (no GPU):**
- 32 memories retired → `app/data/archive/violet-retired-memories-2026-10-17.json`: the duplicate older biography, the self-published-book conflict, and the handing-over.
- The landing (10×20 ft, against her entry wall, stair down at the far end), the entry door relinked to it, Kristopher + the pizza + the bill (`tmp/session0-setup.ts`), the Kristopher world fact.

**Run it (when the GPU budget allows — today's is spent):**
1. Open the Incubator → ▶ Session. The warm-up overlay covers the ~100 s cold start.
2. TABLE tab: narrate the knock, then speak as Kristopher.
3. Violet answers through her own lane. Expect 30–50 s a reply (TABLE_SPLIT_LOOP off).
4. Open, unlock and hand over by narration; JEWL can `set_door`.
5. End the session.
6. **Afterwards:** read what she remembers and whether the bill changed hands (canon + her memory).

**Parked after session 0 (17 Oct, from building Kristopher):**
- Kristopher's mechanics review. Mike: "his attributes look pretty low". Clout 6, Celerity 8, Constitution 12, Flow 13, Focus 15, Willpower 17, Wisdom 17, Wit 11 (Violet: 8/9/9/10/17/16/14/13). He still needs his new 7-year turbulent branch (Miami → TN, 1st marriage, 2 kids), which will add levels.
- Designer: the server should persist each paint itself, so a reload can't orphan it. The age slider defaults to 25 and is sent as the age. The sex lives in `physicalDescription.gender`, so an empty value = the unknown-sex underwear.
- Genesis: post-build stages (WORLD/MEMORIES) re-run after BUILDING already did that work, and JEWL calls them "build churn". "her" is hard-coded for every character, in the stage texts AND in the character-creation prod window (Mike spotted it on Kristopher). It needs the sheet's pronouns everywhere.
- **Tapestry → Entities: clicking Kristopher sometimes opens Violet** (Mike, 17 Oct). It's intermittent. Suspect a stale selection or index/key mix-up in the entity list (components/tapestry/EntityView.tsx / TapestryTab.tsx). Not diagnosed.
- **Tapestry → Entities is slow to load** (Mike, 17 Oct). Measure it first: which request and how long. The campaign has 98 items plus memories, so it may be loading everything up front.
- **Character sheet: everything above the GRO.vines and Opportunities needs visual clarity** (Mike, 17 Oct). The tooltips don't match each other; the root/branch tooltips are the standard the rest should follow. The information is displayed poorly. Needs a design pass.
- **★ DAYA DISCUSSION: the player behind the character / split brain** (Mike, 17 Oct, live): "The action of the scene is relying on Violet. Even if her character is hesitating the (spirit) playing her should be doing something. Sort of like a player at a table and the character they are playing. This is something we need to discuss with the DAYA system and the sort of split brain/reasoning it needs."
  - Observed: Violet said "I'm coming", closed her eyes to the music, then waited for a stimulus that never came. The scene stalled with the GM waiting on her.
  - The being only reacts. There's no player layer keeping the table moving: deciding to act, to stall on purpose, or to say "she takes a minute".
  - Bring the "sim advances time" ruling (NOT BUILT) and the table-rhythm rulings into the same conversation.
- **HELLO WORLD findings (17 Oct, live):**
  - **Speed.**
    - The text lane went cold between pings (idle 10 s vs a 60 s ping). Fixed to 120 s.
    - Violet's being pipeline sends the DAYA tagger (24 calls), the adjudicator (59 KB a call) and reconciliation to the cloud godhead lane, serially per line.
    - The world-sim reach times out after 4 s and falls back to the stub.
  - **The lawfulness filter BLOCKED cloud model output 6× as MINOR_SEXUAL** (cues minor|sexual) during the tagger/adjudicator calls. Possibly her Violated Trust branch (ages 17–19) colouring the tagger's output. NEVER weaken this filter. Find out what output tripped it, and make a block not cost a retry loop.
  - **Every GM sheet edit fires a JEWL chat turn, often 2–5 duplicate replies per edit** ("Noted — final Kristopher sheet…"). 8 edits ≈ 20 dispatches flooding the text lane before play even started.
  - **Kristopher was played by the AI** ("via being") although Mike voices him. Genesis gave him an ACTIVE DayaEntity, so the being loop ran him: he knocked again, then put the receipt in "the pocket of my jacket" while wearing no jacket. I set his entity DORMANT mid-session. Needed: a per-NPC "voiced by the GM/player" switch that the being loop respects. Also, being actions invent worn things (the jacket) instead of reading the inventory.
  - **Violet opened a LOCKED door** ("turn the knob… push the door open") with no unlock. Door state isn't enforced on the being's actions.
  - **The GM pool correction went through DAMAGE**: Willpower 17→3 dealt 14 bashing, triggered Overwhelmed and overflowed 11 into Frequency (40→29). JEWL repaired it. Setting a current value must not route through damage.
  - **A GM line about a voiced character should show as THAT CHARACTER'S card** (Mike: "it should have shown him as a card right? even if her perception didn't get reached"). `::Kristopher begins to let his eyes wander…::` rendered as a plain narration row, because feed-rows.ts declarationRows (:103-131) makes narration rows for all action text and character rows only for quoted speech. Needed: when the declaration's actor is a roster character (named, or resolved by the better inference), its action renders as his character row (action segment), with or without speech, and regardless of who perceived it.
  - **GM speech by pronoun is unattributed.** `:: His voice is warm and relaxed:: "Take your time."` got speaker "someone present". The table-prose parser (services/table-prose.ts:177-182) only knows a roster name before or after the quote, or a `Name:` prefix. Needed: resolve he/she/his/her to the actor the GM's last declaration named (Kristopher), with the pronoun matching the sheet's sex. **Mike: "we need a much better inference then."** Speaker inference must use the scene (who is present, who acted last, who is GM-voiced, sex/pronouns), not just the name next to the quote. I fixed the one line by hand with a CanonRevision on cmvchx7mv0077sk48c4y6iien.
  - **BREAKDOWN (14:45): Violet played the scene as already over**. "The door is closed… chain… Eleven minutes… I gave him a dollar bill", a pepperoni box, 1,964 chars, all tagged `Say:`.
    - Cause: her personaProfile.voiceNotes AFFECT TARGET still read "eleven minutes at the door, the phone hasn't rung" (the post-handoff state). I retired the memories, not the persona.
    - Fixed: the baseline now reads "the bill is folded by the door, he has not knocked yet tonight" (ChangeLog canon_rewrite); the false memory cmvcidogp is retired (undoable).
    - **Also stale in the persona**: identityNarrative still has "Under the Floor… self-published… forty-seven downloads", the book I retired from memories as conflicting with her 3 novels. Ask Mike.
    - **Format failure**: a whole inner monologue was emitted as `Say:` (spoken aloud). The being's action parser or prompt must cap Say to speech.
    - **Kristopher's private world facts** (trial, psychiatric care, hotel, kids) sit in the campaign facts that Violet's context may read. Check perception filtering of facts.
  - **Being action quality**: "Violet's attention settles on The dust" is an empty Attend beat.
  - **JEWL's reconciliation misread the table** (15:04, Reconciliation cmvcj2m7s005cmw48leasq4vj). Mike: "Kristopher speaks loudly through the door… you didn't pay… $12.65". JEWL asked whether to rewind because "the door is open, the exchange in motion". But Violet's own last act (15:03:39) was "Step into the kitchen, close the door fully": she took the pizza and shut the door without paying, so Mike's line is the natural next beat. The reconciliation context reads the GM's narration/canon but not the being's own actions (chat `via: being`), or doesn't weight them. Being acts must be canon-visible to JEWL.
  - **★ WE PLAYED BELOW THE LINE** (Mike: "we have all this as below the line so that shouldn't happen… We are in fluid where nothing is able to be played"). The apartment, its rooms and the Fourth-floor landing are all status PLANNING (fluid, below the canvas crystallization line), yet a session started and played in them. Play must only happen above the line. Either ▶ Session refuses when the scene's places aren't crystallized, or starting a session asks to crystallize them first (with their KRMA). Same check for the characters' and items' state.
  - **★ THE ENGINE KEEPS THE MAP TRUE, NOT THE GM** (Mike: "the map should just be updated by the engine... that is the point"). Every resolved act updates world state: door open/closed/locked, who stands where, an item handed over, the pizza box changing holders. The GM never taps the map to match the story; canon writes it. That also means the reverse: an act the map forbids (opening a locked door) is resolved against it.
  - **Canvas tokens should move with table action** (Mike). When the table says someone steps in, opens the door or takes the bill, the tokens and items move on the map.
  - **The encounter fold shows in every live session** as if an encounter were running. Mike: "The encounter creation dialog needs to be removed and turned into a button or side menu because it makes the rolling chat awkward." So: no inline create form in the feed. Starting an encounter becomes a button or side-menu action; the feed shows an encounter fold only when one is live.
- **★ THE SCALE CONVERSATION** (Mike, 17 Oct: "This is actually an entire scale conversation we need to talk about"). Kristopher's levels came out low; Violet out-Clouts him.
  - Findings to bring: sheet level = the sum of root + branches only, and JEWL-authored blocks are stingy (9 yrs military = +2 Clout).
  - **The seed's augments are NOT on either sheet.** Human seed gives clo 5 / cel 5 / con 5 / flo 5 / foc 7 / wil 13 / wis 5 / wit 5, yet augmentPositive = 0 on Kristopher AND Violet. So either genesis-sheet-sync never applies seed augs, or they're applied somewhere unseen. Verify before the talk.
  - For hello world I bumped Kristopher's levels to 9/10/15/15/18/20/20/14, current = level. Mike sets his real pools.
  - Violet's current values should be SIMULATED from her day before play starts. There's no such simulator yet.
- **★ Portrait clothing comes from the engine, not hard prompts** (Mike, 17 Oct: "these are things in the engine dynamically… Items get their image generated (this isn't happening yet). Then that can be used as a reference in addition to the visual details"). The design:
  1. Every item gets its own generated image.
  2. The portrait paint takes each worn item's image as a reference, plus its visual details.
  3. Placement comes from the body region; hidden/shown comes from the layer; the look comes from the item's own data/story.
  4. JEWL's brief step must not silently time out.
  - My 17 Oct patches are to be REMOVED when this lands: the word list in portrait-visibility (cross|prayer rope|rosary…) and the hand-written `look` text on Kristopher's 4 items. Commit 89111c6. Keep the pronoun fix and the concealed flag as data.
- **★ JEWL needs far more control** (Mike, 17 Oct: "we are bypassing JEWL a lot and having you do this stuff and that is a note of how much more control JEWL needs"). On Kristopher alone I did by hand, because JEWL couldn't or didn't: fix the brief's AGE, re-balance branch years, seat corrected vines, move a prod answer, restore lost paints, grant every possession plus 5 new blueprints, and set the income. Each is a missing or failing JEWL capability: revise goal, revise years, materialize item blocks, finish request_tool rounds, and draft + publish item blueprints in one flow.
- **Cold starts make every designer step ~3–6 min.** The portrait worker idles out after 30 s, so each click between steps waits on a new H100 boot plus a model load. The portrait brief also called the text lane, which was THROTTLED (no H100 free), and it timed out after 30 s.
- **JEWL table-chat turns are slow.** Kristopher's possessions message (13:30:53) got its first reply at 13:33:58, and that round only *requested* place_item; placing comes next round. That's about 3 min a round on the local lane with 5.4k tokens of tools. The reply also leaked a "[2026-10-17T13:09:35Z]:" timestamp prefix into the text.
- **Nectar/thorn tooltips name conditions without saying what they do** (Mike, 17 Oct). "confused" etc. is mentioned, but the tooltip doesn't show which blossom that is or what it does mechanically. Tooltips should resolve the condition → blossom → its effect.
- **Possessions attached as blueprints, never made into things.** JEWL linked 4 item *blueprints* to Kristopher (Smartphone, Ballpoint Pen, Sticky Note Pad, Personal Laptop are all CharacterBlockLinks of type item). No CampaignItem was created, though, so he owns nothing on the map or sheet, and the portrait tab has nothing to dress him from. Something in genesis has to turn an attached item block into a real owned item. Audit the other "done" claims too.
- **Possessions must be asked, not assumed** (Mike, 17 Oct: "JEWL didn't ask about any possessions during the build. This should be important step with the user"). Kristopher got Smartphone/Pen/Sticky Notes/Laptop in BUILDING with no question. Possessions need their own question round with the player/GM, like the other stages.
- **Body composition comes largely from the attributes** (Mike, 17 Oct). The body render and build should read from Clout/Celerity/Constitution (etc.), not be free-picked or guessed.
- Kristopher's GRO.vines: JEWL wrote all 4 before the "Mike writes them" note landed. Mike corrected #2 and #4 at the check-in, but **JEWL has no tool to change a seated goal**: author_vine_goal only adds, so he hit "slots full" and stalled. I applied the corrections by hand. Needed: a revise_vine_goal tool, or the check-in applying keep/change/cut itself.

## Proposed week (if scope = shakedown)

| Day | Work |
|---|---|
| **Sat 18** | Mike answers decisions 1–7. I fix A6, A7, G4, A10 (Watcher always gets the truth feed) and the username leak; build the Start/End Session button (A4); fix the jeans spanning rule + add her underwear and socks (B1); crystallize her places (A9). |
| **Sun 19** | A3: re-date her memories + normalize the source tags. Repaint the portrait at 2:3 → approve → gate on (A1). Complete → 4th vine (A2). |
| **Mon 20** | A5: turn on `TABLE_SPLIT_LOOP`, run the U2d live harness, check the warm-up overlay. Time durations + narrated jumps (C1). |
| **Tue 21** | Vitals & Equipment design with Mike → build D1/D3 (reusing Paperdoll). |
| **Wed 22** | Inventory card D2; B6 polling (G2); harness prompt audit (E). |
| **Thu 23** | **Dry-run session** (A4): Mike narrates a 10-minute scene; fix what breaks. Docs + roadmap refresh (G8); merge to master (G7). |
| **Fri 24** | **Test 1.** No code edits during play. |

Slack: Pattern Stability v1 (if required) takes Tue/Wed's D2 slot, pushing the inventory card after the test. Sensitive-subject scope pushes Test 1 to ~27 Oct.
