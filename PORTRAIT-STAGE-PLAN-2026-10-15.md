# The PORTRAIT stage — plan (15 Oct 2026, for Mike to cement)

**Status:** PLAN · written overnight after Mike's brief; nothing below is built except the loading veil and the tab lock.
**Mike's brief (15 Oct, verbatim where it matters):** "At this point JEWL would actually take in any data gathered by the image editing. Scars and tattoos would need memories for the AI so the player would be asked with the choice to have JEWL make it up based on the character or you can tell briefly what it is and JEWL can expand it for the memories and DAYA system. Then we need some flashy loading and graphics probably using the face and body with some movement and glitches while the portrait is generated. This should generate them in their current setting in the game with all the live portrait features like pose based on persona, mood, their clothes etc." … "JEWL would need to clothe them with appropriate clothes that the AI or player would approve of."

Where things stand: FACE and BODY are locked and approved (clean re-rendered). The PORTRAIT tab unlocks only then. Inventory is built (equipped = worn over a body region, carried, possessions = links). Nothing from inventory reaches any image yet. Memories, persona, affect (mood), location and the multi-reference render all exist as code (see §7).

---

## 1. The stage in one line

**PORTRAIT = JEWL reads everything the designer and the sheet know, asks the player the few things only they can say, dresses the character, places them in their scene, and paints them from the face + body references — then the tokens and the live portrait derive from that.**

Four steps, each its own unit of work, each testable on Violet:

| # | Step | What the player sees | What JEWL does | Build size |
|---|---|---|---|---|
| A | **Marks become memories** | A list of the marks from the edit stacks (scar, tattoo, piercing, birthmark, body mod, makeup). Per mark: **JEWL decides** or **one line from me** → JEWL expands it. | Writes the mark as an appearance FACT on the sheet and a MEMORY in DAYA (how it came to be). | 1 session |
| B | **Dress** | JEWL's outfit proposal from the inventory (and, for a character with no clothes yet, from who they are). Player/GM approve, swap, or say "something else". | Picks EQUIPPED items; when there are none, drafts an outfit as Forge item archetypes + campaign instances (the narrative-paint rule) and equips them on approval. | 1–2 sessions |
| C | **Scene + bearing + paint** | The flashy veil (built), then the portrait. REGENERATE re-rolls; APPROVE makes it `Character.portrait`. | Writes the PORTRAIT BRIEF (setting, pose from persona, expression from mood, clothes, light) and renders from face + body refs on the v1 recipe. | 1–2 sessions |
| D | **Derivatives in the background** | Token appears on the canvas card; later the mini. | RGBA token crop with the pillar ring from the portrait; 3D later. | 0.5 session (token) |

The LIVE portrait (wounds, expression changes, new gear in play) is the same brief + paint machinery re-run on triggers. Not in this plan's build; §6 says what it needs.

---

## 2. Step A — marks become memories

**Source of truth for marks:** the FACE and BODY edit stacks (`identity.designer.layers` / `bodyLayers`): every layer whose `kind` is scar | tattoo | piercing | birthmark | bodymod | makeup, with its sentence ("Add a scar to her face: a thin pale line through the left eyebrow") and its place. Hair, build and underwear are appearance facts, not memories.

