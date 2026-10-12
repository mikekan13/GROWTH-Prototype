/**
 * Boundary repair for propose_forge_blueprint's nested body (perf pass
 * 2026-10-12). The body rides as a JSON STRING (dataJson), so the generic
 * schema trim cannot see into it; this hook parses it, repairs it against
 * the canonical Forge schema for the type (over-long description → trimmed,
 * effects[].duration "3 rounds" → {amount, unit}), and re-stringifies.
 * A body sent as an object instead of a string is stringified. Pure.
 */
import { forgeDataSchemaFor } from '@/services/forge-schemas';
import { coerceToSchema, type CoerceResult } from './coerce';

/** The body limits the model must see (stated in the tool description). */
export const FORGE_BODY_LIMITS =
  'dataJson BODY LIMITS (hard): description ≤500 chars; names ≤100 (nested grant names ≤60); ' +
  'effects[].duration is an OBJECT {amount, unit: "rounds"|"hours"|"days"|"cycles"} — never a string; ' +
  'blossom expiry is {kind:"time", amount, unit} or {kind:"trigger", text ≤300}. ' +
  'Over-long text is cut at a sentence, so stay inside.';

export function coerceForgeBlueprintInput(input: unknown): CoerceResult {
  if (input === null || typeof input !== 'object') return { value: input, coerced: [] };
  const rec = input as Record<string, unknown>;
  const coerced: string[] = [];
  let body: unknown;
  let dataJson = rec.dataJson;
  if (dataJson !== null && typeof dataJson === 'object') {
    body = dataJson;
    dataJson = JSON.stringify(dataJson);
    coerced.push('dataJson');
  } else if (typeof dataJson === 'string') {
    try {
      body = JSON.parse(dataJson);
    } catch {
      return { value: input, coerced: [] }; // genuinely unusable — the handler rejects
    }
  } else {
    return { value: input, coerced: [] };
  }
  const schema = typeof rec.type === 'string' ? forgeDataSchemaFor(rec.type) : null;
  if (schema) {
    const fixed = coerceToSchema(schema, body);
    if (fixed.coerced.length) {
      dataJson = JSON.stringify(fixed.value);
      coerced.push(...fixed.coerced.map(p => `dataJson.${p}`));
    }
  }
  return coerced.length ? { value: { ...rec, dataJson }, coerced } : { value: input, coerced: [] };
}
