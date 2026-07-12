/**
 * Safe JSON parsing helper.
 *
 * Game-data fields (character `data`, skill `data`, backstory `responses`, etc.)
 * are stored as JSON strings in SQLite and are occasionally empty or malformed.
 * An unguarded `JSON.parse('')` throws `Unexpected end of JSON input`, which has
 * repeatedly 500'd the campaign page. Route every parse of a persisted JSON blob
 * through this helper so a bad field degrades to a safe default instead.
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  fieldName?: string,
): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return (raw as unknown) as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[safeJsonParse] failed to parse${fieldName ? ` field "${fieldName}"` : ''}; using fallback`);
    }
    return fallback;
  }
}
