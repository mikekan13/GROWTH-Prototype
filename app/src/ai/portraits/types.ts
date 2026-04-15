/**
 * GRO.WTH Portrait Pipeline — Type Definitions
 *
 * All interfaces for the AI image generation system.
 * Character portraits are dynamic representations that update with game state.
 */

// ============================================================
// Pipeline Types
// ============================================================

export type PipelineType =
  | 'character_portrait'      // Full character portrait (BUILD)
  | 'character_token'         // Circle token for map/combat
  | 'profile_image'           // Smaller portrait for profiles/lists
  | 'map_location'            // Location/area illustration
  | 'item_illustration'       // Equipment/item art
  | 'npc_portrait'            // NPC portraits (same pipeline, no persona lock)
  | 'location_scene'          // Full scene illustration
  | 'campaign_banner';        // Wide banner image for campaign header

// ============================================================
// Provider Interface
// ============================================================

export interface ImageGenerationProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  generatePortrait(input: PortraitInput): Promise<PortraitResult>;
  extractIdentity(imageData: Buffer): Promise<IdentityData>;
  getStatus(): Promise<ProviderStatus>;
}

export interface ProviderStatus {
  available: boolean;
  gpuLoaded: boolean;
  queueLength: number;
  vramUsageMb?: number;
  error?: string;
}

// ============================================================
// Portrait Generation
// ============================================================

export interface PortraitInput {
  characterId: string;
  characterData: PortraitCharacterData;
  personaLock: PersonaLockData | null;     // null = first generation (no identity anchor)
  pipelineType: PipelineType;
  campaignStyle?: CampaignStyleConfig;
  overrides?: PortraitOverrides;
  creationMode?: boolean;                   // true = nude/bare character for identity baseline (used for Step 1 face + body gen)
}

export interface PortraitOverrides {
  steeringWords?: string[];                // "battle-worn", "smiling", "hooded"
  seed?: number;                           // For reproducibility
  composition?: 'bust' | 'half_body' | 'full_body' | 'action';
  anglePreset?: 'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right';  // Identity Lock angles
  environmentOverride?: string;            // Override environment description
  quality?: 'sketch' | 'draft' | 'final';  // sketch=512/6steps/style only, draft=640/15/style+detail, final=768/20/all
  baseImagePath?: string;                  // img2img: use as starting latent instead of empty (for refine pass)
  denoise?: number;                        // img2img denoise strength (0.0-1.0, default 1.0 = full txt2img)
  skipControlNet?: boolean;                // Disable ControlNet injection even if anglePreset is set. Used for Step 1 face discovery — ControlNet adds contour bleed we don't want until Step 2 refine.
}

export interface PortraitResult {
  success: boolean;
  imageData?: Buffer;
  imagePath?: string;                      // Where stored on disk (relative to public/)
  thumbnailPath?: string;                  // Smaller version
  metadata: PortraitMetadata;
  error?: string;
}

export interface PortraitMetadata {
  prompt: string;                          // T5-XXL prompt (human-readable, for logs/debug)
  clipL?: string;                          // CLIP-L tags (for reproduction)
  negativePrompt: string;
  seed: number;
  model: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  generationTimeMs: number;
  pulidWeight?: number;
  styleLoraName?: string;
  styleLoraWeight?: number;
  campaignLoraName?: string;
  campaignLoraWeight?: number;
}

// ============================================================
// Character Data for Portrait Generation
// ============================================================

/** Flattened character data relevant to portrait generation */
export interface PortraitCharacterData {
  characterId: string;
  campaignId: string | null;

  // T1: Core Identity (always included)
  identity: {
    name: string;
    age?: number;
    sex?: string;                          // From backstory or description
    physicalDescription?: string;          // Free-text description
    skinTone?: string;
    hairColor?: string;
    hairLength?: string;
    hairTexture?: string;
    hairStyle?: string;
    cosmetics?: string;
    hygiene?: string;
    eyeColor?: string;
    bodyType?: string;                     // Build, height relative descriptors
    distinguishingFeatures?: string[];     // Birthmarks, tattoos, piercings
  };

  // T1: Species/Seed
  seed?: {
    name?: string;
    description?: string;                  // Seed-specific physical traits
  };

  // T1: Background
  root?: string;                           // Upbringing (influences bearing/demeanor)
  branches?: string[];                     // Career path (influences attire/equipment style)

  // T2: Visible Equipment
  visibleEquipment: VisibleEquipment[];

  // T3: Wounds and Status
  wounds: CharacterWound[];
  conditions: ActiveCondition[];
  attributeDepletion: AttributeDepletionState;

  // T4: Narrative Influence
  backstoryThemes?: string[];              // Key personality/backstory keywords
  personalityTraits?: string[];

  // T5: Visual Traits
  visualTraits: VisualTrait[];

  // T6: Environment
  environment?: EnvironmentContext;

}

export interface VisibleEquipment {
  slot: string;                            // head, torso, shoulders, hands, held_right, held_left, etc.
  name: string;
  material?: string;
  description?: string;
  condition: number;                       // 1-4 (Destroyed→Undamaged)
  layer: 'body' | 'clothing' | 'lightArmor' | 'heavyArmor';
}

export interface CharacterWound {
  bodyPart: string;                        // HEAD, NECK, TORSO, RIGHTARM, etc.
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  description?: string;                    // "jagged slash", "burn scar", etc.
  isVisible: boolean;                      // Whether this body part shows in portrait
}

export interface ActiveCondition {
  name: string;                            // exhausted, weak, confused, etc.
  expressionEffect: string;                // How it shows on face/body
}

