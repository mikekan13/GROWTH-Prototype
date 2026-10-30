/**
 * The player behind the character (see prompts/roles/player.ts). One short L1
 * call when a routine step is due: follow it, hold it with a reason, or break
 * from it to do something else. Reads the sheet raw; never speaks as the
 * character. Never throws: a lane that cannot answer means FOLLOW — the
 * routine is the default, and a being must never freeze because a model did.
 */
import 'server-only';
import { chat, type DayaClientOverrides } from './model-client';
import { buildPlayerPrompt, readPlayerDecision, sheetReadout, PLAYER_MAX_TOKENS, type PlayerDecision, type PlayerPromptArgs } from './prompts/roles/player';
import type { GrowthCharacter } from '@/types/growth';

export interface PlayerArgs {
  entityDaId: string;
  campaignId: string | null;
  name: string;
  sheet: Partial<GrowthCharacter> | null;
  routine: PlayerPromptArgs['routine'];
  thought: string;
  impulse: 'speak' | 'act' | 'stay';
  stayReason?: string | null;
  resistance: PlayerPromptArgs['resistance'];
  heard: string;
  sinceOwn?: string | null;
}

export async function playerDecides(args: PlayerArgs, overrides: DayaClientOverrides = {}): Promise<PlayerDecision & { ms: number; raw?: string }> {
  const t0 = Date.now();
  const readout = sheetReadout(args.sheet);
  const prompt = buildPlayerPrompt({
    name: args.name, sheetLines: readout.lines, conditions: readout.conditions, fateDie: readout.fateDie,
    routine: args.routine, thought: args.thought, impulse: args.impulse, stayReason: args.stayReason, resistance: args.resistance, heard: args.heard, sinceOwn: args.sinceOwn,
  });
  try {
    const r = await chat({
      tier: 'L1', subsystem: 'player', contentClass: 'fiction', entityId: args.entityDaId, ...(args.campaignId ? { campaignId: args.campaignId } : {}),
      messages: [{ role: 'system', content: prompt }], maxTokens: PLAYER_MAX_TOKENS, stop: ['\n'],
    }, overrides);
    const d = readPlayerDecision(r.text);
    return { ...d, ms: Date.now() - t0, raw: r.text.trim().slice(0, 200) };
  } catch (err) {
    console.warn(`[daya/player] ${args.name}: the player could not be asked (${err instanceof Error ? err.message : err}) — the routine runs`);
    return { decision: 'follow', reason: 'the routine runs (the player could not be asked)', ms: Date.now() - t0 };
  }
}
