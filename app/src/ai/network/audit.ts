/**
 * ai/network/audit — the wall's grep-able audit trail (Mike 2026-10-12).
 *
 *   [wall→cloud] … exactly ONE line per request that actually goes to Claude
 *                  (routedChatText, the tool-use transport). Never for local.
 *   [wall✗]      … one line per refusal.
 *
 * Never logs text — only sizes, counts and ids.
 *   grep "\[wall→cloud\]" / grep "\[wall✗\]"
 */
import type { ContentClass, LaneName } from './types';

export interface CloudAudit {
  caller: string;
  lane: LaneName | string;
  contentClass: ContentClass;
  /** UTF-8 bytes of everything sent (system + messages; image data counted as sent). */
  bytesIn: number;
  /** Payload pieces the tone filter changed on the way out. */
  chunksToned: number;
  campaignId?: string;
}

/** Counts pieces the tone filter changed, across a request's assembly. */
export interface ToneTally {
  toned: number;
}

export function newToneTally(): ToneTally {
  return { toned: 0 };
}

export function utf8Bytes(...parts: string[]): number {
  let n = 0;
  for (const p of parts) n += Buffer.byteLength(p, 'utf8');
  return n;
}

export function cloudAuditLine(a: CloudAudit): string {
  return `[wall→cloud] caller=${a.caller} lane=${a.lane} class=${a.contentClass} bytes_in=${a.bytesIn} toned=${a.chunksToned > 0 ? 'yes' : 'no'} chunks_toned=${a.chunksToned} campaign=${a.campaignId || '-'}`;
}

/** The one line for a request that actually goes to Claude. */
export function auditCloudCall(a: CloudAudit): void {
  console.info(cloudAuditLine(a));
}

/** The one line for a refusal. `reason` is a short token, never content. */
export function auditRefusal(caller: string, contentClass: ContentClass | '-', reason: string): void {
  console.warn(`[wall✗] caller=${caller} class=${contentClass} reason=${reason}`);
}
