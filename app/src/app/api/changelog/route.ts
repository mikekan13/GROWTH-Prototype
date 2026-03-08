import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { queryChangeLog } from '@/services/changelog';
import type { ChangeActor, ChangeCategory } from '@/types/changelog';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth();
    const params = req.nextUrl.searchParams;

    const campaignId = params.get('campaignId');
    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
    }

    const result = await queryChangeLog({
      campaignId,
      characterId: params.get('characterId') || undefined,
      category: params.get('category')?.split(',') as ChangeCategory[] || undefined,
      actor: params.get('actor')?.split(',') as ChangeActor[] || undefined,
      after: params.get('after') || undefined,
      before: params.get('before') || undefined,
      cursor: params.get('cursor') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
