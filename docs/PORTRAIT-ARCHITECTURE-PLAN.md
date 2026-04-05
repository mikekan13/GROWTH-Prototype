# GRO.WTH Portrait Pipeline — Architecture Plan

**Status:** AWAITING APPROVAL — Do not implement until Mike approves.
**Date:** 2026-03-15
**Research basis:** 4 research documents in `docs/` + existing `PORTRAIT-PIPELINE.md`

---

## 1. System Capability Report

### Hardware
| Component | Spec | Implication |
|-----------|------|-------------|
| GPU | NVIDIA RTX 4060 | Ada Lovelace, Tensor Cores |
| VRAM | 8 GB | Limits model choice — must use quantized models |
| CPU | Intel i5-14400F (10C/16T) | Good for text encoder offloading |
| RAM | 16 GB | Adequate but Ollama must be paused during generation |
| Disk | ~680 GB free (C:) | Plenty for models (~10-15 GB needed) |
| CUDA | Driver-bundled only (no toolkit) | May need toolkit install for custom ComfyUI nodes |
| Python | 3.13.12 + pip | Ready for ComfyUI |
| Ollama | v0.17.4 (gemma2:9b) | Must unload during portrait generation (shared VRAM) |

### Critical Correction
The existing `PORTRAIT-PIPELINE.md` references **FLUX.2 Dev** as the base model. FLUX.2 is a 32B parameter model — even its smallest GGUF quantization (Q2_K = 12.9 GB) plus its Mistral-Small-3.2-24B text encoder makes it **impossible to run on 8GB VRAM**. The correct model for this hardware is **FLUX.1 Dev** (12B params).

---

## 2. Recommended Toolchain

### Base Model: FLUX.1 Dev (Q4_0 GGUF)
- 12B parameters, 6.8 GB model file
- With quantized T5 text encoder + VAE: ~8-10 GB total (fits with `--lowvram`)
- 1024×1024 generation in ~20-30 seconds on RTX 4060
- Superior prompt following and anatomy vs SDXL
- Native PuLID Flux II support (the best identity preservation tool)

**Why not SDXL?** SDXL has better painterly fine-tunes (Deliberate, DreamShaper), but PuLID Flux II — our critical identity preservation tool — works best on Flux. Since character consistency is the #1 requirement, Flux wins. We achieve the painterly look via style LoRAs + prompt engineering.

**Why not FLUX.2?** Too large for 8GB VRAM. Upgrade path when GPU improves.

### Identity Preservation: PuLID Flux II
- Zero model pollution — preserves base model's style capability
- Single reference image (no training)
- ~1-2 GB additional VRAM overhead
- Tunable weight: 0.6-0.8 for style-forward, 0.9-1.2 for strict identity lock
- ComfyUI node: `ComfyUI-PuLID-Flux` (balazik)

### Orchestration: ComfyUI
- 106k GitHub stars, dominant ecosystem
- JSON workflow API (REST + WebSocket) — cleanest programmatic integration
- Built-in queue management
- Massive custom node ecosystem (3,400+ packages)
- `--lowvram` mode for 8GB cards

### Style Control: Style LoRA + Prompt Bible
- Train or source a painterly fantasy style LoRA for FLUX.1
- Combine at: Style LoRA (0.6 strength) + PuLID (0.8 strength)
- Fixed "style bible" prompt prefix on every generation
- Negative prompt layers (anti-photorealism, anti-anime, anti-artifact, style purity)

---

## 3. The Persona Lock — Technical Design

This is the core innovation. When a player creates a character and likes a portrait, they "lock" it. That portrait's identity becomes permanent.

### What Gets Stored

```
PersonaLock {
  characterId:    string          // FK to Character
  referenceImage: string          // Path to the locked portrait image
  faceEmbedding:  string          // Path to extracted InsightFace/EVA-CLIP embedding file
  lockedPrompt:   string          // The exact prompt that generated the accepted portrait
  lockedSeed:     number          // The seed used for the accepted generation
  styleConfig: {
    styleLora:    string | null   // Style LoRA filename (if used)
    loraStrength: number          // Style LoRA strength at lock time
    pulidWeight:  number          // PuLID weight at lock time
  }
  createdAt:      DateTime
  updatedAt:      DateTime        // Updated if player approves a re-lock
}
```

