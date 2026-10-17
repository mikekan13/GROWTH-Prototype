/**
 * /api/campaigns/[id]/canon-rewrite — CANON REWRITE MODE switch (2026-10-17, temporary).
 * GET: { canonRewrite } for this actor. POST { on: boolean }: ADMIN + campaign GM only.
 * Thin wrapper over services/canon-rewrite.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { canonRewriteActive, setCanonRewriteMode } from '@/services/canon-rewrite';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    return NextResponse.json({ canonRewrite: await canonRewriteActive(id, session.user.id, session.user.role) });
  } catch (error) {
    return errorResponse(error);
  }
}

const bodySchema = z.object({ on: z.boolean() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { on } = bodySchema.parse(await request.json());
    return NextResponse.json(await setCanonRewriteMode(id, session.user.id, session.user.role, on));
  } catch (error) {
    return errorResponse(error);
  }
}
