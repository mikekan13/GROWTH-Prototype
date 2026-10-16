import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLocalProvider } from '@/ai/portraits/providers';
import { assertLawfulImageJob, resolvePortraitMood } from '@/ai/portraits/portrait-service';
import { AppError, PortraitEndpointError, ValidationError, WithheldContentError } from '@/lib/errors';
import { errorResponse } from '@/lib/api';
import { assertSeedSetForPortrait } from '@/services/seed-pick';
import { buildPortraitBrief, readPortraitRefs } from '@/services/portrait-brief';

export const maxDuration = 600;

export const DRESS_FIRST_MESSAGE = 'Nothing is equipped. Dress the character first (or let JEWL dress her) — the portrait paints what is worn.';

/**
 * POST /api/portraits/paint — THE PORTRAIT (Mike, 16 Oct 2026; plan §4 C).
 * Body: { characterId, seed?, force? }
 * JEWL writes the brief from everything known (reused while its inputs
 * match; `force` rewrites), then the Qwen-Image-2.1 provider paints it from
 * the approved face + body on the v1 recipe. Thin wrapper: validate → seed
 * gate → refs → brief → lawfulness → provider → JSON.
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
    const { characterId, seed, force } = body;
    if (typeof characterId !== 'string' || !characterId) return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    if (seed !== undefined && (typeof seed !== 'number' || !Number.isFinite(seed))) return NextResponse.json({ error: 'seed must be a number' }, { status: 400 });

    await assertSeedSetForPortrait({ characterId });
    const refs = await readPortraitRefs(characterId);
    const { brief, inputs, reused } = await buildPortraitBrief(characterId, { force: force === true });
    // The portrait paints what is EQUIPPED (inventory law); undressed → dress first.
    if (inputs.equipped.length === 0) throw new ValidationError(DRESS_FIRST_MESSAGE);
    await assertLawfulImageJob({
      prompt: brief.prompt,
      usesRealReference: true,
      userId: session.user.id,
      subjectCharacterIds: [characterId],
      characterId,
    });

    const provider = getLocalProvider();
    const result = await provider.renderPortrait(characterId, brief, {
      face: refs.face,
      body: refs.body,
      seed: typeof seed === 'number' ? seed : undefined,
      mood: await resolvePortraitMood({ characterId }),
    });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({
      success: true,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath,
      brief: { setting: brief.setting, pose: brief.pose, expression: brief.expression, clothes: brief.clothes, marks: brief.marks, light: brief.light, byJewl: brief.byJewl, reused },
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
    if (error instanceof WithheldContentError || error instanceof PortraitEndpointError || error instanceof AppError) return errorResponse(error);
    console.error('[portraits/paint] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