export interface AttributeDepletionState {
  overallDepletion: 'fresh' | 'tired' | 'drained' | 'haggard';
  bodyDepletion: number;                   // 0-1 ratio of total body pool used
  spiritDepletion: number;                 // 0-1 ratio
  soulDepletion: number;                   // 0-1 ratio
}

export interface VisualTrait {
  name: string;
  type: 'nectar' | 'blossom' | 'thorn';
  visualDescription: string;               // How it manifests visually
}

export interface EnvironmentContext {
  location?: string;                       // "dimly lit tavern", "forest clearing"
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: string;
  campaignTheme?: string;                  // "dark fantasy", "high fantasy", etc.
}

// ============================================================
// Persona Lock
// ============================================================

export interface PersonaLockData {
  referenceImagePath: string;              // Primary reference (first photo, for backward compat)
  referenceImagePaths?: string[];          // All uploaded reference photos — batched into PuLID for stronger identity
  embeddingPath: string;                   // PuLID face embedding file
  lockedPrompt: string;                    // Identity portion of prompt at lock time
  lockedSeed: number;
  pulidWeight: number;
  bodyDescription: string;                 // Full body description locked at creation
}

export interface IdentityData {
  embeddingPath: string;
  referenceImagePath: string;
}

// ============================================================
// Style Configuration
// ============================================================

export interface StyleConfig {
  stylePrefix: string;                     // Style bible prompt
  negativePrompt: string;
  compositionSuffix: string;               // Default composition
  styleLora?: string;                      // Global GRO.WTH style LoRA filename
  loraStrength: number;                    // 0.0-1.0
  pulidWeight: number;                     // Default PuLID strength
}

export interface CampaignStyleConfig {
  campaignLora?: string;                   // Campaign-specific genre LoRA
  campaignLoraStrength?: number;
  themeModifiers?: string;                 // Additional style words for this campaign
  compositionOverride?: string;            // Campaign-specific framing
  allowNudity?: boolean;                   // Enable NSFW unlock LoRA for nude base body (Watcher toggle)
}

// ============================================================
// Prompt Builder Output
// ============================================================

export interface PromptOutput {
  clipL: string;                           // Tags/keywords for CLIP-L encoder (≤77 tokens)
  t5xxl: string;                           // Natural language sentences for T5-XXL encoder
  negativePrompt: string;                  // Minimal — FLUX ignores negatives at CFG 1.0
  identityBlock: string;                   // Stored separately for persona lock
  bodyDescriptionBlock: string;            // Stored separately for consistency
}

// ============================================================
// ComfyUI Workflow Types
// ============================================================

export interface ComfyUIWorkflowParams {
  clipL: string;                           // Tags for CLIP-L encoder
  t5xxl: string;                           // Sentences for T5-XXL encoder
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  referenceImagePath?: string;             // Primary PuLID reference (high weight)
  referenceImagePaths?: string[];          // Secondary PuLID refs — chained in a SECOND ApplyPulidFlux at low weight for "fine details from other photos" without dominating identity
  pulidWeight?: number;                    // Primary weight (default 0.8)
  secondaryPulidWeight?: number;           // Secondary weight (default 0.3) — low so fine details pull in without overpowering the primary
  pulidStartAt?: number;                   // Delay PuLID start (0.0-1.0) — lets prompt establish composition first
  pulidEndAt?: number;                     // Cut off PuLID early (0.0-1.0) — lets prompt clean up final steps
  controlnetImagePath?: string;            // For ControlNet angle reference
  controlnetStrength?: number;             // ControlNet influence (0.0-1.0)
  styleLora?: string;
  styleLoraWeight?: number;
  campaignLora?: string;
  campaignLoraWeight?: number;
  detailLoraWeight?: number;               // Extreme detailer LoRA strength (default 0.5)
  handDetailLoraWeight?: number;           // Hand detail LoRA strength (default 0.6)
  nsfwUnlock?: boolean;                    // Enable NSFW unlock LoRA + trigger word
  nsfwUnlockWeight?: number;              // NSFW unlock LoRA strength (default 0.8)
  baseImagePath?: string;                  // img2img: uploaded base image filename
  denoise?: number;                        // img2img denoise (0.0-1.0, 1.0 = txt2img)
}

export interface ComfyUIQueueResponse {
  prompt_id: string;
  number: number;
}

export interface ComfyUIHistoryOutput {
  images: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

// ============================================================
// Stub Pipeline Inputs (for future implementation)
// ============================================================

export interface PipelineInputBase {
  type: PipelineType;
  campaignId?: string;
  requestedBy: string;
  styleOverride?: CampaignStyleConfig;
}

export interface CharacterTokenInput extends PipelineInputBase {
  type: 'character_token';
  characterId: string;
  size: number;                            // px, typically 128 or 256
  borderColor?: string;                    // Pillar color
}

export interface MapLocationInput extends PipelineInputBase {
  type: 'map_location';
  locationName: string;
  description: string;
  biome?: string;
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: string;
  features: string[];
}

export interface ItemIllustrationInput extends PipelineInputBase {
  type: 'item_illustration';
  itemName: string;
  itemType: string;
  material?: string;
  description: string;
  rarity?: string;
}

export interface NPCPortraitInput extends PipelineInputBase {
  type: 'npc_portrait';
  name: string;
  species?: string;
  age?: number;
  description: string;
  role?: string;                           // "merchant", "villain", "ally"
}

export interface LocationSceneInput extends PipelineInputBase {
  type: 'location_scene';
  locationName: string;
  description: string;
  mood?: string;
  characters?: string[];                   // Character names present in scene
  timeOfDay?: 'dawn' | 'day' | 'dusk' | 'night';
}

export interface CampaignBannerInput extends PipelineInputBase {
  type: 'campaign_banner';
  campaignName: string;
  tagline?: string;
  theme?: string;
  width: number;
  height: number;
}
