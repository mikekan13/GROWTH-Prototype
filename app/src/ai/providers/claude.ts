import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions } from '../types';

/**
 * Claude AI provider via Anthropic API.
 * Used by God-heads for deep reasoning (blueprint authoring, karmic evaluation, custodian assignment).
 * NOT used for QoL features (those use Ollama).
 */
export class ClaudeProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com';
    this.defaultModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

    if (!this.apiKey) {
      console.warn('ANTHROPIC_API_KEY not set — Claude provider will fail on requests');
    }
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    return this.chat(
      [{ role: 'user', content: prompt }],
      options,
    );
  }

  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 2048;

    // Extract system message if present
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      max_tokens: maxTokens,
      temperature,
      messages: nonSystemMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (options?.stop?.length) {
      body.stop_sequences = options.stop;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlocks = data.content.filter(b => b.type === 'text');
    return textBlocks.map(b => b.text || '').join('');
  }
}
