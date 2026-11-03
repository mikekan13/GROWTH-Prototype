# The Simulation Composer — design (Michael, 2026-11-03)

> "How it should have always worked was the local model placed orders using the cloud model. Taking all the pieces and
> building a simulation. Violet shouldn't be one llm chat that is running some prose. It would be like you really. Agents
> running different tasks. Perception, memory recall, voice. So really the only thing that gets all of those pieces is the
> local model that composes it all." … "Qwen isn't just Violet but the whole of the simulation." … "Violet and Kristopher
> probably do have their own chats. Or however many is needed to simulate a being."

This has been explained several times and built wrong each time. Read this before touching the being loop, the table,
or the model lanes.

## The shape

```
Simulation composer  (LOCAL Qwen — the whole world: every being, place, clock, who perceives what)
 ├─ Violet      → her own agents (as many as a being needs): perception · recall · mood · voice   — cloud orders, nameless
 ├─ Kristopher  → his own agents: perception · recall · mood · voice
 └─ the world   → physics, sound, signals, time
```

1. **The composer is the simulation.** One local model holds the whole moment. It is the ONLY thing that ever sees all the
   pieces together. Per Watcher line (or per tick of lived time) it decides what happened, which beings it touches, and
   which agents each touched being needs.
2. **Each being is several agents, each its own chat.** A being is not one prompt. Its agents get ONLY what that being can
   know: its senses, its memories, its mood, what it holds. Violet's agents never see Kristopher's mind. Perception
   honesty lives here.
3. **Agents are cloud orders.** The heavy cognition is Claude: "X is in situation Y, work out Z", narrow and structured.
   - perception: given these senses and this event, what reaches the being and how
   - recall: given this cue and these memory fragments, which wake and what they mean now
   - mood: how this moves the being's felt state
   - voice: how this one thought goes through this being, in its own way of speaking
4. **The translator at the wall** ([[ruling-anonymity-wall-translator-name-swap-2026-10-16]]). Before an order leaves, the
   local side swaps every proper name for a per-call placeholder. The answer is mapped back. Only the compiled result is
   stored, never what was sent. The fiction-only class rule, the table guard, the tone filter and the lawfulness screen stay
   exactly as they are.
5. **The composer assembles.** From the returned pieces it builds the beat: each being's card (thought / action / speech),
   impulses, acts handed to the adjudicator, the world's answer (sounds, signals, clock). The composer has the final say on
   what goes on the page; agents return drafts and judgements, not the page.

## What exists today (and why the prose was bad)

- `services/table-speak.ts` (speakProseSplit) is the simulation orchestration, in hand-written CODE: the reach judge, the
  standing beat, the far side of a signal, world sounds, the ask.
- `daya/ensemble.ts` listenStimulus is one being's pipeline in code: the perception voicer (`daya/renderer.ts`), the tagger,
  recall (`daya/recall.ts`), the soul sim (mood), thorns, then the LISTENING MONOLOGUE: one local call that receives
  everything (perception, recall, mood, facts, held items) and writes the inner voice. That monologue IS "one chat running
  some prose". The local model did the heavy cognition AND the composing in one pass, so it wrote stock images and
  misread the moment.
- `services/scene-builder.ts` buildBeingCard cuts the monologue into a card on Claude (judgment lane).
- 2026-11-03 interim mistake: the monologue and the perception voicer were moved to tier C (`proseTier`). That sent the one
  call holding a whole being to the cloud: the opposite of this design. REVERTED as step 1.

## Build order

1. Revert the interim switch: prose back inside the wall (`proseTier` defaults to L1).
2. The translator: `ai/network/translator.ts`, swap(text, names) → {text, map} / restore(text, map), names drawn from the
   campaign (characters, places, items, users). Built on the existing identifier seam (`enforceWall`). Wired into every
   cloud call. Unit tests.
3. The order: `daya/orders.ts`, placeOrder(kind, brief) → structured piece, through the translator and the wall. One
   schema per kind (perception, recall, mood, voice).
4. A being's agents: each kind as its own order with its own narrow brief, built from what that being can know.
5. The composer: the listening step becomes local composition from the pieces (it decides which orders a beat needs,
   places them, assembles). Then the table orchestration moves up into it, so one composer holds the world moment.
6. Replay Michael's session-2 lines (`tmp/session2-lines.json`, `tmp/call-dryrun.ts` SCRIPT mode) and compare.

## Open (ask Michael when it matters, not before)

- Does the composer write the final words of a thought, or place the voice agent's words? (Working assumption: agents
  draft; the composer has the final say.)
- Which orders run per beat by default, and which only when the composer asks for them.
