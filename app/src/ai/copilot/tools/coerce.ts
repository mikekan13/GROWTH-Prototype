/**
 * Trim-not-reject at the JEWL tool boundary (perf pass 2026-10-12).
 *
 * Measured on a live deep genesis: 9 of 49 tool calls were rejected on
 * schema LENGTH / SHAPE limits (gmNote ≤600, description ≤500, voice
 * register ≤200, duration as a string) and re-emitted whole — about a third
 * of every output token spent. Sonnet's tool-call payloads are the wall-time
 * sink, so a rejected call costs a full re-write.
 *
 * Instead: (a) every tool's description states its exact limits
 * (describeLimits — derived from the Zod schema, so it is always exact);
 * (b) before the handler runs, over-long strings are ellipsised at a
 * sentence boundary and trivially-fixable shapes are coerced (a duration
 * string → {amount, unit}). The Zod schema stays the source of truth: the
 * coerced value is RE-PARSED, and anything still invalid is left untouched
 * for the handler to reject as before. Arrays are never truncated (dropping
 * whole entries loses content silently). Pure — no DB, no server-only.
 */
import type { z } from 'zod';

type Path = ReadonlyArray<PropertyKey>;

/** Identifiers are never trimmed — a cut name or id is a different thing,
 *  not a shorter one. Over-long values here still reject. */
const UNTRIMMABLE = new Set(['name', 'id', 'ref', 'sessionId', 'characterId', 'prodId', 'hex', 'anchorQuote']);

/** Cut `s` to ≤ max chars, preferring a sentence end, then a word end; ends with "…". */
export function trimAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, Math.max(0, max));
  const room = s.slice(0, max - 1); // leave one char for the ellipsis
  // Last sentence terminator in the back half of the room.
  let cut = -1;
  const re = /[.!?](?=\s|$)/g;
  for (let m = re.exec(room); m; m = re.exec(room)) cut = m.index + 1;
  if (cut >= Math.floor(max * 0.5)) return `${room.slice(0, cut).trimEnd()}…`;
  const sp = room.lastIndexOf(' ');
  const body = sp >= Math.floor(max * 0.5) ? room.slice(0, sp) : room;
  return `${body.trimEnd().replace(/[,;:\-–—]+$/, '')}…`;
}

const UNIT_ALIASES: Record<string, 'rounds' | 'hours' | 'days' | 'cycles'> = {
  r: 'rounds', rd: 'rounds', rds: 'rounds', round: 'rounds', rounds: 'rounds',
  h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours',
  d: 'days', day: 'days', days: 'days',
  cycle: 'cycles', cycles: 'cycles', y: 'cycles', yr: 'cycles', yrs: 'cycles', year: 'cycles', years: 'cycles',
};
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

/** "3 rounds" / "1 hour" / "2d" / "one day" → {amount, unit}; null when it isn't a plain clock span. */
export function parseDurationString(s: string): { amount: number; unit: 'rounds' | 'hours' | 'days' | 'cycles' } | null {
  const m = /^\s*(\d+(?:\.\d+)?|[a-z]+)\s*([a-z]+)\.?\s*$/i.exec(s);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1].toLowerCase()];
  const unit = UNIT_ALIASES[m[2].toLowerCase()];
  if (!n || !(n > 0) || !unit) return null;
  return { amount: n, unit };
}

/** Shape coercion for a string that arrived where an object was expected.
 *  Keyed by the field name; undefined = not trivially fixable. */
function coerceShape(key: PropertyKey | undefined, value: string): unknown {
  if (key === 'duration') return parseDurationString(value) ?? undefined;
  if (key === 'expiry') {
    const d = parseDurationString(value);
    if (d) return { kind: 'time', ...d };
    const text = value.trim();
    return text ? { kind: 'trigger', text } : undefined;
  }
  return undefined;
}

function getAt(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[k as never];
  }
  return cur;
}

function setAt(root: unknown, path: Path, value: unknown): void {
  let cur = root as Record<PropertyKey, unknown>;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as never] as Record<PropertyKey, unknown>;
  cur[path[path.length - 1] as never] = value;
}

interface IssueLike {
  code: string;
  path: PropertyKey[];
  origin?: string;
  maximum?: number | bigint;
  expected?: string;
  errors?: IssueLike[][];
}

