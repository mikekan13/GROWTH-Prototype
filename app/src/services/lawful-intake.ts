/**
 * Lawful intake (unit 8b, Mike 2026-10-12) — the one door every piece of
 * human input (typed, or ambient after transcription) passes before anything
 * stores, renders or models it.
 *
 *   const held = await holdIfUnlawful({ campaignId, userId, username, text, origin: 'GM_TEXT' });
 *   if (held.blocked) …   // the withheld row exists, the flag points at it
 *
 * Allowed → nothing is written, the caller carries on as before.
 * Blocked → the input is STORED as a withheld CopilotMessage (original text,
 * `contentClass: 'real'`, `withheld: true` in `actions` — see lib/withheld.ts),
 * a hash-chained flag points at that row, and the caller shows the sender
 * `WITHHELD_STRING` instead of processing anything. Withheld rows never render
 * to other players (history is per-user and masks them), never enter the
 * classifier window and never reach a model.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { WithheldContentError } from '@/lib/errors';
import { screenInput, type HookResult } from '@/lib/lawfulness-hooks';
import { withheldActions } from '@/lib/withheld';
import { mayNeedScreen, type FlagRef } from '@/services/lawfulness';

export interface IntakeInput {
  campaignId: string | null | undefined;
  /** When the caller has no campaign id but knows the character addressed: its campaign is looked up (only on a block). */
  characterId?: string;
  userId: string;
  /** Stored on the withheld row (`[ambient]` for mic lines). */
  username?: string | null;
  text: string;
  /** TYPED (default) or AMBIENT — the flag's source. */
  source?: 'TYPED' | 'AMBIENT';
  /** Where it came in (stored on the row's `actions.source`, e.g. GM_TEXT, TERMINAL_CHAT). */
  origin: string;
  /** The scene's characters, when known — their RECORDED ages feed the structural-age screen. */
  participantCharacterIds?: string[];
  /** …or a lookup for them, run only when the text could block at all (saves the queries on clean lines). */
  participants?: () => Promise<string[]>;
}

export interface IntakeResult extends HookResult {
  /** The withheld row's id (blocked + a campaign to store it under). */
  withheldRowId?: string;
}

/** Screen one piece of human input; on a block, store it withheld and point the flag at it. */
export async function holdIfUnlawful(input: IntakeInput): Promise<IntakeResult> {
  let withheldRowId: string | undefined;
  let participantCharacterIds = input.participantCharacterIds;
  if (input.participants && mayNeedScreen(input.text)) {
    try {
      participantCharacterIds = [...(participantCharacterIds ?? []), ...(await input.participants())];
    } catch (err) {
      console.error('[lawfulness] participant lookup failed:', err instanceof Error ? err.message : err);
    }
  }
  const result = await screenInput(input.text, {
    campaignId: input.campaignId ?? null,
    userId: input.userId,
    source: input.source ?? 'TYPED',
    participantCharacterIds,
    onBlocked: async (categories) => {
      const ref = await storeWithheldRow(input, categories);
      withheldRowId = ref?.id;
      return ref;
    },
  });
  return withheldRowId ? { ...result, withheldRowId } : result;
}

/**
 * Store blocked content as a withheld CopilotMessage (the flag's pointer).
 * Returns null when there is no campaign to store it under.
 */
export async function storeWithheldRow(
  input: Pick<IntakeInput, 'campaignId' | 'characterId' | 'userId' | 'username' | 'text' | 'origin'>,
  categories: string[],
): Promise<FlagRef | null> {
  const campaignId = input.campaignId ?? (input.characterId
    ? (await prisma.character.findUnique({ where: { id: input.characterId }, select: { campaignId: true } }))?.campaignId
    : null);
  if (!campaignId) return null; // nowhere to store it: the flag still raises, without a pointer
  const row = await prisma.copilotMessage.create({
    data: {
      campaignId,
      role: 'user',
      content: input.text,
      userId: input.userId,
      username: input.username ?? null,
      actions: withheldActions({ source: input.origin }, categories),
      contentClass: 'real', // the wall: never a cloud lane
    },
    select: { id: true },
  });
  return { table: 'CopilotMessage', id: row.id };
}

/** As `holdIfUnlawful`, but a block throws `WithheldContentError` (422, the withheld string). */
export async function assertLawfulInput(input: IntakeInput): Promise<void> {
  const held = await holdIfUnlawful(input);
  if (held.blocked) throw new WithheldContentError();
}
