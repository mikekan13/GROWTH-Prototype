import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { askTerminal, recollectionCheck } from '@/services/terminal-recall';

export const dynamic = 'force-dynamic';

const bodySchema = z.union([
  z.object({ question: z.string().min(1).max(2000) }),
  z.object({ recollectionCheck: z.object({ n: z.number().int().min(1).max(50).optional(), k: z.number().int().min(1).max(20).optional(), phrase: z.boolean().optional() }) }),
]);

// POST /api/campaigns/[id]/terminal — { question } asks the Terminal (Watcher only;
// every sentence cited or the record holds nothing); { recollectionCheck } runs
// the perfect-recollection harness over sampled canon events.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const input = bodySchema.parse(await request.json());
    const actor = { userId: session.user.id, role: session.user.role };
    if ('question' in input) return NextResponse.json(await askTerminal(campaignId, actor, input.question));
    return NextResponse.json(await recollectionCheck(campaignId, actor, input.recollectionCheck));
  } catch (error) {
    return errorResponse(error);
  }
}
