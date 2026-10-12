/**
 * Lawfulness hooks (unit 8a → 8b). One call per hook point:
 *
 *   const s = await screenInput(text, { campaignId, userId, source: 'AMBIENT', ref });
 *   if (s.blocked) text = s.text;            // s.text === WITHHELD_STRING
 *
 *   const o = await screenModelOutput(out, { campaignId, lane: 'local', ref });
 *   const i = await screenImage({ prompt, usesRealReference, campaignId, userId, ref, subjectCharacterIds });
 *
 * Pass `participantCharacterIds` (or `participantAges`) when the speakers /
 * subjects are known: a character RECORDED under 18 + any sexual cue blocks as
 * MINOR_SEXUAL even when the text never mentions age (fiction is not exempt).
 *
 * Each screens (code-only), raises the hash-chained flags as a side effect, and
 * returns the text to use: the original when allowed, the fixed withheld string
 * when blocked. Real/fictional names for the threat screen are loaded from the
 * campaign (cached) unless the caller passes them. Flag writes never throw into
 * the caller: a failed write is logged and the verdict still stands (fail closed).
 */
import 'server-only';
import {
  screenText,
  screenImageRequest,
  mayNeedScreen,
  raiseFlagsForResult,
  loadNameContext,
  resolveCharacterAges,
  WITHHELD_STRING,
  type FlagRef,
  type LawfulnessCategory,
  type LawfulnessLane,
  type LawfulnessSource,
  type ScreenContext,
  type ScreenResult,
} from '@/services/lawfulness';

export { WITHHELD_STRING };

export interface HookResult {
  /** The original text when allowed; `WITHHELD_STRING` when blocked. */
  text: string;
  blocked: boolean;
  categories: LawfulnessCategory[];
}

interface BaseHookContext {
  campaignId?: string | null;
  /** Who produced the content (the speaker; null for a model with no user). */
  userId?: string | null;
  /** Pointer to the stored row, when it exists — never a copy of the text. */
  ref?: FlagRef | null;
  realNames?: string[];
  fictionalNames?: string[];
  /** Recorded ages of the characters in the passage (structural-age screen). */
  participantAges?: number[];
  /** …or their ids — resolved to recorded ages from the character sheets. */
  participantCharacterIds?: string[];
  /**
   * Called once when the content is blocked, BEFORE the flag is raised: store
   * the withheld row here and return its pointer — the flag then points at it
   * (Mike: "flagged for a human moderator to inspect"). A throw is logged and
   * the flag is raised without a pointer; the verdict stands either way.
   */
  onBlocked?: (categories: LawfulnessCategory[]) => Promise<FlagRef | null | void>;
}

/** Ages given + ages resolved from ids. A lookup failure keeps whatever ages were given. */
async function ages(given?: number[], ids?: string[]): Promise<number[] | undefined> {
  if (!ids?.length) return given;
  try {
    return [...(given ?? []), ...(await resolveCharacterAges(ids))];
  } catch (err) {
    console.error('[lawfulness] age lookup failed:', err instanceof Error ? err.message : err);
    return given;
  }
}

/** The context minus the callback (a ScreenContext is plain data). */
function strip<T extends BaseHookContext>(ctx: T): Omit<T, 'onBlocked'> {
  const { onBlocked: _cb, ...rest } = ctx;
  void _cb;
  return rest;
}

async function names(ctx: BaseHookContext): Promise<{ realNames?: string[]; fictionalNames?: string[] }> {
  if (ctx.realNames || ctx.fictionalNames || !ctx.campaignId) {
    return { realNames: ctx.realNames, fictionalNames: ctx.fictionalNames };
  }
  try {
    return await loadNameContext(ctx.campaignId);
  } catch (err) {
    console.error('[lawfulness] name context failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

const ALLOW = (text: string): HookResult => ({ text, blocked: false, categories: [] });

async function finish(
  original: string,
  result: ScreenResult,
  ctx: ScreenContext,
  onBlocked?: BaseHookContext['onBlocked'],
): Promise<HookResult> {
  if (result.verdict === 'allow') return ALLOW(original);
  if (onBlocked) {
    try {
      const ref = await onBlocked(result.flags);
      if (ref) ctx = { ...ctx, ref };
    } catch (err) {
      console.error('[lawfulness] storing the withheld row failed:', err instanceof Error ? err.message : err);
    }
  }
  try {
    await raiseFlagsForResult(result, ctx);
  } catch (err) {
    console.error('[lawfulness] flag write failed:', err instanceof Error ? err.message : err);
  }
  console.warn(
    `[lawfulness] blocked lane=${ctx.lane} source=${ctx.source} campaign=${ctx.campaignId ?? '-'} categories=${result.flags.join(',')}`,
  );
  return { text: WITHHELD_STRING, blocked: true, categories: result.flags };
}

/** Player / Watcher input — typed, or ambient after the table-talk split. */
export async function screenInput(
  text: string,
  ctx: BaseHookContext & { source?: Extract<LawfulnessSource, 'TYPED' | 'AMBIENT'> },
): Promise<HookResult> {
  if (!mayNeedScreen(text)) return ALLOW(text);
  const full: ScreenContext = { ...strip(ctx), ...(await names(ctx)), participantAges: await ages(ctx.participantAges, ctx.participantCharacterIds), lane: 'input', source: ctx.source ?? 'TYPED' };
  return finish(text, screenText(text, full), full, ctx.onBlocked);
}

/** A model's output before anyone reads it or it is stored. Default lane: local. */
export async function screenModelOutput(
  text: string,
  ctx: BaseHookContext & { lane?: Extract<LawfulnessLane, 'local' | 'cloud'> },
): Promise<HookResult> {
  if (!mayNeedScreen(text)) return ALLOW(text);
  const full: ScreenContext = { ...strip(ctx), ...(await names(ctx)), participantAges: await ages(ctx.participantAges, ctx.participantCharacterIds), lane: ctx.lane ?? 'local', source: 'MODEL_OUTPUT' };
  return finish(text, screenText(text, full), full, ctx.onBlocked);
}

/** An image job before it is queued. `text` is the prompt (or the withheld string). */
export async function screenImage(req: {
  prompt: string;
  usesRealReference: boolean;
  referenceOwnerUserId?: string | null;
  campaignId?: string | null;
  userId?: string | null;
  ref?: FlagRef | null;
  /** Recorded ages of the depicted characters, or their ids (resolved from the sheets). */
  subjectAges?: number[];
  subjectCharacterIds?: string[];
  onBlocked?: BaseHookContext['onBlocked'];
}): Promise<HookResult> {
  const result = screenImageRequest({ ...req, subjectAges: await ages(req.subjectAges, req.subjectCharacterIds) });
  const ctx: ScreenContext = {
    campaignId: req.campaignId,
    userId: req.userId,
    ref: req.ref,
    lane: 'image',
    source: result.flags.includes('REAL_PERSON_SEXUAL_IMAGE') ? 'IMAGE_REFERENCE' : 'IMAGE_PROMPT',
  };
  return finish(req.prompt, result, ctx, req.onBlocked);
}
