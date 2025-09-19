/**
 * AI Service Abstraction Layer
 * Works with Ollama (local) now, easily swappable to OpenAI/Claude APIs later
 */

class AIService {
  constructor(config = {}) {
    this.provider = config.provider || 'ollama';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'qwen2.5:7b';
    this.apiKey = config.apiKey || null;
  }

  /**
   * Generate NPC with structured data
   */
  async generateNPC(context = {}) {
    const prompt = `Generate a fantasy NPC for a GROWTH tabletop RPG campaign.

Context: ${context.location || 'tavern'}, ${context.situation || 'general encounter'}

Return a JSON object with:
{
  "name": "Full name",
  "race": "Fantasy race", 
  "occupation": "Job/role",
  "personality": "2-3 key traits",
  "appearance": "Brief physical description",
  "backstory": "2-3 sentence background",
  "motivation": "What drives them",
  "stats": {
    "level": 1-10,
    "health": "number",
    "notable_skills": ["skill1", "skill2"]
  },
  "dialogue_samples": [
    "Example greeting",
    "Example response"
  ]
}

Only return the JSON, no other text.`;

    return await this._generate(prompt);
  }

  /**
   * Generate campaign event summary
   */
  async generateEventSummary(rawData) {
    const prompt = `Summarize this GROWTH RPG campaign event into a structured format:

Raw event: "${rawData}"

Return JSON:
{
  "summary": "Brief 1-2 sentence summary",
  "key_actors": ["character1", "character2"],
  "event_type": "scene|combat|social|exploration|lore",
  "importance": "minor|moderate|major",
  "consequences": "What might happen next",
  "tags": ["tag1", "tag2"]
}

Only return the JSON.`;

    return await this._generate(prompt);
  }

  /**
   * Enhance character sheet data
   */
  async enhanceCharacterSheet(partialData) {
    const prompt = `Complete this GROWTH RPG character sheet with missing details:

Existing data: ${JSON.stringify(partialData, null, 2)}

Fill in missing fields and return complete JSON suitable for Google Sheets:
{
  "name": "Character name",
  "race": "Character race",
  "class": "Character class", 
  "level": 1,
  "background": "Character background",
  "stats": {
    "strength": 10,
    "agility": 10,
    "intellect": 10,
    "spirit": 10
  },
  "skills": ["skill1", "skill2"],
  "equipment": ["item1", "item2"],
  "backstory": "Character history",
  "goals": "Character motivations"
}

Only return the JSON.`;

    return await this._generate(prompt);
  }

  /**
   * Core generation method - handles different AI providers
   */
  async _generate(prompt) {
    try {
      switch (this.provider) {
        case 'ollama':
          return await this._generateOllama(prompt);
        case 'openai':
          return await this._generateOpenAI(prompt);
        case 'claude':
          return await this._generateClaude(prompt);
        default:
          throw new Error(`Unknown AI provider: ${this.provider}`);
      }
    } catch (error) {
      console.error('AI generation failed:', error);
      return { error: error.message };
    }
  }

  /**
   * Ollama generation (current implementation)
   */
  async _generateOllama(prompt) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 1000
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Try to parse JSON from response
    try {
      return JSON.parse(data.response.trim());
    } catch {
      // If not valid JSON, return as text
      return { text: data.response.trim() };
    }
  }

  /**
   * OpenAI generation (future implementation)
   */
  async _generateOpenAI(prompt) {
    // TODO: Implement when API key available
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000
      }),
    });

    const data = await response.json();
    try {
      return JSON.parse(data.choices[0].message.content.trim());
    } catch {
      return { text: data.choices[0].message.content.trim() };
    }
  }

  /**
   * Claude generation (future implementation) 
   */
  async _generateClaude(prompt) {
    // TODO: Implement when API key available
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    const data = await response.json();
    try {
      return JSON.parse(data.content[0].text.trim());
    } catch {
      return { text: data.content[0].text.trim() };
    }
  }
}

// Easy configuration switching
const createAIService = (environment = 'development') => {
  const configs = {
    development: {
      provider: 'ollama',
      model: 'qwen2.5:7b',
      baseUrl: 'http://localhost:11434'
    },
    production: {
      provider: 'openai', // or 'claude'
      apiKey: process.env.OPENAI_API_KEY, // or ANTHROPIC_API_KEY
      model: 'gpt-4o-mini' // or 'claude-3-haiku-20240307'
    }
  };

  return new AIService(configs[environment]);
};

export { AIService, createAIService };