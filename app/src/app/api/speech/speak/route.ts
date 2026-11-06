import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { synthesizeSpeech, voiceSpecForCharacterId } from '@/services/speech';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  characterId: z.string().min(1).nullable().optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

// POST /api/speech/speak — text in, audio/wav out. No characterId = the narrator.
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = bodySchema.parse(await request.json());
    const spec = await voiceSpecForCharacterId(body.characterId);
    const result = await synthesizeSpeech({ text: body.text, spec, speed: body.speed });
    if (!result.ok) {
      return NextResponse.json({ error: 'speech server unavailable', detail: result.detail }, { status: 503 });
    }
    const headers: Record<string, string> = {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store',
      'X-Voice': spec.ref ?? spec.voice ?? '',
    };
    if (result.seconds !== null) headers['X-Audio-Seconds'] = String(result.seconds);
    if (result.engine) headers['X-Engine'] = result.engine;
    if (result.fx) headers['X-Fx'] = result.fx;
    return new NextResponse(result.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
