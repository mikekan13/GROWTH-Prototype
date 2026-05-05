import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLocalProvider } from '@/ai/portraits/providers';

export const maxDuration = 600;

/**
 * POST /api/portraits/edit
 *
 * Edit an image using FLUX.2 Dev.
 * Body: {
 *   sourceImagePath,         // current character render
 *   editPrompt,              // natural-language instruction
 *   seed?, guidance?, characterId?,
 *   paintData?,              // optional mask for localized inpaint/fill
 *   objectRefImagePath?,     // optional 2nd image — pull an item from this ref
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const raw = await request.text();
    if (!raw || !raw.trim()) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      return NextResponse.json(
        { error: 'Malformed JSON body', detail: parseErr instanceof Error ? parseErr.message : String(parseErr) },
        { status: 400 },
      );
    }

    const { sourceImagePath, editPrompt, seed, guidance, characterId, paintData, objectRefImagePath } = body;

    if (!sourceImagePath || typeof sourceImagePath !== 'string') {
      return NextResponse.json({ error: 'sourceImagePath is required' }, { status: 400 });
    }
    if (!editPrompt || typeof editPrompt !== 'string') {
      return NextResponse.json({ error: 'editPrompt is required' }, { status: 400 });
    }

    const provider = getLocalProvider();
    const result = await provider.editImage(sourceImagePath, editPrompt, {
      seed: typeof seed === 'number' ? seed : undefined,
      guidance: typeof guidance === 'number' ? guidance : undefined,
      characterId: typeof characterId === 'string' ? characterId : undefined,
      paintData: paintData as { mode: string; dataUrl: string; feather?: number } | undefined,
      objectRefImagePath: typeof objectRefImagePath === 'string' ? objectRefImagePath : undefined,
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
        prompt: result.metadata.prompt,
      },
    });
  } catch (error) {
    console.error('[portraits/edit] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg, stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined }, { status: 500 });
  }
}
