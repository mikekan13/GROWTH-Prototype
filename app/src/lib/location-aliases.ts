/**
 * Finding 96 (2026-11-05): a place has the names people call it by ("Extra Space Coffee" for "the coffee shop on Broadway").
 * They live on the Location's data as `aliases: string[]`; the thread-place resolver and the wall's name roster both read them. Pure.
 */
export function locationAliases(data: string | null | undefined): string[] {
  if (!data) return [];
  try {
    const d = JSON.parse(data) as { aliases?: unknown };
    return Array.isArray(d.aliases) ? d.aliases.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}
