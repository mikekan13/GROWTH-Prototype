import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import crypto from 'crypto';

// GET /api/campaigns - List campaigns (GM's campaigns or campaigns user is in)
export async function GET() {
  const session = await requireAuth();

  const [gmCampaigns, playerCampaigns] = await Promise.all([
    // Campaigns this user GMs
    prisma.campaign.findMany({
      where: { gmUserId: session.user.id },
      include: { _count: { select: { characters: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    // Campaigns this user has characters in
    prisma.campaign.findMany({
      where: { characters: { some: { userId: session.user.id } } },
      include: {
        gmUser: { select: { username: true } },
        characters: { where: { userId: session.user.id }, select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({ gmCampaigns, playerCampaigns });
}

// POST /api/campaigns - Create campaign (GM only)
export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const { name, genre, description } = await request.json();

  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const inviteCode = crypto.randomBytes(4).toString('hex');

  const campaign = await prisma.campaign.create({
    data: {
      name,
      genre,
      description,
      gmUserId: session.user.id,
      inviteCode,
    },
  });

  // Promote user to WATCHER if they're still TRAILBLAZER
  if (session.user.role === 'TRAILBLAZER') {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: 'WATCHER' },
    });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
