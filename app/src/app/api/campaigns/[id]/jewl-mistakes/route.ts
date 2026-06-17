/**
 * JEWL mistake bounty — GM-only flag endpoint.
 *
 * POST a CopilotMessage id + severity. The service debits JEWL's wallet,
 * credits the GM's wallet, persists a JewlMistake row, returns 201.
 *
 * Phase 1: GM flags directly; no UI; no resolution loop. See
 * [[jewl-is-the-interface-2026-06-15]] for the full design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  flagJewlMistake,
  listJewlMistakesForCampaign,
} from '@/services/jewl-mistake';

export const dynamic = 'force-dynamic';

const PostSchema = z.object({
  copilotMessageId: z.string().min(1),
  severity: z.enum(['minor', 'major', 'critical']),
  note: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = PostSchema.parse(await request.json());

    const record = await flagJewlMistake({
      campaignId,
      gmUserId: session.user.id,
      copilotMessageId: body.copilotMessageId,
      severity: body.severity,
      note: body.note,
    });

    return NextResponse.json(
      {
        id: record.id,
        campaignId: record.campaignId,
        copilotMessageId: record.copilotMessageId,
        sessionId: record.sessionId,
        severity: record.severity,
        note: record.note,
        bountyAmount: record.bountyAmount.toString(),
        transactionId: record.transactionId,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200);
    const records = await listJewlMistakesForCampaign(campaignId, limit);
    return NextResponse.json({
      mistakes: records.map((r) => ({
        id: r.id,
        copilotMessageId: r.copilotMessageId,
        gmUserId: r.gmUserId,
        sessionId: r.sessionId,
        severity: r.severity,
        note: r.note,
        bountyAmount: r.bountyAmount.toString(),
        transactionId: r.transactionId,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
