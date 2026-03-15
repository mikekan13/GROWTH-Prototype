import 'server-only';
import type { AIProvider } from '../types';
import { OllamaProvider } from './ollama';

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.AI_PROVIDER || 'ollama';

  switch (provider) {
    case 'ollama':
    default:
      cachedProvider = new OllamaProvider();
      break;
  }

  return cachedProvider;
}