### How It Works

**First Generation (Character Creation):**
1. Player fills out character sheet (seed, backstory, physical description)
2. System assembles prompt from character data (see §5 Translation Layer)
3. ComfyUI generates portrait (FLUX.1 + style LoRA, no PuLID yet)
4. Player cycles through generations (new seed each time) until satisfied
5. Player clicks "Lock Portrait" → system extracts and stores:
   - The portrait image itself
   - The face embedding (via InsightFace, run in ComfyUI)
   - The prompt + seed + style config

**Subsequent Generations (Updates):**
1. System detects visual change (equipment, injury, condition)
2. Loads the PersonaLock reference image + embedding
3. Assembles new prompt reflecting current state
4. ComfyUI generates with PuLID injecting the locked identity
5. Player/GM sees preview → approves or rejects
6. If approved, new portrait replaces `Character.portrait` but PersonaLock stays unchanged

**Re-Lock (Rare):**
If a major narrative event transforms a character's appearance permanently (aging, curse, resurrection in new body), the player can re-lock. Old lock is archived in generation history.

### Consistency Over Time
- PuLID from a single reference image provides ~85-90% identity fidelity
- Combined with the locked prompt's identity description, this pushes recognition higher
- The locked seed is NOT reused for updates (different scenes need different compositions)
- Style LoRA + prompt bible prevent art style drift across years of generations

---

## 4. Provider Architecture

```
ImageGenerationProvider (interface)
├── LocalProvider    ← ComfyUI + FLUX.1 + PuLID (BUILD THIS)
└── CloudProvider    ← Stub (future: BFL API, Replicate, or hosted ComfyUI)
```

### Interface

```typescript
// ai/portraits/types.ts

interface ImageGenerationProvider {
  name: string;
  isAvailable(): Promise<boolean>;

  // Core generation
  generatePortrait(input: PortraitInput): Promise<PortraitResult>;

  // Identity
  extractIdentity(imageData: Buffer): Promise<IdentityData>;

  // Health check
  getStatus(): Promise<ProviderStatus>;
}

interface PortraitInput {
  characterData: PortraitCharacterData;    // Translated character fields
  personaLock: PersonaLock | null;          // null = first generation
  pipelineType: PipelineType;              // 'character_portrait' | stubs
  overrides?: {
    steeringWords?: string[];               // "battle-worn", "smiling"
    seed?: number;                          // For reproducibility
    composition?: string;                   // "bust", "full_body", "action"
  };
}

interface PortraitResult {
  success: boolean;
  imageData?: Buffer;
  imagePath?: string;                       // Where stored on disk
  metadata: {
    prompt: string;                         // Exact prompt used
    negativePrompt: string;
    seed: number;
    model: string;
    steps: number;
    generationTimeMs: number;
    pulidWeight?: number;
    styleLoraWeight?: number;
  };
  error?: string;
}

interface IdentityData {
  embeddingPath: string;                    // Path to saved embedding file
  referenceImagePath: string;               // Path to reference image
}

interface ProviderStatus {
  available: boolean;
  gpuLoaded: boolean;
  queueLength: number;
  vramUsageMb?: number;
  error?: string;
}
```

### Cloud Provider Stub

```typescript
// ai/portraits/providers/cloud.ts

class CloudProvider implements ImageGenerationProvider {
  name = 'cloud';

  // Track usage for subscription tiers
  private async trackUsage(userId: string, type: PipelineType): Promise<void> {
    // Future: increment usage counter per account
    // Basic tier: 50 generations/month
    // Premium tier: 500 generations/month
    // See memory/ai-subscription-tiers.md
  }

  async isAvailable(): Promise<boolean> { return false; }
  async generatePortrait(): Promise<PortraitResult> {
    return { success: false, metadata: {} as any, error: 'Cloud provider not yet implemented' };
  }
  async extractIdentity(): Promise<IdentityData> {
    throw new Error('Cloud provider not yet implemented');
  }
  async getStatus(): Promise<ProviderStatus> {
    return { available: false, gpuLoaded: false, queueLength: 0, error: 'Not implemented' };
  }
}
```

### Provider Selection

