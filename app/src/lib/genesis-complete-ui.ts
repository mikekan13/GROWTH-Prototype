/**
 * UI-free logic for the "Complete" action (2026-10-12) — finishing an already
 * BORN character via POST /api/characters/[id]/complete. Pure predicate +
 * result-line formatter + a small fetch wrapper that never throws.
 */

export interface CompleteResult {
  opened: boolean;
  sessionId: string | null;
  stages: string[];
  removedDuplicateLinks: number;
  seedCorrections: string[];
}

/** Show the Complete action? Watcher/ADMIN only, character BORN, genesis not running. Pure. */
export function shouldShowComplete(o: {
  isGM: boolean;
  genesisState?: string | null; // GenesisProgress.state
  characterStatus?: string | null; // 'ACTIVE' once awake
  genesisTier?: string | null; // 'SKETCH'
  genesisRunning: boolean;
  hasCharacter?: boolean;
}): boolean {
  if (!o.isGM || o.genesisRunning || o.hasCharacter === false) return false;
  return o.genesisState === 'done' || o.characterStatus === 'ACTIVE' || o.genesisTier === 'SKETCH';
}

function corrections(c: string[]): string {
  return c.length ? c.join('; ') : 'none';
}

/** The one-line outcome shown after tapping Complete. Pure. */
export function formatCompleteResult(r: CompleteResult): string {
  if (r.opened) {
    const base = `JEWL is completing: ${r.stages.join(' → ')}`;
    return r.seedCorrections.length ? `${base}. Seed corrections: ${corrections(r.seedCorrections)}` : base;
  }
  if (r.removedDuplicateLinks > 0 || r.seedCorrections.length > 0) {
    return `Nothing missing — ${r.removedDuplicateLinks} duplicate links removed, corrections: ${corrections(r.seedCorrections)}`;
  }
  return 'Already complete';
}

export type CompleteOutcome = { ok: true; opened: boolean; line: string } | { ok: false; line: string };

/** POST the route; always resolves to a human line (never a bare "Internal server error"). */
export async function requestComplete(
  characterId: string,
  fetchFn: typeof fetch = fetch,
): Promise<CompleteOutcome> {
  try {
    const res = await fetchFn(`/api/characters/${characterId}/complete`, { method: 'POST' });
    let body: Partial<CompleteResult> & { error?: string; message?: string } = {};
    try { body = await res.json(); } catch { /* non-JSON body */ }
    if (!res.ok) {
      const msg = body.error || body.message;
      if (res.status === 409) return { ok: false, line: msg || 'Genesis is already running for this character.' };
      return { ok: false, line: msg && !/^internal server error$/i.test(msg) ? msg : `Could not complete (HTTP ${res.status}) — try again.` };
    }
    const r: CompleteResult = {
      opened: !!body.opened,
      sessionId: body.sessionId ?? null,
      stages: body.stages ?? [],
      removedDuplicateLinks: body.removedDuplicateLinks ?? 0,
      seedCorrections: body.seedCorrections ?? [],
    };
    return { ok: true, opened: r.opened, line: formatCompleteResult(r) };
  } catch (err) {
    return { ok: false, line: err instanceof Error ? err.message : 'Could not complete — network error.' };
  }
}
