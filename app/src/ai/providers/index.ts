import 'server-only';
import type { AIProvider } from '../types';
import { textProvider } from '@/ai/network';
import { OllamaProvider } from './ollama';
import { PodProvider } from './pod';
import { ClaudeProvider, type ClaudeProviderTask } from './claude';

let cachedOllama: AIProvider | null = null;

/**
 * Default AI provider for QoL text features. AI_PROVIDER picks it:
 *   pod (default) — the serverless text lane (inside the wall)
 *   claude        — Anthropic through the wall
 *   ollama        — a local Ollama, explicit opt-in ONLY (never a default:
 *                   Christophoros was shut down 2026-10-13)
 * The task is what the wall needs: caller + content class.
 */
export function getAIProvider(task: ClaudeProviderTask): AIProvider {
  const choice = textProvider();
  if (choice === 'claude') return new ClaudeProvider(task);
  if (choice === 'ollama') {
    if (!cachedOllama) cachedOllama = new OllamaProvider();
    return cachedOllama;
  }
  return new PodProvider(task);
}

/** Claude provider for God-head operations (deep reasoning), routed through
 *  the wall: the caller declares what the text is. */
export function getGodheadProvider(task: ClaudeProviderTask): AIProvider {
  return new ClaudeProvider(task);
}