```typescript
// ai/portraits/providers/index.ts

async function getPortraitProvider(preferCloud: boolean = false): Promise<ImageGenerationProvider> {
  if (preferCloud) {
    const cloud = new CloudProvider();
    if (await cloud.isAvailable()) return cloud;
  }

  const local = new LocalProvider();
  if (await local.isAvailable()) return local;

  throw new Error('No portrait generation provider available');
}
```

Watcher toggles `preferCloud` in campaign settings. Players inherit the Watcher's choice.

---

## 5. Character Data → Prompt Translation Layer

### Visual Weight Tiers

Not all character data carries equal visual weight. The translation layer categorizes fields:

| Tier | Weight | Fields | Example Output |
|------|--------|--------|---------------|
| **T1: Core Identity** | Always included | seed/species, age, physical description, sex/gender presentation | "a 34-year-old female Verdathi elf with sharp angular features" |
| **T2: Equipment** | Included when present | visible equipment (head, torso, shoulders, hands, held items) | "wearing ornate silver plate armor, holding a crystalline staff" |
| **T3: Status** | Included when active | wounds (visible body parts), conditions, depletion states | "with a jagged scar across the left cheek, exhaustion in the eyes" |
| **T4: Narrative** | Subtle influence | backstory themes, root, branch, personality | "stern expression, weathered, military bearing" |
| **T5: Trait** | When visually manifest | nectars/thorns with visual component | "faintly glowing arcane sigils on the forearms" |
| **T6: Environment** | Campaign-level | campaign theme, current location, time of day | "dimly lit stone dungeon, torchlight from the left" |
| **T7: Meta** | Derived | attribute depletion (how exhausted they look), TKV level (quality of gear) | "haggard appearance" (high depletion), "fine craftsmanship" (high wealth) |

### Prompt Assembly

```typescript
// ai/portraits/prompt-builder.ts

function buildPortraitPrompt(char: PortraitCharacterData, config: StyleConfig): PromptOutput {
  const blocks: string[] = [];

  // STYLE BLOCK (constant — from style bible)
  blocks.push(config.stylePrefix);
  // e.g. "gwthart painting, painterly fantasy illustration, rich saturated color,
  //  dramatic chiaroscuro lighting, emotionally expressive face, visible brushstrokes"

  // IDENTITY BLOCK (T1)
  blocks.push(buildIdentityBlock(char));
  // e.g. "a 34-year-old female Verdathi elf with sharp angular features,
  //  olive skin, long dark braided hair, amber eyes"

  // EQUIPMENT BLOCK (T2)
  if (char.visibleEquipment.length > 0) {
    blocks.push(buildEquipmentBlock(char.visibleEquipment));
  }

  // STATUS BLOCK (T3)
  const statusParts = [
    ...buildWoundDescriptions(char.wounds),
    ...buildConditionDescriptions(char.conditions),
    ...buildDepletionDescriptions(char.attributePools),
  ];
  if (statusParts.length > 0) {
    blocks.push(statusParts.join(', '));
  }

  // NARRATIVE BLOCK (T4 — subtle)
  blocks.push(buildNarrativeInfluence(char.backstory, char.root, char.branch));

  // TRAIT BLOCK (T5 — visual traits only)
  const visualTraits = char.traits.filter(t => t.hasVisualManifestation);
  if (visualTraits.length > 0) {
    blocks.push(buildTraitDescriptions(visualTraits));
  }

  // COMPOSITION BLOCK
  blocks.push(config.compositionSuffix);
  // e.g. "bust portrait, three-quarter view, dark atmospheric background,
  //  warm key light from upper left"

  // ENVIRONMENT BLOCK (T6 — when relevant)
  if (char.environment) {
    blocks.push(buildEnvironmentBlock(char.environment));
  }

  return {
    prompt: blocks.filter(Boolean).join(', '),
    negativePrompt: config.negativePrompt,
  };
}
```

### Extensibility

New character sheet fields plug into the translation layer by:
1. Adding the field to `PortraitCharacterData` interface
2. Assigning it a visual weight tier
3. Adding a `build*` function that converts it to prompt text
4. Registering it in the appropriate block of `buildPortraitPrompt`

Fields that don't affect appearance simply aren't added. The system is additive-only — new fields never break existing portraits.

---

## 6. Pipeline Types

