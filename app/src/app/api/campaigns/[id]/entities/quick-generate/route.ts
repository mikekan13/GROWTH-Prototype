import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { generateEntityDraft } from '@/services/entity-quick-gen';

// AI quick-gen is slow (~3-8s for Claude) — opt out of static optimization.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const result = await generateEntityDraft(session.user.id, session.user.role, {
      campaignId: id,
      name: body.name,
      prompt: body.prompt,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
