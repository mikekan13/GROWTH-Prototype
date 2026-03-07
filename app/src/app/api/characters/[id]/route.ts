import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/characters/[id] - Get character detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      campaign: { select: { name: true, gmUserId: true } },
      backstory: true,
    },
  });

  if (!character) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only owner or campaign GM can view
  const isOwner = character.userId === session.user.id;
  const isGM = character.campaign.gmUserId === session.user.id;
  const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';

  if (!isOwner && !isGM && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    character: {
      id: character.id,
      name: character.name,
      status: character.status,
      data: JSON.parse(character.data),
      portrait: character.portrait,
      campaignName: character.campaign.name,
      backstory: character.backstory,
    },
  });
}

// PATCH /api/characters/[id] - Update character data
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id } = await params;
  const body = await request.json();

  const character = await prisma.character.findUnique({
    where: { id },
    include: { campaign: { select: { gmUserId: true } } },
  });

  if (!character) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only campaign GM or admin can update character data
  const isGM = character.campaign.gmUserId === session.user.id;
  const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';

  if (!isGM && !isAdmin) {
    return NextResponse.json({ error: 'Only the GM can modify character data' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.data) updateData.data = JSON.stringify(body.data);
  if (body.name) updateData.name = body.name;
  if (body.status) updateData.status = body.status;
  if (body.portrait !== undefined) updateData.portrait = body.portrait;

  const updated = await prisma.character.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({
    character: { id: updated.id, name: updated.name, status: updated.status },
  });
}
