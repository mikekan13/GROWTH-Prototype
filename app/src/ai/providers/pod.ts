import 'server-only';
import { RoutedProvider, type RoutedProviderTask } from './routed';

/** Cold start of the serverless worker is ~100 s (AOT cache) — allow for it. */
export const POD_PROVIDER_TIMEOUT_MS = 5 * 60_000;

/**
 * The pod text provider — RoutedProvider pinned to the 'local' lane: the
 * RunPod serverless vLLM endpoint ("growth-text", OpenAI-compatible) that is
 * company compute inside the wall. The default QoL text provider since
 * Christophoros/Ollama was shut down (2026-10-13). Fails with a clear error
 * when AI_LOCAL_BASE_URL is unset — never falls back to localhost.
 */
export class PodProvider extends RoutedProvider {
  constructor(task: Omit<RoutedProviderTask, 'lane'>) {
    super({ timeoutMs: POD_PROVIDER_TIMEOUT_MS, ...task, lane: 'local' });
  }
}
