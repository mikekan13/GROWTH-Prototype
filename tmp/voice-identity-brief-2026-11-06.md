# VOICE IDENTITY — brief (2026-11-06, Michael from the car: "we have their visual identity; is there something with machine learning for voices? They need to sound human, unless they don't — there might be robots too")

## The idea in one line
A voice is an identity embedding the way a face is (PuLID). A being's voice becomes a SAVED artifact of genesis, like the portrait: a short reference clip (~10 s) + the recipe that produced it, stored on the sheet (`data.voice`). Every later line is spoken from that reference, so the voice holds across sessions and devices.

## Two layers
1. **Designing the voice (genesis, once).** Never a real person's voice. Options:
   - **Kokoro blend space** (have it now, Apache-2.0): the 15 voices are style tensors (510×256); weighted blends are new voices. The engine derives the weights from the sheet (gender → pool, age → darker/brighter, build → weight, temperament → pace) → unique, deterministic, zero cost. Not cloning-grade realism, but human.
   - **Description-to-voice** (Parler-TTS, Apache-2.0 — verify): text like "a dry, older woman, low and unhurried" → a voice; render the 10 s reference clip from it.
2. **Speaking in it (every line).** A zero-shot cloning TTS takes the reference clip and the text.
   - **Chatterbox** (Resemble AI, MIT code + weights as released 2025 — VERIFY before shipping): ~0.5B, fits the 4060 beside Whisper, has an EMOTION EXAGGERATION knob → drive it from the being's state and traits (Dialed to Eleven: the knob IS the trait).
   - F5-TTS: quality on par, weights CC-BY-NC (Emilia data) → the same trap as the non-commercial image model (see license-debt memory). XTTS-v2 (Coqui): non-commercial. Fish Speech / OpenAudio: CC-BY-NC-SA weights. OpenVoice v2: MIT (tone-colour conversion over a base TTS — a fallback path: Kokoro speaks, OpenVoice re-colours to the reference).
   - Cloud (ElevenLabs etc.): the privacy wall allows fiction text out, but cost per line, licence of generated voices, and local-first say no for the core.

## Non-human voices
A deterministic DSP chain AFTER synthesis, driven from the being's data (materials, seed, size): pitch shift, formant shift, ring modulation / vocoder, bit-crush + band-limit (speaker grille), reverb/space, chorus/doubling (choirs, hive minds), breath/noise beds. A robot, a ghost and a giant are the same human performance through different chains → emotion survives. Kokoro + chain is enough for v1 of non-human.

## Storage / data model
`data.voice = { ref: 'voices/<characterId>.wav', recipe: { base: 'kokoro-blend' | 'parler', weights|description, seed }, chain?: [...], engine: 'kokoro' | 'chatterbox' }`. The reference wav lives next to the portrait files. The speak route already honours `data.voice` as a Kokoro id → extend to this object.

## Guard rails
- Designed voices only; no cloning of real people without consent (and none in the product).
- Licence check per model before it ships (the image-model lesson).
- GPU budget 8 GB: Whisper 1.8 + Kokoro 0.5 + Chatterbox ~3–4 → fits for play; NOT beside a ComfyUI portrait render → voice design is its own genesis stage like PORTRAIT.

## Proposed steps
1. Now: Kokoro blend derived from the sheet + the non-human chain; `data.voice` object; voice preview on the sheet ("hear her").
2. Next: Chatterbox smoke on the 4060 (licence verified) → designed reference clip at genesis → the speak route speaks from the clip.
3. Later: emotion intensity from state + traits; voice as a genesis dialogue step (JEWL prods: "what does she sound like?").

## RULED (Michael 2026-11-06): "Yes, this would be part of the Genesis."
The walk gains a VOICE stage beside PORTRAIT: Seed → Root → Branches → Appearance → World → Memories → Vines → Portrait → **Voice** → Born (order of Portrait/Voice to settle; both are identity artifacts). JEWL prods for it in the genesis dialogue ("what does she sound like?"); the player/Watcher hears candidates and locks one (gate, like the designer and the portrait lock, `services/genesis-gates.ts`); the locked clip + recipe are written to `data.voice`. Step 1 therefore builds the designed voice, not only a derived default — the derived blend is the first candidate JEWL offers.