### BUILD NOW: Character Portrait
Full implementation as described in this document.

### STUB WITH SCHEMAS:

```typescript
type PipelineType =
  | 'character_portrait'      // ← BUILD
  | 'character_token'         // Circle token for map/combat (crop + style)
  | 'profile_image'           // Smaller, simpler portrait for profiles/lists
  | 'map_location'            // Location/area illustration
  | 'item_illustration'       // Equipment/item art
  | 'npc_portrait'            // NPC portraits (same pipeline, no persona lock)
  | 'location_scene'          // Full scene illustration
  | 'campaign_banner';        // Wide banner image for campaign header

// Each pipeline type has its own input schema extending a base
interface PipelineInputBase {
  type: PipelineType;
  campaignId?: string;
  requestedBy: string;          // userId
  styleOverride?: string;       // Campaign-level style LoRA
}

interface CharacterTokenInput extends PipelineInputBase {
  type: 'character_token';
  characterId: string;
  size: number;                 // px, typically 128 or 256
  borderColor?: string;         // Pillar color of character
}

interface MapLocationInput extends PipelineInputBase {
  type: 'map_location';
  locationName: string;
  description: string;
  biome?: string;
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: string;
  features: string[];           // "river", "ruins", "forest"
}

interface ItemIllustrationInput extends PipelineInputBase {
  type: 'item_illustration';
  itemName: string;
  itemType: string;             // weapon, armor, consumable, etc.
  material?: string;
  description: string;
  rarity?: string;
}

// ... similar for npc_portrait, location_scene, campaign_banner
```

---

## 7. Global Art Style Anchor

### Style Bible (Prompt Prefix)

```
gwthart painting, painterly fantasy illustration, rich saturated color palette,
dramatic chiaroscuro lighting, emotionally expressive face, visible brushstrokes,
oil painting texture, fantasy art masterwork, detailed expressive eyes,
warm and cool color contrast, atmospheric depth
```

### Negative Prompt (Layered)

```
// Anti-Photorealism
photograph, photorealistic, photo, realistic skin texture, pores,
camera grain, lens flare, bokeh, DSLR, RAW photo

// Anti-Anime/Cartoon
anime, cartoon, cel shading, flat color, manga, chibi,
line art, vector art, clip art, comic book

// Anti-AI-Artifacts
deformed, disfigured, bad anatomy, extra fingers, mutated hands,
poorly drawn face, blurry, watermark, signature, text, logo

// Style Purity
3d render, CGI, digital art, smooth gradient, plastic skin,
oversaturated, neon colors, flat lighting, stock photo
```

### Campaign Style Modifiers

Campaigns can MODIFY but never OVERRIDE the baseline. Modifiers are additive:
- **Dark Fantasy:** append `dark moody atmosphere, muted earth tones, grim shadows`
- **High Fantasy:** append `vibrant magical glow, ethereal light, majestic`
- **Steampunk:** append `brass and copper accents, steam, mechanical elements, Victorian`
- **Horror:** append `unsettling, eerie shadows, pale sickly lighting`

The style bible prefix remains constant. Campaign themes layer on top.

### Style Drift Prevention (Long-Term)

1. **Lock the checkpoint** — never switch FLUX.1 Dev version mid-project
2. **Always-on style LoRA** — same LoRA for every generation
3. **Fixed style prefix** — the style bible prompt never changes
4. **Periodic audit** — compare new generations against a curated reference corpus
5. **Seed logging** — record which seeds produce good results for similar compositions
6. **Phase 2: Custom GRO.WTH style LoRA** trained on 50-200 curated approved images

---

## 8. Database Schema (Prisma — NOT Supabase)

The project uses **Prisma 7 + SQLite**. No Supabase. Images stored on the local filesystem with paths in the database.

### New Models

