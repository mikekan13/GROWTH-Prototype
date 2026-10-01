import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { ensureGodheadEntities, godheadTree, seatGodhead } from '@/services/godhead-beings';

export const dynamic = 'force-dynamic';

const seatSchema = z.object({ godheadId: z.string().min(1), parentId: z.string().nullable().optional(), domainKey: z.string().nullable().optional() });

// GET /api/daya/godheads — the custodian tree (ADMIN).
export async function GET() {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    return NextResponse.json(await godheadTree());
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/daya/godheads — ensure every Godhead is a being (DayaEntity, godlike) (ADMIN).
export async function POST() {
  try {
    const session = await requireAuth();
    return NextResponse.json({ beings: await ensureGodheadEntities(session.user.role) });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/daya/godheads — seat a Godhead under a parent and/or at a domain (ADMIN).
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    const input = seatSchema.parse(await request.json());
    return NextResponse.json({ godhead: await seatGodhead(session.user.role, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