**UI (PORTRAIT tab, section "1 · Marks"):** one row per mark: thumbnail of that layer, the sentence, and two choices:
- **JEWL DECIDES** — JEWL invents how it came to be, from the character (backstory/genome, seed, age, persona, recent memories).
- **TELL JEWL** — one line from the player ("bar fight in Tiberoak, lost"), JEWL expands it.
Then a card: the story (2–4 sentences, in the character's own register) + **KEEP / REDO / EDIT**. Kept stories are written; a mark with no story blocks nothing (the portrait can paint without it) but the row stays amber until done.

**Server:**
- `services/portrait-marks.ts` `listMarks(characterId)` → `[{ layerId, target, kind, place, sentence, imagePath, story? }]` (pure read of the designer stack + the stored stories).
- `services/portrait-marks.ts` `storyForMark(characterId, mark, { mode: 'jewl' | 'told', told?: string })` → JEWL via `routedChatText` (`ai/network/chat.ts`), **lane `local`, contentClass `fiction`** (the seed-pick precedent — the sheet is fiction; the photos never go). Prompt = the mark + the character's facts + persona voice + 3 recent memories; JSON out `{ story, memory, salience, when }`.
- Write path = the genesis one: `daya/authoring.ts seedEntityMemories(characterId, role, [{ content, salience, source: 'mark' }])` after `resolveDayaEntityId`. Appearance fact → `identity.marks[]` on the sheet (new small array: `{ kind, place, sentence, storyRef }`), so the sheet owns the fact and DAYA owns the memory (two ledgers).
- Route: `POST /api/characters/[id]/marks/story` (thin) and `GET /api/characters/[id]/marks`.

**Rules already ruled that apply:** narrative paint (the story is campaign-local, the mark archetype is global); JEWL suggests, Godheads/players decide; sealLint vocabulary check on memory text (genesis path does it).

---

## 3. Step B — dress (the one that needs Mike)

**The rule we have:** clothing and gear come from inventory, never from the designer. **The gap:** a new character usually has NOTHING equipped, so "paint what's equipped" paints underwear. Mike (bedtime): "JEWL would need to clothe them with appropriate clothes that the AI or player would approve of."

**Proposal:**
1. JEWL reads: seed, age, era/garment norms from the genome (`style-profile.ts` already derives era, underclothing, garment norms, materials from the backstory), persona, current location type, campaign mood, KRMA means (a pauper does not get a brocade coat), and what is already EQUIPPED / CARRIED / possessed.
2. JEWL proposes an OUTFIT: 3–6 pieces, each as a Forge archetype (catalog reuse first: "Linen Shirt", "Wool Cloak", "Leather Boots") with the campaign instance's paint (local name/description, materials, colours) and the body region it is worn on (outermost-shared-region rule).
3. The player (or the GM, or the AI for an NPC) **approves, swaps a piece, or asks for another take**. Approval = the items are created as CampaignItems (`sourceForgeItemId` set), equipped via the inventory service, and priced in KRMA like any item (JEWL never approves — the Forge consent law).
4. The portrait paints the EQUIPPED layer as it stands after approval. Carried-in-hand items (a drawn weapon) are a question (§5).

**UI (section "2 · Dress"):** the proposal as a list of pieces with region + material chips; APPROVE OUTFIT / ANOTHER TAKE / per-piece ⊗; a free line "tell JEWL" ("no cloak, add a sword belt"). For a character already dressed, the section just shows what is equipped with "change in inventory".

**Server:** `services/portrait-dress.ts` `proposeOutfit(characterId)` (JEWL, lane `local`/`fiction`, JSON) → `applyOutfit(characterId, pieces, approverRole)` (creates CampaignItems + equips; reuses `services/inventory.ts` equip + the Forge catalog lookup; prices via the KV path or flags for Kai). Route `POST /api/characters/[id]/dress/propose|apply`.

---

## 4. Step C — the brief and the paint

**The brief** (`services/portrait-brief.ts` `buildPortraitBrief(characterId)`), gathered then written by JEWL in one call:
- **Setting:** the `located_at` Location (name, type, description, environment, `imageUrl` if it has one) — when none, the campaign's default or a neutral GROWTH interior; the prompt says it in two sentences.
- **Bearing / pose:** from persona (`DayaEntity.personaProfile`: voice register, bias profile) and seed/build → one pose sentence ("stands square, weight back, arms loose"), never a named pose list.
- **Expression:** from affect (`getDisposition` → morale/stress/grief; `renderDispositionLine`) + conditions → one clause; baseline = the character's resting face.
- **Clothes:** the EQUIPPED items after step B, outermost layer per region, as prose with materials and colours; carried-in-hand per §5.
- **Marks:** restated so the paint keeps them (they are already in the body ref, but naming them stops the model dropping a tattoo).
- **Light / time:** from the location + campaign mood (`getCampaignMood`).
- Output JSON `{ setting, pose, expression, clothes, marks, light, prompt }` stored at `identity.portraitBrief` with a hash of its inputs (so a changed outfit or location invalidates it).

**The paint** (`Qwen21Provider.renderPortrait(characterId, brief, refs)`): the multi-reference render proven on 14 Oct (`renderStyled` with `images`): `<image1>` = the FACE (approved base), `<image2>` = the BODY, `<image3>` = the location image when it exists; prompt = "A painted character illustration of the person in <image1> with the body in <image2>, <clothes>, <pose>, <expression>, in <setting>, <light>." + the v1 recipe (LoRA 0.7, mid-generation ink 0.8, gold/dark pen auto). Canvas: portrait 4:5 (`832×1040`) for the character portrait; a wider scene size is a later option. Saved under `portraits/<id>/portrait/`; the PORTRAIT tab gets its own stack (same EditStack component: peek, ⊗, REGENERATE = new seed). **APPROVE PORTRAIT** → `lockPortrait({ characterId, imagePath })` sets `Character.portrait` (the canvas card updates via the existing `portrait_update` SSE event) and kicks step D.

**Identity check:** the base-lock gate pattern (vision lane) can judge "same person as <image1>?" and re-roll once; cheap, already built.

**Progress:** routes today just await. The veil carries a stage line + sub line; the client can show the stages optimistically (brief → dress check → paint → finish) with the clock, and the campaign stream's `jewl_working { phase }` event can drive the sub line once the server emits it from the brief/paint steps. No job table needed for v1.

---

## 5. Questions for Mike (answer in the morning, in order)

1. **Dress approval:** is the flow in §3 right — JEWL proposes, player/GM/AI-for-NPC approves, approval creates + equips real items? And does an approved outfit cost KRMA from the GM's wallet, or is starting clothing free (sketch-tier) up to some means?
2. **What paints:** EQUIPPED only, or also CARRIED items in hand (a slung bow, a drawn sword)? My default: equipped only, plus anything JEWL's brief calls "in hand" from carried.
3. **Marks with no story:** can the portrait paint before every mark has its memory, or is the memory step a gate?
4. **Makeup:** a memory or just an appearance fact? (It is temporary by nature.)
5. **Scene:** paint the current `located_at` location, and when the character has none, where? (A neutral GROWTH interior? The campaign's starting location?)
6. **Framing:** head-to-knees 4:5 portrait (my default), full-length, or let the brief choose by setting?
7. **Approval replaces the canvas image:** APPROVE PORTRAIT sets `Character.portrait`; the approved face stays the identity anchor. Yes?
8. **Live triggers (later):** which events repaint — equip/unequip, body-part condition tier change, an affect shift past a threshold, GM "repaint", a scene move? Per viewer or one portrait for all?

---

## 6. What the live portrait needs that this plan leaves out

- A trigger list (Q8) and a debounce (one repaint per beat, not per event).
- Condition → wound mapping: body-part condition tiers (Undamaged/Worn/Broken/Destroyed, `body-damage.ts`) → a localized edit on the portrait at that region (the 15 Oct localizer already does "add a mark where the vision lane finds it").
- Expression: affect deltas → a localized face edit, or a full brief re-paint when the scene changes.
- Cost control: live repaints are cloud time; the KRMA/metering hook exists (`recordAiCall`).

## 7. Code the plan stands on (all exist today)

- Memories: `daya/entity.ts resolveDayaEntityId`, `daya/memory.ts writeMemoryEntry`, `daya/authoring.ts seedEntityMemories` (genesis uses it: `services/sketch-genesis.ts:290`).
- JEWL text: `ai/network/chat.ts routedChatText` (lanes local/judgment; `contentClass` fiction); small-JSON precedent `services/seed-pick.ts askJewlForSeed`; `extractJson` in `services/sketch-genesis-rules.ts`.
- Persona/affect: `daya/authoring.ts getDayaAuthoringState`, `services/daya-affect.ts getDisposition / renderDispositionLine`; conditions `types/growth.ts GrowthConditions`.
- Location: `EntityRelationship located_at` (inline query pattern), `services/location.ts getLocation`, `types/location.ts GrowthLocation.imageUrl`.
- Inventory: `services/inventory.ts listInventory(...).equipped`, `equippedTo` region keys, `buildWornLayers`; items `types/item.ts GrowthWorldItem` (materials, properties, no colour field yet).
- Character: `services/character.ts getCharacter`, `lib/appearance-designer.ts restoreDesigner`, `lib/seed-state.ts readSeedPick`, `services/portrait-lock.ts lockPortrait`.
- Paint: `Qwen21Provider.renderStyled(prompt, seed, size, { images, inkAt, loras })` + `scripts/style-composite.ts` recipe; v1 recipe = LoRA 0.7 + ink 0.8 (ruling 14 Oct).
- Progress: `lib/campaign-stream.ts broadcastEvent` with `portrait_update` / `jewl_working` events.

## 8. Built tonight

- **PORTRAIT veil** (`components/character/designer/parts.tsx PortraitVeil`): the body drifts under a cross-dissolving luminosity face, both tear in RGB every few seconds, a dashed gold sigil ring turns, the scan band sweeps, stage line + sub line + glyph noise + clock on black bars. Still under reduced motion. Preview without a generation: `/character/<id>?veil=portrait` (dev only).
- PORTRAIT tab locked until face approved AND body exists.
