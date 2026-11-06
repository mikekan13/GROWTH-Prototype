import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canEditCharacter, isAdminRole } from '@/lib/permissions';
import { FX_PRESETS, fxParamsSchema, parseVoiceSpec, voiceSpecForCharacter } from '@/lib/speech-voices';
import { genderFromData, parseCharacterData } from '@/services/speech';
import {
  clearVoiceForCharacter, describeVoiceFromSheet, designVoiceForCharacter, setVoiceForCharacter,
} from '@/services/voice-design';

export const dynamic = 'force-dynamic';

const presetSchema = z.string().refine(p => FX_PRESETS.includes(p), 'Unknown preset');

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('design'),
    description: z.string().min(1).max(600).optional(),
    text: z.string().min(1).max(400).optional(),
    preset: presetSchema.optional(),
    fx: fxParamsSchema.optional(),
    seed: z.number().int().optional(),
  }),
  z.object({
    action: z.literal('set'),
    preset: presetSchema.optional(),
    fx: fxParamsSchema.optional(),
    voice: z.string().min(1).optional(),
    lockedAt: z.string().optional(),
  }),
]);

/** ADMIN or the GM of the character's campaign (canEditCharacter also admits the owner; voice design is GM-side, so owners are excluded). */
async function authorize(characterId: string) {
  const session = await requireAuth();
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  const isGm = character.campaign?.gmUserId === session.user.id;
  if (!(isAdminRole(session.user.role) || isGm) || !canEditCharacter(session.user.id, session.user.role, character)) {
    throw new ForbiddenError('Only the GM or an admin can change a voice');
  }
  return character;
}

// GET /api/characters/[id]/voice — { spec, derived, description, presets }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const character = await authorize(id);
    const data = parseCharacterData(character.data);
    const spec = voiceSpecForCharacter({ id: character.id, gender: genderFromData(data), voice: data.voice });
    const derived = parseVoiceSpec(data.voice) === null;
    return NextResponse.json({
      spec,
      derived,
      description: describeVoiceFromSheet({ id: character.id, name: character.name, data }),
      presets: FX_PRESETS,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/characters/[id]/voice — { action:'design', ... } | { action:'set', ... } -> { spec, previewWavBase64? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorize(id);
    const body = bodySchema.parse(await request.json());
    if (body.action === 'design') {
      const { action: _a, ...opts } = body;
      void _a;
      const { spec, previewWavBase64 } = await designVoiceForCharacter(id, opts);
      return NextResponse.json({ spec, previewWavBase64 });
    }
    const { action: _a, ...patch } = body;
    void _a;
    const spec = await setVoiceForCharacter(id, patch);
    return NextResponse.json({ spec });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/characters/[id]/voice — clear the saved voice (falls back to the derived Kokoro voice)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorize(id);
    await clearVoiceForCharacter(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