```prisma
model PortraitGeneration {
  id              String   @id @default(cuid())
  characterId     String
  character       Character @relation(fields: [characterId], references: [id], onDelete: Cascade)

  // Image storage
  imagePath       String              // Relative path: portraits/{characterId}/{id}.webp
  thumbnailPath   String?             // Smaller version for lists/tokens

  // Generation metadata
  prompt          String              // Full prompt used
  negativePrompt  String              // Full negative prompt used
  seed            Int
  model           String              // e.g. "flux1-dev-q4_0"
  steps           Int
  pulidWeight     Float?
  styleLoraName   String?
  styleLoraWeight Float?
  generationTimeMs Int

  // State snapshot (what the character looked like at generation time)
  stateSnapshot   String              // JSON: equipment, wounds, conditions at generation time

  // Status
  status          String   @default("completed")  // pending, completed, failed, accepted, archived
  isCurrentPortrait Boolean @default(false)        // True for the active portrait

  // Campaign context
  campaignId      String?

  createdAt       DateTime @default(now())

  @@index([characterId])
  @@index([characterId, isCurrentPortrait])
}

model PersonaLock {
  id              String   @id @default(cuid())
  characterId     String   @unique
  character       Character @relation(fields: [characterId], references: [id], onDelete: Cascade)

  // Identity anchors
  referenceImagePath  String          // Path to the locked reference portrait
  embeddingPath       String          // Path to face embedding file (.safetensors or .bin)
  lockedPrompt        String          // The exact identity portion of the prompt
  lockedSeed          Int             // Seed of the accepted generation

  // Style config at lock time
  styleLora       String?
  loraStrength    Float    @default(0.6)
  pulidWeight     Float    @default(0.8)

  // Lock history
  lockVersion     Int      @default(1)     // Increments on re-lock
  previousLockId  String?                  // Points to archived lock

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Storage Layout

```
app/
  public/
    portraits/
      {characterId}/
        {generationId}.webp           # Full portrait (1024x1024)
        {generationId}_thumb.webp     # Thumbnail (256x256)
      locks/
        {characterId}_reference.webp  # Persona lock reference image
      embeddings/
        {characterId}_face.bin        # PuLID face embedding
```

### Character Model Update

Add to existing `Character` model:
```prisma
model Character {
  // ... existing fields ...
  portrait          String?               // Path to current portrait (already exists)
  portraitGenerations PortraitGeneration[]
  personaLock       PersonaLock?
}
```

---

## 9. ComfyUI Integration Architecture

### Service Layout

```
app/src/
  ai/
    portraits/
      types.ts                    # All interfaces (PortraitInput, PortraitResult, etc.)
      prompt-builder.ts           # Character data → prompt translation
      portrait-service.ts         # Main service (orchestrates everything)
      style-config.ts             # Style bible, negative prompts, campaign modifiers
      state-diff.ts               # Detects visual changes between portrait states
      providers/
        index.ts                  # Provider factory
        local.ts                  # LocalProvider (ComfyUI client)
        cloud.ts                  # CloudProvider (stub)
      workflows/
        character-portrait.json   # ComfyUI workflow template (exported from GUI)
        character-portrait-pulid.json  # With PuLID identity injection
```

### ComfyUI Client (Inside LocalProvider)

```typescript
// ai/portraits/providers/local.ts

class LocalProvider implements ImageGenerationProvider {
  private comfyUrl = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.comfyUrl}/system_stats`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generatePortrait(input: PortraitInput): Promise<PortraitResult> {
    // 1. Build prompt from character data
    const promptOutput = buildPortraitPrompt(input.characterData, getStyleConfig());

    // 2. Load workflow template
    const workflow = input.personaLock
      ? loadWorkflow('character-portrait-pulid')
      : loadWorkflow('character-portrait');

    // 3. Inject prompt, seed, reference image into workflow JSON
    const preparedWorkflow = injectWorkflowParams(workflow, {
      prompt: promptOutput.prompt,
      negativePrompt: promptOutput.negativePrompt,
      seed: input.overrides?.seed ?? randomSeed(),
      referenceImage: input.personaLock?.referenceImagePath,
      pulidWeight: input.personaLock?.pulidWeight ?? 0.8,
      styleLora: getStyleConfig().styleLora,
      styleLoraWeight: getStyleConfig().loraStrength,
    });

    // 4. Queue in ComfyUI
    const clientId = crypto.randomUUID();
    const { prompt_id } = await this.queuePrompt(preparedWorkflow, clientId);

    // 5. Poll for completion (or WebSocket in production)
    const result = await this.waitForCompletion(prompt_id);

    // 6. Download and save the generated image
    const imageBuffer = await this.downloadImage(result.outputFilename);
    const imagePath = await savePortraitImage(input.characterData.characterId, imageBuffer);

    return {
      success: true,
      imageData: imageBuffer,
      imagePath,
      metadata: { /* ... generation params ... */ },
    };
  }
}
```

