import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createDefaultCharacter } from '@/lib/defaults';

// GET /api/characters - List user's characters
export async function GET() {
  const session = await requireAuth();

  const characters = await prisma.character.findMany({
    where: { userId: session.user.id },
    include: { campaign: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({
    characters: characters.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      campaignName: c.campaign.name,
      updatedAt: c.updatedAt,
    })),
  });
}

// POST /api/characters - Create character
export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const { name, campaignId } = await request.json();

  if (!name || !campaignId) {
    return NextResponse.json({ error: 'Name and campaignId required' }, { status: 400 });
  }

  // Verify campaign exists and user has access
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const defaultData = createDefaultCharacter(name);

  const character = await prisma.character.create({
    data: {
      name,
      userId: session.user.id,
      campaignId,
      data: JSON.stringify(defaultData),
    },
  });

  return NextResponse.json({ character: { id: character.id, name: character.name } }, { status: 201 });
}
