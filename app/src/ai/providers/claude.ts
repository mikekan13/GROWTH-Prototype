import 'server-only';
import type { LaneName } from '@/ai/network';
import { RoutedProvider, type RoutedProviderTask } from './routed';

/** What a ClaudeProvider call site declares to the wall. */
export interface ClaudeProviderTask extends Omit<RoutedProviderTask, 'lane' | 'timeoutMs'> {
  /** Default 'godhead' (deep-reasoning Claude tier). */
  lane?: LaneName;
}

/**
 * Claude text provider — RoutedProvider on a Claude lane (default 'godhead').
 * The wall still decides: table/real content throws before any transport.
 */
export class ClaudeProvider extends RoutedProvider {
  constructor(task: ClaudeProviderTask) {
    super({ ...task, lane: task.lane ?? 'godhead' });
  }
}
