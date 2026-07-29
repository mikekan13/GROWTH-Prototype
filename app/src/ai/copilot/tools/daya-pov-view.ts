/**
 * daya_pov_view — JEWL inspection tool: the view-switcher (Ruling 12 /
 * Addendum C).
 *
 * Part of the persona-harness observation surface. READ-ONLY: invokes the
 * WP5 perceptual renderer (`daya/renderer.ts`'s `render()`) as a chosen
 * observer — the entity's own attunement/bias/mood, the Terminal raw-truth
 * bypass, or another character's lens on the same subject. `render()` never
 * calls `applyRevision()` itself (only a caller wiring an explicit revision
 * event does that — none of Phase 1's real triggers are hooked up yet), so
 * this handler is dry BY CONSTRUCTION; it still snapshots the Believed Sheet
 * before/after as a live assertion, not just a comment, in case that ever
 * changes. GM/ADMIN only.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { render, type Observer, type RenderRequest, type RenderSubject, type BiasProfile, type VoiceParams, type AffectVector } from '@/daya/renderer';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

function parsePersonaProfile(raw: string): { bias?: BiasProfile; voice?: VoiceParams } {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

interface BuiltObserver extends Observer {
  entityDaId: string;
}

/** Looks up an existing DayaEntity (never upserts — a missing entity returns
 * null rather than creating one, so this stays fully read-only). */
async function buildObserver(characterId: string): Promise<BuiltObserver | null> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity) return null;
  const affect = await prisma.dayaAffect.findUnique({ where: { entityId: entity.id } });
  const persona = parsePersonaProfile(entity.personaProfile);
  const mood: AffectVector = affect
    ? { morale: affect.morale, stress: affect.stress, grief: affect.grief }
    : { morale: 0, stress: 0, grief: 0 };

  return {
    entityId: characterId,
    entityDaId: entity.id,
    attunement: entity.introspection,
    biasProfile: persona.bias ?? {},
    mood,
    voice: persona.voice ?? {},
  };
}

async function readBelievedSnapshot(entityDaId: string): Promise<string | null> {
  const sheet = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: entityDaId } });
  return sheet?.data ?? null;
}

const renderRequestShape = z.object({
  subject: z.enum(['self-stat', 'possession', 'environment', 'other-entity', 'relationship']),
  subjectKey: z.string().min(1),
  trueData: z.unknown(),
  context: z.string().max(2000).optional(),
});

const dayaPovViewInputSchema = z.object({
  characterId: z.string().min(1),
  subject: renderRequestShape,
  /** 'entity' = the entity's own view; 'terminal' = raw-truth bypass; any
   * other value is treated as another character's id (that observer's lens
   * on the same subject). */
  asObserver: z.string().min(1),
});

export const dayaPovViewTool: JewlTool = {
  name: 'daya_pov_view',
  description:
    'GM/ADMIN-only inspection tool. Renders one fact through a chosen ' +
    'observer\'s perception: asObserver="entity" (characterId\'s own ' +
    'attunement/bias/mood), asObserver="terminal" (raw truth, no ' +
    'transformation), or asObserver=<another characterId> (that observer\'s ' +
    'lens on the same subject). `subject` is a render request: {subject: ' +
    '"self-stat"|"possession"|"environment"|"other-entity"|"relationship", ' +
    'subjectKey, trueData, context?}. Dry-run — never triggers a Believed ' +
    'Sheet revision; the response asserts believedSheetUnchanged so this is ' +
    'verifiable, not just claimed.',
  inputSchema: dayaPovViewInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaPovViewInputSchema.parse(input);
    const renderReq: RenderRequest = {
      subject: parsed.subject.subject as RenderSubject,
      subjectKey: parsed.subject.subjectKey,
      trueData: parsed.subject.trueData,
      context: parsed.subject.context,
    };

    let observer: Observer;
    let entityDaId: string | null = null;
    let observerNote: string;

    if (parsed.asObserver === 'terminal') {
      observer = { entityId: null, attunement: 1, biasProfile: {}, mood: { morale: 0, stress: 0, grief: 0 }, voice: {} };
      observerNote = 'terminal bypass — raw truth, no transformation';
    } else {
      const observerCharacterId = parsed.asObserver === 'entity' ? parsed.characterId : parsed.asObserver;
      const built = await buildObserver(observerCharacterId);
      if (!built) {
        return {
          output: {
            revealed: true,
            rendered: false,
            reason: `no persona-harness entity found for observer ${observerCharacterId}`,
          },
        };
      }
      observer = built;
      entityDaId = built.entityDaId;
      observerNote =
        observerCharacterId === parsed.characterId
          ? "self-view (entity's own attunement/bias)"
          : `other-entity view (observer=${observerCharacterId})`;
    }

    const beforeBelieved = entityDaId ? await readBelievedSnapshot(entityDaId) : null;
    const rendered = await render(renderReq, observer);
    const afterBelieved = entityDaId ? await readBelievedSnapshot(entityDaId) : null;

    return {
      output: {
        revealed: true,
        rendered: true,
        asObserver: parsed.asObserver,
        observerNote,
        prose: rendered.prose,
        fidelityLevel: rendered.fidelityLevel,
        distortions: rendered.distortions,
        dryRun: true,
        believedSheetUnchanged: beforeBelieved === afterBelieved,
      },
    };
  },
};

registerJewlTool(dayaPovViewTool);
