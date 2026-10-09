import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listCampaignSkillRelevance, setCampaignOverride, normalizeSkillName } from '@/services/skill-relevance';

/**
 * Skill → head-domain relevance for a campaign's characters (perception unit 3).
 * GM of the campaign or ADMIN only (services/campaign-access requireCampaignGM).
 *   GET  → { skills: [{ skillName, characters, domains: { <domain>: { relevance, source } } }] }
 *        (unscored skills are scored once by the small model and cached)
 *   PUT  { skillName, domain, relevance: 0..1 | null } → { skillName, domains }
 *        GM override for this campaign; null clears it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const skills = await listCampaignSkillRelevance(id, session.user);
    return NextResponse.json({ skills });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const domains = await setCampaignOverride(id, session.user, body);
    return NextResponse.json({ skillName: normalizeSkillName(String(body.skillName)), domains });
  } catch (error) {
    return errorResponse(error);
  }
}
