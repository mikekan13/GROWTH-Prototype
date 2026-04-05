import 'server-only';
import type { AIProvider } from '../types';
import { OllamaProvider } from './ollama';
import { ClaudeProvider } from './claude';

let cachedProvider: AIProvider | null = null;
let cachedClaudeProvider: AIProvider | null = null;

/** Default AI provider (Ollama for QoL features, configurable via AI_PROVIDER env) */
export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.AI_PROVIDER || 'ollama';

  switch (provider) {
    case 'claude':
      cachedProvider = new ClaudeProvider();
      break;
    case 'ollama':
    default:
      cachedProvider = new OllamaProvider();
      break;
  }

  return cachedProvider;
}

/** Claude provider specifically for God-head operations (deep reasoning required) */
export function getGodheadProvider(): AIProvider {
  if (cachedClaudeProvider) return cachedClaudeProvider;
  cachedClaudeProvider = new ClaudeProvider();
  return cachedClaudeProvider;
}
