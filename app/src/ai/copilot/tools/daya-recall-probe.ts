/**
 * daya_recall_probe — JEWL inspection tool: watch the memory gates work
 * without roleplaying it out.
 *
 * Part of the persona-harness observation surface (Addendum C). Deliberately
 * NOT a call into `daya/recall.ts`'s `recall()` — that function is a real
 * recall event and has side effects proportional to that (a rehearsal
 * salience touch + `labileUntilNextDream` flag on every surfaced memory, and
 * a self-ingest of the failed-recall attempt as its own memory, per Ruling
 * 5). The WP11 spec requires this probe to be non-ingesting, so this module
 * re-runs the exact same scoring/gating pipeline using recall.ts's exported
 * PURE primitives (scoreCandidate, wisdomThreshold, wisdomBudget, witPasses,
 * seeded-template pick) against a plain read of DayaMemoryEntry rows, and
 * simply never performs the write tail. GM/ADMIN only.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { currentCycleOf } from '@/services/history';
import { loadActiveThornBlocks } from '@/daya/mechanics/thorns';
import {
  RECALL_TUNING,
  scoreCandidate,
  wisdomThreshold,
  wisdomBudget,
  witPasses,
  seededRandom01,
  localSealLint,
  FAILED_REACH_TEMPLATES,
  AFFECT_ONLY_TEMPLATES,
  type ParsedMemory,
  type ScoredCandidate,
} from '@/daya/recall';
import type { GrowthCharacter } from '@/types/growth';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

function parseEntityRefs(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeParseSheet(raw: string | null | undefined): Partial<GrowthCharacter> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<GrowthCharacter>) : null;
  } catch {
    return null;
  }
}

/** Same deterministic seeded pick recall.ts's own `pickBySeed` uses, kept
 * local since that helper isn't exported (it's an internal template picker). */
function pickBySeed<T>(arr: readonly T[], seedKey: string): T {
  const idx = Math.floor(seededRandom01(seedKey) * arr.length) % arr.length;
  return arr[idx];
}

const dayaRecallProbeInputSchema = z.object({
  characterId: z.string().min(1),
  cue: z.string().min(1).max(2000),
  cueRefs: z.array(z.string()).optional(),
  /** Override the entity's live mood for a hypothetical probe. Omit to use
   * its current DayaAffect vector. */
  mood: z.object({ morale: z.number(), stress: z.number(), grief: z.number() }).optional(),
});

export const dayaRecallProbeTool: JewlTool = {
  name: 'daya_recall_probe',
  description:
    'GM/ADMIN-only inspection tool. Runs the same Wisdom-breadth/Wit-speed ' +
    'recall gating math as a real recall, read-only: shows what surfaces, ' +
    'what is deferred (passed the breadth gate but missed the speed roll), ' +
    'and what best-candidate failed to reach (with its relevance score). ' +
    'Optional mood override lets you probe a hypothetical mood state. ' +
    'Non-ingesting — unlike a real recall this never rehearses/flags a ' +
    'memory and never self-ingests a failed-recall attempt.',
  inputSchema: dayaRecallProbeInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaRecallProbeInputSchema.parse(input);

    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: parsed.characterId } });
    if (!entity) {
      return { output: { revealed: true, entityFound: false, surfaced: [], deferred: [] } };
    }

    const [affect, character] = await Promise.all([
      prisma.dayaAffect.findUnique({ where: { entityId: entity.id } }),
      prisma.character.findUnique({ where: { id: parsed.characterId }, select: { campaignId: true, data: true } }),
    ]);

    const mood = parsed.mood ?? (affect ? { morale: affect.morale, stress: affect.stress, grief: affect.grief } : { morale: 0, stress: 0, grief: 0 });
    const sheet = safeParseSheet(character?.data);
    const wisdom = sheet?.attributes?.wisdom;
    const wit = sheet?.attributes?.wit;
    const soulState = {
      wisdomMax: wisdom ? wisdom.level + wisdom.augmentPositive - wisdom.augmentNegative : 10,
      wisdomCur: wisdom ? wisdom.current : 10,
      witMax: wit ? wit.level + wit.augmentPositive - wit.augmentNegative : 10,
      witCur: wit ? wit.current : 10,
    };
    const nowCycle = character?.campaignId ? await currentCycleOf(character.campaignId) : 0;
    const thornBlocks = await loadActiveThornBlocks(entity.id);
    const cueRefs = parsed.cueRefs ?? [];

    const rows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id } });
    const parsedMemories: ParsedMemory[] = rows.map((r) => ({
      id: r.id,
      content: r.content,
      valence: r.valence,
      arousal: r.arousal,
      salience: r.salience,
      entityRefs: parseEntityRefs(r.entityRefs),
      narrativeCycle: r.narrativeCycle,
    }));

    const scored: ScoredCandidate[] = parsedMemories.map((m) =>
      scoreCandidate(m, parsed.cue, cueRefs, mood, nowCycle, thornBlocks),
    );

    const theta = wisdomThreshold(soulState.wisdomMax);
    const budget = wisdomBudget(soulState.wisdomMax, soulState.wisdomCur);

    const passing = scored
      .filter((c) => Number.isFinite(c.score) && c.score >= theta)
      .sort((a, b) => b.score - a.score);
    const withinBudget = passing.slice(0, Math.max(0, budget));

    const surfaced: Array<{ memoryId: string; content: string; score: number; relevance: number; recency: number; moodCongruence: number }> = [];
    const deferred: string[] = [];
    for (const c of withinBudget) {
      if (witPasses(entity.id, c.memory.id, nowCycle, soulState.witMax)) {
        surfaced.push({
          memoryId: c.memory.id,
          content: c.memory.content,
          score: c.score,
          relevance: c.relevance,
          recency: c.recency,
          moodCongruence: c.moodCongruence,
        });
      } else {
        deferred.push(c.memory.id);
      }
    }

    // Read-only twin of recall.ts's failed-reach detection — computed for
    // display, NEVER self-ingested (that write is what makes a real recall's
    // failed attempt itself a memory; this probe stops short of it).
    let failedReachCandidate: { memoryId: string; relevance: number; wouldFeelLike: string } | null = null;
    if (scored.length > 0) {
      const best = scored.reduce((a, b) => (b.relevance > a.relevance ? b : a));
      const surfacedIds = new Set(surfaced.map((s) => s.memoryId));
      if (best.relevance > RECALL_TUNING.thetaReach && !surfacedIds.has(best.memory.id)) {
        const templates = best.thornMatch?.mode === 'affect-only' ? AFFECT_ONLY_TEMPLATES : FAILED_REACH_TEMPLATES;
        let feel: string = pickBySeed(templates, `failedfeel:${entity.id}:${best.memory.id}:${nowCycle}`);
        if (!localSealLint(feel)) feel = 'Something surfaces, though the shape of it resists words right now.';
        failedReachCandidate = { memoryId: best.memory.id, relevance: best.relevance, wouldFeelLike: feel };
      }
    }

    return {
      output: {
        revealed: true,
        entityFound: true,
        theta,
        budget,
        surfaced,
        deferred,
        failedReachCandidate,
        nonIngesting: true,
      },
    };
  },
};

registerJewlTool(dayaRecallProbeTool);
