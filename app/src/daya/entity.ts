/**
 * DayaEntity id resolution — the ONE canonical Character id -> DayaEntity.id
 * mapping point (Wave-1 integration fix, folded into WP9).
 *
 * Convention (authoritative — see _MASTER-EXECUTION-HANDOFF FIX-2): every
 * DayaTrigger and every upstream caller speaks the Character id
 * (events.ts's `entityId` field, same handle services/daya-affect.ts uses).
 * `DayaModelCall.entityId` is a foreign key to DayaEntity.id, a different id
 * space. The ensemble resolves Character id -> DayaEntity.id exactly ONCE,
 * at wake entry, via `resolveDayaEntityId()`, and threads the resulting
 * DayaEntity.id down to every `chat()` / `routeAndChat()` call for metering.
 * Everything upstream of the model-client boundary speaks Character id; only
 * that boundary speaks DayaEntity.id.
 *
 * Create-if-missing (upsert), mirroring the pattern every WP1-WP7 module
 * independently reimplemented (events.ts's ensureDayaEntity,
 * renderer.ts's ensureDayaEntityId, daya-affect.ts's ensureDayaEntity,
 * scheduler.ts's inline upsert) — this file is the one they should now defer
 * to for the id-only case. Callers that also need campaignId/createdAt
 * alongside the id (events.ts, scheduler.ts) keep their own slightly wider
 * queries rather than paying a second round trip here.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export async function resolveDayaEntityId(characterId: string): Promise<string> {
  const entity = await prisma.dayaEntity.upsert({
    where: { characterId },
    create: { characterId },
    update: {},
    select: { id: true },
  });
  return entity.id;
}
