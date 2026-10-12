import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setCampaignAdultOnly } from '@/services/maturity';

const bodySchema = z.object({ adultOnly: z.boolean() });

/** Watcher's 18+ toggle (Mike 2026-10-12). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { adultOnly } = bodySchema.parse(await request.json());
    const result = await setCampaignAdultOnly(id, session.user, adultOnly);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
