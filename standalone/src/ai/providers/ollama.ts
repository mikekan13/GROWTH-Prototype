import 'server-only';
import type { AIProvider, GenerateOptions, ChatMessage } from '../types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma2:9b';
const OLLAMA_TIMEOUT = 90_000;

export class OllamaProvider implements AIProvider {
  private async ollamaFetch(endpoint: string, body: Record<string, unknown>): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    try {
      const res = await fetch(`${OLLAMA_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Ollama error ${res.status}: ${text}`);
      }

      const data = await res.json();
      return (data.response || data.message?.content || '').trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('AI request timed out');
      }
      if (error instanceof Error && error.message.includes('fetch failed')) {
        throw new Error('AI unavailable — is Ollama running?');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    return this.ollamaFetch('/api/generate', {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 512,
        stop: options?.stop,
      },
    });
  }

  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    return this.ollamaFetch('/api/chat', {
      model: OLLAMA_MODEL,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 1024,
        stop: options?.stop,
      },
    });
  }
}
