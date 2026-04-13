import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { generatePortrait, generateFromDescription } from '@/ai/portraits/portrait-service';
import type { PortraitCharacterData } from '@/ai/portraits/types';

/**
 * POST /api/portraits/generate
 *
 * Generate a portrait. Supports two modes:
 * 1. characterId — loads from DB (in-game generation)
 * 2. characterData — inline data (character creation preview)
 *
 * Body: { characterId?, characterData?, overrides?, campaignStyle?, preferCloud?, referenceImagePath?, creationMode? }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { characterId, characterData, overrides, campaignStyle, preferCloud, referenceImagePath, creationMode } = body;

    if (!characterId && !characterData) {
      return NextResponse.json({ error: 'characterId or characterData is required' }, { status: 400 });
    }

    let result;

    if (characterData) {
      // Creation mode — inline data, no DB record needed
      result = await generateFromDescription(
        characterData as PortraitCharacterData,
        { campaignStyle, overrides, preferCloud, referenceImagePath, creationMode },
      );
    } else {
      // In-game mode — load from DB
      result = await generatePortrait(characterId, {
        campaignStyle,
        overrides,
        preferCloud,
      });
    }

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
