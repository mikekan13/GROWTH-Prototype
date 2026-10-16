// AI provider abstraction — interface-based so cloud models can drop in later

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;
}

// ── Campaign AI Settings ─────────────────────────────────────────────────
// Stored as JSON in Campaign.aiSettings

export type AIProviderChoice = 'local' | 'cloud';

/** Which AI features can be configured per-campaign by the GM */
export type AIFeature =
  | 'portraitGeneration'       // Image generation (ComfyUI local vs cloud)
  | 'referenceDescription'    // Describe reference photos (Ollama vision vs Claude)
  | 'copilot'                 // Campaign co-pilot chat (Ollama vs Claude)
  | 'forgeAuthoring';         // Kai blueprint authoring (cloud-only, not configurable)

/** Per-campaign AI configuration set by the GM */
export interface CampaignAISettings {
  /** Default provider for configurable features */
  defaultProvider: AIProviderChoice;
  /** Per-feature overrides */
  overrides?: Partial<Record<AIFeature, AIProviderChoice>>;
  /** Local model name for vision tasks (e.g. 'llava', 'llama3.2-vision') */
  localVisionModel?: string;
  /** Local model name for text tasks (e.g. 'gemma2:9b') */
  localTextModel?: string;
  /**
   * Recursive genesis (Mike 2026-10-16, [[ruling-world-building-recursion-jewl-swarm-personality-2026-10-16]]):
   * every person JEWL seeds during a character's WORLD stage gets her own
   * SKETCH-tier genesis in the background (sail mode, depth 1). Default ON;
   * the Watcher may turn it off per campaign.
   */
  recursiveGenesis?: boolean;
}

/** Is recursive genesis on for these settings? Pure — default ON. */
export function recursiveGenesisEnabled(settings: Pick<CampaignAISettings, 'recursiveGenesis'> | null | undefined): boolean {
  return settings?.recursiveGenesis !== false;
}

/** Features that MUST use cloud (Claude) — GM cannot override */
export const CLOUD_ONLY_FEATURES: AIFeature[] = ['forgeAuthoring'];

/** Default settings when none configured */
export const DEFAULT_AI_SETTINGS: CampaignAISettings = {
  defaultProvider: 'cloud',
  localVisionModel: 'llava',
  localTextModel: 'gemma2:9b',
};
