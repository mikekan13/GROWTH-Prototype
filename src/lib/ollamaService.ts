interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface BackstoryGenerationParams {
  characterName: string;
  hair?: string;
  eyes?: string;
  physicalFeatures?: string;
  childhood?: string;
  significantEvent?: string;
  motivation?: string;
  fears?: string;
  relationships?: string;
  goals?: string;
  campaignName: string;
  campaignGenre?: string;
  campaignThemes?: string;
  campaignDescription?: string;
  worldName?: string;
  worldDescription?: string;
}

export class OllamaService {
  private static readonly DEFAULT_MODEL = "llama3.2";
  private static readonly BASE_URL = "http://localhost:11434";

  static async generateBackstory(params: BackstoryGenerationParams): Promise<string> {
    try {
      const prompt = this.buildBackstoryPrompt(params);

      const response = await fetch(`${this.BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.DEFAULT_MODEL,
          prompt: prompt,
          stream: false
        } as OllamaGenerateRequest)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OllamaGenerateResponse;
      return data.response.trim();
    } catch (error) {
      console.error('Failed to generate backstory with Ollama:', error);
      throw new Error('Failed to generate backstory. Make sure Ollama is running locally.');
    }
  }

  private static buildBackstoryPrompt(params: BackstoryGenerationParams): string {
    const {
      characterName,
      hair,
      eyes,
      physicalFeatures,
      childhood,
      significantEvent,
      motivation,
      fears,
      relationships,
      goals,
      campaignName,
      campaignGenre,
      campaignThemes,
      campaignDescription,
      worldName,
      worldDescription
    } = params;

    // Build character details section
    let characterDetails = `Character Name: ${characterName}\n`;
    if (hair) characterDetails += `Hair: ${hair}\n`;
    if (eyes) characterDetails += `Eyes: ${eyes}\n`;
    if (physicalFeatures) characterDetails += `Physical Features: ${physicalFeatures}\n`;

    // Build backstory elements section
    let backstoryElements = '';
    if (childhood) backstoryElements += `Childhood: ${childhood}\n`;
    if (significantEvent) backstoryElements += `Significant Event: ${significantEvent}\n`;
    if (motivation) backstoryElements += `Motivation: ${motivation}\n`;
    if (fears) backstoryElements += `Fears: ${fears}\n`;
    if (relationships) backstoryElements += `Relationships: ${relationships}\n`;
    if (goals) backstoryElements += `Goals: ${goals}\n`;

    // Build campaign context section
    let campaignContext = `Campaign: ${campaignName}\n`;
    if (campaignGenre) campaignContext += `Genre: ${campaignGenre}\n`;
    if (campaignThemes) campaignContext += `Themes: ${campaignThemes}\n`;
    if (campaignDescription) campaignContext += `Description: ${campaignDescription}\n`;
    if (worldName) {
      campaignContext += `World: ${worldName}\n`;
      if (worldDescription) campaignContext += `World Description: ${worldDescription}\n`;
    }

    return `You are a creative writing assistant helping to generate a compelling character backstory for a tabletop RPG campaign.

CAMPAIGN CONTEXT:
${campaignContext}

CHARACTER DETAILS:
${characterDetails}

BACKSTORY ELEMENTS:
${backstoryElements}

TASK: Write a cohesive, engaging narrative backstory (400-600 words) that:
1. Integrates all the provided character details and backstory elements
2. Fits naturally within the campaign's genre, themes, and world
3. Creates meaningful connections between the character's past and their current goals
4. Uses vivid, immersive language that brings the character to life
5. Provides hooks for the GM to use in the campaign

Write the backstory in third person, past tense, as a flowing narrative. Focus on storytelling rather than listing facts.

BACKSTORY:`;
  }

  static async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.BASE_URL}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      return response.ok;
    } catch (error) {
      console.error('Ollama connection check failed:', error);
      return false;
    }
  }

  static async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.BASE_URL}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.models?.map((model: { name: string }) => model.name) || [];
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return [];
    }
  }
}