export interface CoerceResult<T = unknown> {
  value: T;
  /** Dotted paths that were trimmed / coerced ("gmNote", "effects.0.duration"). */
  coerced: string[];
}

/**
 * Repair `input` against `schema` where the fix is mechanical; never throws.
 * Returns the input unchanged (same reference) when it already parses or
 * when nothing was fixable — the caller's own parse then rejects as before.
 */
export function coerceToSchema(schema: z.ZodTypeAny, input: unknown): CoerceResult {
  let first = schema.safeParse(input);
  if (first.success) return { value: input, coerced: [] };
  let value: unknown;
  try {
    value = structuredClone(input);
  } catch {
    return { value: input, coerced: [] };
  }
  const coerced: string[] = [];
  for (let pass = 0; pass < 4 && !first.success; pass++) {
    let fixed = 0;
    const visit = (issues: IssueLike[], prefix: Path) => {
      for (const issue of issues) {
        const path = [...prefix, ...issue.path];
        if (issue.code === 'invalid_union' && issue.errors?.length) {
          // Repair against the first branch only — the one the model most
          // plausibly meant is unknowable; never mix two branches' fixes.
          visit(issue.errors[0], path);
          continue;
        }
        if (path.length === 0) continue;
        const at = getAt(value, path);
        if (issue.code === 'too_big' && issue.origin === 'string' && typeof at === 'string' && issue.maximum != null
          && !UNTRIMMABLE.has(String(path[path.length - 1]))) {
          setAt(value, path, trimAtSentence(at, Number(issue.maximum)));
          coerced.push(path.join('.'));
          fixed++;
        } else if (issue.code === 'invalid_type' && issue.expected === 'object' && typeof at === 'string') {
          const shaped = coerceShape(path[path.length - 1], at);
          if (shaped !== undefined) {
            setAt(value, path, shaped);
            coerced.push(path.join('.'));
            fixed++;
          }
        }
      }
    };
    visit(first.error.issues as unknown as IssueLike[], []);
    if (fixed === 0) break;
    first = schema.safeParse(value);
  }
  // Partial repairs are still worth keeping: the handler's own parse names
  // only what is genuinely wrong, so the model re-emits less.
  return coerced.length ? { value, coerced: [...new Set(coerced)] } : { value: input, coerced: [] };
}

/**
 * The runtime boundary: generic schema repair, then the tool's own hook.
 * Logs one `[tools] coerced <tool>.<field>` line per repaired field.
 */
export function coerceToolInput(
  tool: { name: string; inputSchema: z.ZodTypeAny; coerce?: (input: unknown) => CoerceResult },
  input: unknown,
): CoerceResult {
  const generic = coerceToSchema(tool.inputSchema, input);
  let value = generic.value;
  const coerced = [...generic.coerced];
  if (tool.coerce) {
    try {
      const own = tool.coerce(value);
      value = own.value;
      coerced.push(...own.coerced);
    } catch { /* a repair hook never blocks the call — the handler judges */ }
  }
  for (const field of coerced) {
    // eslint-disable-next-line no-console
    console.log(`[tools] coerced ${tool.name}.${field}`);
  }
  return { value, coerced };
}

// ── Limits in the description ────────────────────────────────────────────

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  maxLength?: number;
  maxItems?: number;
};

/** Every maxLength / maxItems in a JSON schema, as "path ≤N chars" / "path ≤N items". Deterministic order. */
export function collectLimits(schema: JsonSchema, path = ''): string[] {
  const out: string[] = [];
  const at = path || '(input)';
  if (typeof schema.maxLength === 'number') out.push(`${at} ≤${schema.maxLength} chars`);
  if (typeof schema.maxItems === 'number') out.push(`${at} ≤${schema.maxItems} items`);
  for (const [k, sub] of Object.entries(schema.properties ?? {})) out.push(...collectLimits(sub, path ? `${path}.${k}` : k));
  if (schema.items) out.push(...collectLimits(schema.items, `${path}[]`));
  for (const alt of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])]) out.push(...collectLimits(alt, path));
  return [...new Set(out)];
}

/** The line appended to a tool's description; '' when the schema has no length limits. */
export function describeLimits(jsonSchema: Record<string, unknown>): string {
  const limits = collectLimits(jsonSchema as JsonSchema);
  if (limits.length === 0) return '';
  return `LIMITS (hard; text over a limit is cut at a sentence, so stay inside): ${limits.join('; ')}.`;
}
