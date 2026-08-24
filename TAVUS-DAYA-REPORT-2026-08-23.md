# Tavus / PAL Maker vs DAYA — What They're Thinking About That We Aren't

Report for Mike, 2026-08-23. Sources: tavus.io/pal-maker, docs.tavus.io
(CVI, PAL, Perception, Conversational Flow, Memories, Models), Sparrow-1
blog, Phoenix-4 coverage, pricing pages. Raw findings indexed in the
research sandbox.

## What they are

Tavus sells "AI humans": real-time conversational VIDEO agents. PAL Maker
is the no-code front — you describe a companion out loud to their own PAL
("Charlie") and it assembles one: face, voice, system prompt, capabilities.
Deploys as a Google Meet participant, a one-script-tag web widget, or a
hosted page; there's a consumer iOS companion app. Pricing: $59-$397/mo
tiers, ~$0.37/min overage — per-minute conversational video is the unit
economy.

## Their stack, translated into DAYA terms

| Tavus | What it is | DAYA equivalent |
|---|---|---|
| **Raven-1** (perception) | Continuous camera+mic analysis of the HUMAN: facial expression, tone, gaze, objects, screen share. Injects per-utterance affect tags into the LLM context; visual events can auto-fire tool calls | **None.** DAYA senses the FICTION (seed-derived senses); nothing senses the PLAYER. JEWL's always-on table audio exists but is transcription-only |
| **Sparrow-1/2** (turn-taking) | Dedicated recurrent model for conversational timing: 40ms prosody frames, 55ms floor-prediction, distinguishes real interruption from overlap, and ENTRAINS to the specific speaker's pacing over time. Knobs: patience, interruptibility | **None.** JEWL's voice mode is push-to-talk-shaped; proact timing is heuristic |
| **Phoenix-4** (face) | Gaussian-diffusion live face from a 2-min video; programmatic emotion vector (joy/sadness/anger/surprise) while speaking AND listening; sub-600ms round trip | **None yet** — but our portrait pipeline already builds identity-locked faces; a live face is a rendering problem we're closer to than it looks |
| **PAL object** | Persona = system prompt + Documents (RAG) + **Objectives** (goal-directed flow, CRUD) + **Guardrails** (enforced boundary objects, attachable by id) + Tools/Skills | JEWL's laws live in one versioned prompt; goals/stakes exist in DAYA but not as attachable conversation-objects; guardrails have no enforced object form |
| **Memories** | Auto-extracted into tag-bucket `memory_stores`; buckets shareable across people/PALs (group memory); single-memory delete API | DAYA's ledger is richer (affect-signed, sealed, no-confabulation, read-only recall) but strictly per-being |

## The honest scorecard

**Where they're ahead — presence.** Everything that makes a PAL feel alive
is stuff our loop has no concept for: perceiving the human continuously,
reacting to affect *before the person speaks*, human-grade turn timing that
adapts to YOU, and a face that emotes while listening. Their whole company
is the last 500ms of the interaction.

**Where we're ahead — being.** PALs do not exist between conversations. No
autonomy, no volition loop, no goals with stakes, no self-deactivation, no
economy, no death. Their memory is a tag bucket with implicit extraction —
no ledger semantics, no confabulation guarantees, nothing like
memory-belongs-to-the-person. A PAL is a beautifully rendered *session*;
DAYA is a life. Our thesis is validated by their absence.

## What's worth stealing (concept-level, sequenced)

1. **Player-affect as a sense channel (cheap, near-term).** We already
   stream table audio (TABLE_AMBIENT). Adding tone/affect analysis to those
   chunks and injecting compact affect tags into JEWL's context (their
   `<user_audio_analysis>` pattern, ~32 tokens) gives JEWL Raven-lite:
   reading the table's mood. This directly feeds two things we already
   designed — the GM-health barometer from the vine system ("no
   opportunities lighting up" + a flat-sounding table = a GM who needs
   help), and DAYA beings reacting to how the PLAYER sounds, not just what
   they typed. Fits the local-lane router perfectly (affect analysis is a
   small-model job, privacy-sensitive → local).
2. **Turn-taking knobs for voice mode (medium).** Not a Sparrow clone —
   but `patience` and `interruptibility` as JEWL voice settings, plus
   "greeting is uninterruptible," are cheap UX rules that make voice feel
   intentional. Their timing-entrainment idea (sync to the speaker) is the
   long-term note worth remembering.
3. **Guardrails as attached objects (aligns with existing plans).** Their
   Guardrails-by-id pattern is our campaign audience profile + maturity
   flags wanting to be an enforced conversation-layer object, and it maps
   cleanly onto the service-vs-office settings split we already flagged for
   GM AI settings. Same object could carry the campaign's tone contract.
4. **Perception-triggered tools (later, powerful).** "Visual event fires a
   function" generalizes to DAYA: sensory events firing tool calls is
   literally our senses→act loop — their version just reminds us the
   trigger channel can be the REAL table (someone holds up a character
   sheet, JEWL reacts). Post-embodiment.
5. **The live face (far, but on OUR road).** Phoenix trains a face from
   2 minutes of video; we already manufacture identity-locked character
   faces. A rendered speaking JEWL — or a rendered NPC face during play —
   is the presence endgame, and their $0.37/min is the cost ceiling to
   beat with our own serverless GPU stack. Park it on the roadmap behind
   the network infrastructure.
6. **AI-disclosure layer (compliance, pre-launch).** They ship verbal +
   visual AI disclosure as persona fields (EU AI Act biometric switches on
   perception too). We'll need an equivalent statement for JEWL/"Copilot"
   and any table-audio analysis before real users — cheap to design now,
   expensive to retrofit.

**What to skip:** their memory model (ours is strictly stronger — but
consider a SHARED store concept: group/world memory buckets map to our
world-facts layer, worth one line in the vine/world design, not an
adoption); create-a-PAL-by-talking (JEWL already IS our authoring
interface); per-minute video pricing as a business model (our economics
are KRMA-native).

## One-line takeaway

Tavus proves the market pays for *presence* — perception, timing, a face —
and has nothing on *being*. DAYA's loop is the moat; their playbook is a
shopping list for making our beings feel as alive in the room as they
already are on paper, starting with the cheapest item: letting JEWL hear
HOW the table sounds, not just what it says.