### VRAM Management

Since the RTX 4060 has only 8GB and Ollama (gemma2:9b) shares VRAM:

```typescript
// ai/portraits/providers/local.ts — VRAM management

async function ensureVramAvailable(): Promise<void> {
  // 1. Ask Ollama to unload its model
  try {
    await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({ model: 'gemma2:9b', keep_alive: 0 }),
    });
  } catch {
    // Ollama may not be running — that's fine
  }

  // 2. Wait a moment for VRAM to free
  await new Promise(r => setTimeout(r, 2000));

  // 3. ComfyUI will load models on demand via --lowvram
}

async function releaseVram(): Promise<void> {
  // Tell ComfyUI to free VRAM after generation
  try {
    await fetch(`${comfyUrl}/free`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  } catch {
    // Non-critical
  }
}
```

---

## 10. API Routes

```
POST /api/portraits/generate          # Queue a portrait generation
GET  /api/portraits/status/{id}       # Check generation status
GET  /api/portraits/{characterId}     # Get all portraits for a character
POST /api/portraits/{id}/accept       # Accept a portrait (set as current)
POST /api/portraits/{id}/lock         # Lock portrait as persona identity
GET  /api/portraits/provider/status   # Check if generation service is available
DELETE /api/portraits/{id}            # Delete a portrait from history
```

All routes are thin wrappers following project architecture (parse → validate → service → response).

---

## 11. UI Integration Points

Portraits appear in the existing UI at these locations (no new components needed yet):

| Location | Current State | Integration |
|----------|--------------|-------------|
| CharacterCard (canvas) | Shows `portrait` field | No change — just provide better images |
| Character Sheet | Placeholder | Add "Generate Portrait" button |
| Campaign Cards | Shows character portraits | No change |
| Profile | Avatar upload exists | Separate system — don't merge |

### New UI Needed (Phase A)

1. **Portrait Generation Panel** — on character sheet, shows:
   - "Generate Portrait" button (first generation)
   - "Regenerate" button (subsequent, uses persona lock)
   - Steering word input (free text additions to prompt)
   - Generation preview (before accepting)
   - History carousel (previous generations)
   - "Lock Portrait" / "Re-Lock" button

2. **Generation Status Indicator** — small spinner/badge while generation is in progress (~20-30s)

3. **Provider Status Badge** — shows if ComfyUI is available (in campaign settings or terminal)

---

## 12. Implementation Phases

### Phase A: Basic Generation (MVP)
1. Install ComfyUI locally with FLUX.1 Dev Q4_0 GGUF
2. Install PuLID-Flux ComfyUI node + dependencies
3. Design workflow in ComfyUI GUI, export as JSON API format
4. Build `ai/portraits/` service layer (types, prompt builder, local provider)
5. Build Prisma migration (PortraitGeneration, PersonaLock models)
6. Build API routes (generate, status, list, accept)
7. Build "Generate Portrait" button + preview UI on character sheet
8. Save portraits to filesystem, paths in DB
9. Test with a character end-to-end

### Phase B: Persona Lock + Identity Consistency
1. Add PuLID identity injection to workflow
2. Build persona lock flow (lock → store embedding → use on regenerate)
3. Build state diff system (detect visual changes)
4. Build "Lock Portrait" UI with explanation of what it means
5. Test: generate → lock → change equipment → regenerate → verify same face

### Phase C: Dynamic Updates + Kontext
1. Add FLUX.1 Kontext Dev for instruction-based portrait editing
2. Equipment/injury/condition change triggers prompt-based edits on existing portrait
3. Side-by-side comparison UI (old vs new portrait)
4. Portrait history with accept/reject flow

### Phase D: Style Training + ControlNet
1. Curate 50-200 approved-style reference images from Phase A-C generations
2. Train custom GRO.WTH style LoRA (`gwthart`)
3. Add ControlNet OpenPose for pose variation (combat, sitting, action)
4. Build pose library (standard compositions)
5. Campaign-level style override system

