import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { requireCampaignMember } from '@/services/campaign-access';
import { queryChangeLog } from '@/services/changelog';
import { ownRecordScope, viewAsViewer } from '@/services/perceived-feed';
import type { ChangeActor, ChangeCategory } from '@/types/changelog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const params = req.nextUrl.searchParams;

    const campaignId = params.get('campaignId');
    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
    }
    await requireCampaignMember(campaignId, session.user);

    // Perception (PERCEPTION_FEED): a Trailblazer reads only their own characters' changes — another
    // being's sheet changes are truth their character did not perceive. Watcher / ADMIN / flag off: unchanged.
    // Unit 10: viewing as a character (Watcher / ADMIN only, or one's own) → that character's rows.
    const viewAs = params.get('viewAs');
    const asViewer = viewAs ? await viewAsViewer(campaignId, session.user, viewAs) : null;
    const scope = asViewer?.mode === 'perceived' ? (asViewer.characterId ? [asViewer.characterId] : []) : await ownRecordScope(campaignId, session.user);

    const result = await queryChangeLog({
      campaignId,
      characterId: params.get('characterId') || undefined,
      ...(scope ? { characterIds: scope } : {}),
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
