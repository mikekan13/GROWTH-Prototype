/**
 * GET /api/characters/[id]/genome — creation-pipeline stage for a character
 * (genome-first creator, Mike ruling 2026-08-08):
 *   story     → no gestation yet: creator shows backstory-first
 *   gestating → a genesis work session is active/blocked
 *   ready     → JEWL's gestation produced the genome (DAYA entity authored
 *               and/or memories seeded); full creator unlocks
 * Also returns a viewable slice of the genome (narrative, voice, ledger
 * size) and live session progress for the status strip.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { loadCharacterBackstory } from '@/ai/portraits/style-profile';
import { parseProgress } from '@/services/daya-work-session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const character = await prisma.character.findUnique({
      where: { id },
      select: { id: true, campaignId: true },
    });
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const backstory = await loadCharacterBackstory(id);
    const entity = await prisma.dayaEntity.findUnique({
      where: { characterId: id },
      select: {
        personaProfile: true,
        introspection: true,
        status: true,
        _count: { select: { memories: true } },
      },
    });
    const work = character.campaignId
      ? await prisma.dayaWorkSession.findFirst({
          where: { campaignId: character.campaignId, goal: { contains: `[${id}]` } },
          orderBy: { startedAt: 'desc' },
        })
      : null;

    let profile: Record<string, unknown> = {};
    if (entity) {
      try { profile = JSON.parse(entity.personaProfile) as Record<string, unknown>; } catch { /* raw */ }
    }
    const memoryCount = entity?._count.memories ?? 0;
    const authored = !!entity
      && (memoryCount > 0
        || typeof profile.identityNarrative === 'string'
        || typeof profile.voiceNotes === 'string');
    const gestating = !!work && (work.status === 'active' || work.status === 'blocked');
    const stage: 'story' | 'gestating' | 'ready' = gestating ? 'gestating' : authored ? 'ready' : 'story';
    const notes = work ? parseProgress(work.progress) : [];

    return NextResponse.json({
      stage,
      backstoryPresent: backstory.trim().length >= 40,
      session: work
        ? {
            status: work.status,
            cycleCount: work.cycleCount,
            blockedReason: work.blockedReason,
            lastNote: notes.length ? notes[notes.length - 1] : null,
          }
        : null,
      genome: entity
        ? {
            memoryCount,
            introspection: entity.introspection,
            identityNarrative: typeof profile.identityNarrative === 'string' ? profile.identityNarrative : null,
            voiceNotes: typeof profile.voiceNotes === 'string' ? profile.voiceNotes : null,
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
