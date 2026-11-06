import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { FX_PRESETS, fxParamsSchema, NARRATOR_VOICE } from '@/lib/speech-voices';
import { clearNarratorVoice, designNarratorVoice, getNarratorVoice, setNarratorVoice } from '@/services/voice-design';

export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('design'),
    description: z.string().min(1).max(600).optional(),
    text: z.string().min(1).max(400).optional(),
    preset: z.string().min(1).max(40).optional(),
    fx: fxParamsSchema.optional(),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
  }),
  z.object({
    action: z.literal('set'),
    preset: z.string().min(1).max(40).optional(),
    fx: fxParamsSchema.optional(),
    voice: z.string().min(1).max(40).optional(),
    lockedAt: z.string().optional(),
  }),
]);

async function requireGm(campaignId: string) {
  const session = await requireAuth();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(session.user.id, session.user.role, campaign)) throw new ForbiddenError('Only the Watcher can set the narrator');
}

/** GET /api/campaigns/[id]/narrator-voice — the campaign's designed narrator (null = Kokoro default) + presets. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireGm(id);
    const spec = await getNarratorVoice(id);
    return NextResponse.json({ spec, fallback: { engine: 'kokoro', voice: NARRATOR_VOICE }, presets: FX_PRESETS });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — {action:'design', description?, text?, preset?, fx?, seed?} → {spec, previewWavBase64}; {action:'set', …} → {spec}. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireGm(id);
    const body = bodySchema.parse(await request.json());
    if (body.action === 'design') {
      const { action: _a, ...opts } = body;
      void _a;
      const result = await designNarratorVoice(id, opts);
      return NextResponse.json(result);
    }
    const { action: _a, ...rest } = body;
    void _a;
    const spec = await setNarratorVoice(id, rest);
    return NextResponse.json({ spec });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — back to the Kokoro default narrator. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireGm(id);
    await clearNarratorVoice(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
