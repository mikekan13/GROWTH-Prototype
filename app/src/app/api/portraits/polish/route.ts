import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLocalProvider } from '@/ai/portraits/providers';
import { assertLawfulImageJob, resolvePortraitMood } from '@/ai/portraits/portrait-service';
import { WithheldContentError, PortraitEndpointError } from '@/lib/errors';
import { errorResponse } from '@/lib/api';
import { assertSeedSetForPortrait } from '@/services/seed-pick';
import { readEditTarget } from '@/services/portrait-edit-guard';

export const maxDuration = 600;

/**
 * POST /api/portraits/polish — APPROVE's clean re-render (Mike, 15 Oct 2026).
 * Body: { characterId, imagePath, target: 'face' | 'body', seed? }
 * The image is finished again from itself (Qwen-Image-2.1 resume-from, the
 * image as its own reference) so compositing seams and artifacts go while
 * identity, pose and marks stay. Thin wrapper: validate → provider → JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
    }
    const { characterId, imagePath, target, seed } = body;
    if (typeof characterId !== 'string' || !characterId) return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    if (typeof imagePath !== 'string' || !imagePath) return NextResponse.json({ error: 'imagePath is required' }, { status: 400 });
    const t = readEditTarget(target);
    if (!t) return NextResponse.json({ error: "target must be 'face' or 'body'" }, { status: 400 });

    await assertSeedSetForPortrait({ characterId });
    await assertLawfulImageJob({
      prompt: 'polish: clean re-render of the approved image',
      usesRealReference: true,
      userId: session.user.id,
      subjectCharacterIds: [characterId],
      characterId,
    });

    const provider = getLocalProvider();
    const result = await provider.polishImage(imagePath, {
      characterId,
      target: t,
      seed: typeof seed === 'number' ? seed : undefined,
      mood: await resolvePortraitMood({ characterId }),
    });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({
      success: true,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath,
      metadata: {
        seed: result.metadata.seed,
        generationTimeMs: result.metadata.generationTimeMs,
        model: result.metadata.model,
        prompt: result.metadata.prompt,
        steps: result.metadata.steps ?? null,
        cfg: result.metadata.cfg ?? null,
      },
    });
  } catch (error) {
    if (error instanceof WithheldContentError || error instanceof PortraitEndpointError) return errorResponse(error);
    console.error('[portraits/polish] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
