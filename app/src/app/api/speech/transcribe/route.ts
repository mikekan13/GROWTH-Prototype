import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import { transcribeAudio } from '@/ai/providers/stt';

export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_PROMPT_CHARS = 2000;

// POST /api/speech/transcribe — multipart: `audio` (file, <= 15 MB), optional `prompt` (names to bias toward).
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const form = await request.formData().catch(() => {
      throw new ValidationError('Expected multipart/form-data');
    });
    const audio = form.get('audio');
    if (!audio || typeof audio === 'string') throw new ValidationError('audio file is required');
    if (audio.size === 0) throw new ValidationError('audio is empty');
    if (audio.size > MAX_AUDIO_BYTES) throw new ValidationError('audio exceeds 15 MB');
    const rawPrompt = form.get('prompt');
    if (rawPrompt !== null && typeof rawPrompt !== 'string') throw new ValidationError('prompt must be text');
    if (rawPrompt && rawPrompt.length > MAX_PROMPT_CHARS) throw new ValidationError('prompt exceeds 2000 characters');

    const mime = audio.type && audio.type.startsWith('audio/') ? audio.type : 'audio/webm';
    const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64');
    const { transcript, provider } = await transcribeAudio(`data:${mime};base64,${base64}`, {
      initialPrompt: rawPrompt || undefined,
    });
    const text = transcript.trim();
    if (text.startsWith('[') && text.endsWith(']')) {
      return NextResponse.json({ error: 'speech-to-text unavailable', detail: text }, { status: 503 });
    }
    return NextResponse.json({ text, provider });
  } catch (error) {
    return errorResponse(error);
  }
}
