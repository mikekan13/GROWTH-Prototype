/**
 * Manual God-Head Invocation — Admin-only testing endpoint.
 *
 * POST /api/godhead/[name]/invoke
 * Body: { triggerType: string, triggerData: object, model?: string }
 *
 * Loads the named god-head, runs one invocation, returns the result
 * including action logs and token usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { GodHeadAgent } from '@/godhead/agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // God-heads may need time to think

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const session = await requireAuth();

    // Admin only
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { name } = await params;
    const body = await request.json();
    const { triggerType, triggerData, model } = body as {
      triggerType: string;
      triggerData: Record<string, unknown>;
      model?: string;
    };

    if (!triggerType) {
      return NextResponse.json({ error: 'triggerType is required' }, { status: 400 });
    }

    // Load and invoke the agent
    const agent = await GodHeadAgent.load(decodeURIComponent(name), model);
    const result = await agent.invoke(triggerType, triggerData || {});

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
