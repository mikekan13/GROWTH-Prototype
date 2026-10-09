/**
 * DayaMemoryEntry.perceivedVia codec (perception build, D3 2026-10-09).
 *
 * The column holds the senses that carried a perception AND, since D3, how
 * well each sense worked AT THAT MOMENT (organ effectiveness, a mind sense's
 * own) — so a moment perceived while blinded stays blurry after the eyes heal
 * (reality default). Two shapes, both JSON:
 *   - legacy:  ["sight","hearing"]                         (no stored clarity)
 *   - current: {"via":["sight"],"clarity":{"sight":0.5}}   (clarity per carried sense)
 * A row with no stored clarity for a sense falls back to the viewer's body now
 * (services/visible-form). Pure.
 */

export interface PerceivedVia {
  via: string[];
  /** Per carried sense, its effectiveness when perceived (0..1). Empty for legacy rows. */
  clarity: Record<string, number>;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Column text → senses + stored clarity. Unreadable → nothing. */
export function decodePerceivedVia(json: string | null | undefined): PerceivedVia {
  let raw: unknown;
  try { raw = JSON.parse(json ?? '[]'); } catch { return { via: [], clarity: {} }; }
  if (Array.isArray(raw)) return { via: raw.filter(isStr), clarity: {} };
  if (raw && typeof raw === 'object') {
    const o = raw as { via?: unknown; clarity?: unknown };
    const via = Array.isArray(o.via) ? o.via.filter(isStr) : [];
    const clarity: Record<string, number> = {};
    if (o.clarity && typeof o.clarity === 'object') {
      for (const [k, v] of Object.entries(o.clarity as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) clarity[k] = Math.min(1, Math.max(0, v));
      }
    }
    return { via, clarity };
  }
  return { via: [], clarity: {} };
}

/** Senses (+ clarity) → column text. No clarity → the legacy array, byte-for-byte as before. */
export function encodePerceivedVia(via: string[], clarity?: Record<string, number> | null): string {
  const kept = clarity ? Object.fromEntries(Object.entries(clarity).filter(([k, v]) => via.includes(k) && typeof v === 'number' && Number.isFinite(v))) : {};
  return Object.keys(kept).length ? JSON.stringify({ via, clarity: kept }) : JSON.stringify(via);
}

/**
 * Union two perceptions of one stretch (a joined listening stretch). Senses
 * union; a sense in both keeps the NEWER clarity (the being's state as the
 * stretch ended). Pure.
 */
export function mergePerceivedVia(prior: PerceivedVia, next: PerceivedVia): PerceivedVia {
  return { via: [...new Set([...prior.via, ...next.via])], clarity: { ...prior.clarity, ...next.clarity } };
}
