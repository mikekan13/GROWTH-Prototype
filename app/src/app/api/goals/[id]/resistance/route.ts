import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isWatcherOrAbove } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import {
  assignResistanceEntity,
  removeResistanceEntity,
  listResistanceEntities,
  assignResistanceSchema,
} from '@/services/goal-resistance';

// GET /api/goals/[id]/resistance — list resistance entities for a goal
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;
    const entities = await listResistanceEntities(id);
    return NextResponse.json({ entities });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/goals/[id]/resistance — assign an entity as resistance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    if (!isWatcherOrAbove(session.user.role)) {
      throw new ForbiddenError('Only Watchers and above can assign resistance');
    }
    const { id } = await params;
    const body = await request.json();
    const input = assignResistanceSchema.parse(body);
    const relationship = await assignResistanceEntity(id, session.user.id, session.user.role, input);
    return NextResponse.json({ relationship }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/goals/[id]/resistance?entityId=... — remove a resistance entity
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    if (!isWatcherOrAbove(session.user.role)) {
      throw new ForbiddenError('Only Watchers and above can remove resistance');
    }
    const { id } = await params;
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) {
      return NextResponse.json({ error: 'entityId required' }, { status: 400 });
    }
    const result = await removeResistanceEntity(id, entityId, session.user.id, session.user.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
