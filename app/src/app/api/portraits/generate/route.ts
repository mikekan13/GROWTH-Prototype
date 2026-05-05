import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { generatePortrait, generateFromDescription } from '@/ai/portraits/portrait-service';
import type { PortraitCharacterData, PortraitOverrides, CampaignStyleConfig } from '@/ai/portraits/types';

// FLUX.2 on H100 finishes in well under a minute per image, but leave a
// generous ceiling for cold-start pod resumes + first-call model swaps.
export const maxDuration = 1800;

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
    // Defensive: read as text first so empty/malformed bodies produce a clear 400
    // instead of an Unhandled error at JSON.parse. Was throwing SyntaxError at line 22
    // when something (stale fetch, race, duplicate dispatch) sent an empty body.
    const raw = await request.text();
    if (!raw || !raw.trim()) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      console.warn('[portraits/generate] Malformed JSON body:', raw.slice(0, 200));
      return NextResponse.json({ error: 'Malformed JSON body', detail: parseErr instanceof Error ? parseErr.message : String(parseErr) }, { status: 400 });
    }
    // Narrow the unknown JSON body fields to their expected types at the
    // destructuring point so downstream callers don't have to juggle unknowns.
    const characterId          = typeof body.characterId === 'string' ? body.characterId : undefined;
    const characterData        = body.characterData as PortraitCharacterData | undefined;
    const overrides            = body.overrides as PortraitOverrides | undefined;
    const campaignStyle        = body.campaignStyle as CampaignStyleConfig | undefined;
    const preferCloud          = typeof body.preferCloud === 'boolean' ? body.preferCloud : undefined;
    const referenceImagePath   = typeof body.referenceImagePath === 'string' ? body.referenceImagePath : undefined;
    const referenceImagePaths  = Array.isArray(body.referenceImagePaths) ? (body.referenceImagePaths as string[]) : undefined;
    const creationMode         = typeof body.creationMode === 'boolean' ? body.creationMode : undefined;

    if (!characterId && !characterData) {
      return NextResponse.json({ error: 'characterId or characterData is required' }, { status: 400 });
    }

    let result;

    if (characterData) {
      // Creation mode — inline data, no DB record needed
      result = await generateFromDescription(
        characterData,
        { campaignStyle, overrides, preferCloud, referenceImagePath, referenceImagePaths, creationMode },
      );
    } else {
      // In-game mode — load from DB. characterId is defined here by the guard above.
      result = await generatePortrait(characterId as string, {
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
        prompt: result.metadata.prompt,
        pass2Prompt: (result.metadata as unknown as Record<string, unknown>).pass2Prompt ?? null,
        negativePrompt: result.metadata.negativePrompt,
        workflowUsed: (result.metadata as unknown as Record<string, unknown>).workflowUsed || 'unknown',
        failedWorkflows: (result.metadata as unknown as Record<string, unknown>).failedWorkflows || [],
        debugRefs: (result.metadata as unknown as Record<string, unknown>).debugRefs || '',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