### Phase E: Advanced (Future)
- Cloud provider implementation (BFL API / Replicate / hosted ComfyUI)
- LoRA training for recurring NPCs (Watcher premium feature)
- Automated style drift detection (embedding distance comparison)
- DPO/SPO aesthetic fine-tuning
- All stub pipeline types (tokens, items, maps, locations, banners)

---

## 13. Setup Script Outline

```bash
#!/bin/bash
# setup-portrait-pipeline.sh

echo "=== GRO.WTH Portrait Pipeline Setup ==="

# 1. Install ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git C:/AI/ComfyUI
cd C:/AI/ComfyUI
pip install -r requirements.txt

# 2. Install custom nodes
cd custom_nodes
git clone https://github.com/city96/ComfyUI-GGUF.git
git clone https://github.com/balazik/ComfyUI-PuLID-Flux.git
pip install -r ComfyUI-PuLID-Flux/requirements.txt

# 3. Download models
# FLUX.1 Dev Q4_0 GGUF (~6.8 GB)
huggingface-cli download city96/FLUX.1-dev-gguf flux1-dev-Q4_0.gguf --local-dir ../models/unet/

# T5-XXL GGUF (quantized text encoder)
huggingface-cli download city96/t5-v1_1-xxl-encoder-gguf t5-v1_1-xxl-encoder-Q4_K_M.gguf --local-dir ../models/clip/

# CLIP-L
huggingface-cli download comfyanonymous/flux_text_encoders clip_l.safetensors --local-dir ../models/clip/

# VAE
huggingface-cli download black-forest-labs/FLUX.1-dev ae.safetensors --local-dir ../models/vae/

# PuLID models
huggingface-cli download guozinan/PuLID pulid_flux_v0.9.1.safetensors --local-dir ../models/pulid/

# EVA-CLIP (for PuLID face embedding)
# InsightFace antelopev2 (for PuLID face detection)
# These are downloaded automatically by the PuLID node on first run

# 4. Run ComfyUI with lowvram
echo "Starting ComfyUI..."
python main.py --lowvram --listen 127.0.0.1 --port 8188

# 5. Test generation
echo "ComfyUI running at http://127.0.0.1:8188"
echo "Design your workflow in the GUI, export as API format, save to:"
echo "  app/src/ai/portraits/workflows/character-portrait.json"
```

---

## 14. Graceful Degradation

When ComfyUI is unavailable:

1. **`isAvailable()` returns false** → UI shows "Portrait generation offline"
2. **No crash, no block** — character creation works fine without portraits
3. **Placeholder** — characters without portraits show a silhouette/initial-based avatar (already exists)
4. **Queue persistence** — if a generation request is made while offline, it could be queued in the DB and processed when ComfyUI comes back (Phase B+ feature)
5. **Ollama co-pilot unaffected** — VRAM management ensures they don't conflict (one runs at a time)

---

## 15. Open Decisions for Mike

1. **ComfyUI install location** — `C:\AI\ComfyUI`? Or somewhere else?
2. **Art style:** Should campaigns be able to set their own style LoRA, or is the global GRO.WTH style always enforced? (Recommendation: global baseline + campaign modifiers, not full override)
3. **Generation visibility:** Can players generate unlimited portraits, or is it rate-limited? (Affects KRMA economy — each generation could cost KRMA)
4. **Portrait approval flow:** Do GMs need to approve player portrait regenerations, or is it player-only? (Recommendation: player-only for their own characters)
5. **SDXL fallback:** Worth maintaining an SDXL path (DreamShaper XL) for superior painterly style, or go all-in on Flux? (Recommendation: Flux-only for now, revisit if style quality disappoints)
6. **When to start Phase A?** This requires ComfyUI setup, model downloads (~15 GB), and workflow design before any code is written.

---

## Research Documents

All research supporting this plan is in `docs/`:
- `CHARACTER-CONSISTENCY-RESEARCH.md` — 12 approaches evaluated
- `STYLE-CONSISTENCY-RESEARCH.md` — Style LoRA, prompting, drift prevention
- `research-local-image-gen-2026.md` — Toolchain comparison, VRAM guide, API patterns
- `PORTRAIT-PIPELINE.md` — Original design (needs FLUX.2 → FLUX.1 correction)
