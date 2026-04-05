import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { generatePortrait } from '@/ai/portraits/portrait-service';

/**
 * POST /api/portraits/generate
 *
 * Queue a portrait generation for a character.
 * Body: { characterId, overrides?, campaignStyle?, preferCloud? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { characterId, overrides, campaignStyle, preferCloud } = body;

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    const result = await generatePortrait(characterId, {
      campaignStyle,
      overrides,
      preferCloud,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imagePath: result.imagePath,
      thumbnailPath: result.thumbnailPath,
      metadata: {
        seed: result.metadata.seed,
        generationTimeMs: result.metadata.generationTimeMs,
        model: result.metadata.model,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
