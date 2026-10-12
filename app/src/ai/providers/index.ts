import 'server-only';
import type { AIProvider } from '../types';
import { OllamaProvider } from './ollama';
import { ClaudeProvider, type ClaudeProviderTask } from './claude';

let cachedOllama: AIProvider | null = null;

/** Default AI provider (Ollama for QoL features, configurable via AI_PROVIDER
 *  env). The task is what the wall needs when the provider is Claude. */
export function getAIProvider(task: ClaudeProviderTask): AIProvider {
  if ((process.env.AI_PROVIDER || 'ollama') === 'claude') return new ClaudeProvider(task);
  if (!cachedOllama) cachedOllama = new OllamaProvider();
  return cachedOllama;
}

/** Claude provider for God-head operations (deep reasoning), routed through
 *  the wall: the caller declares what the text is. */
export function getGodheadProvider(task: ClaudeProviderTask): AIProvider {
  return new ClaudeProvider(task);
}
