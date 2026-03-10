import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { canManageCampaign } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      throw new ForbiddenError('Only the campaign GM can view campaign economy');
    }

    // Get or create campaign wallet
    let campaignWallet = await prisma.wallet.findFirst({
      where: { campaignId, walletType: 'CAMPAIGN' },
    });
    if (!campaignWallet) {
      campaignWallet = await prisma.wallet.create({
        data: { walletType: 'CAMPAIGN', ownerType: 'CAMPAIGN', campaignId, balance: BigInt(0) },
      });
    }

    // Get character wallets + names
    const [characterWallets, characters] = await Promise.all([
      prisma.wallet.findMany({
        where: { campaignId, walletType: 'CHARACTER' },
        select: { characterId: true, balance: true },
      }),
      prisma.character.findMany({
        where: { campaignId },
        select: { id: true, name: true },
      }),
    ]);

    const nameMap = new Map(characters.map(c => [c.id, c.name]));

    let crystallized = BigInt(0);
    const breakdown = characterWallets.map(w => {
      crystallized += w.balance;
      return {
        characterId: w.characterId ?? '',
        name: nameMap.get(w.characterId ?? '') ?? 'Unknown',
        balance: w.balance.toString(),
      };
    });

    const fluid = campaignWallet.balance;
    const total = fluid + crystallized;

    return NextResponse.json({
      campaignId,
      fluid: fluid.toString(),
      crystallized: crystallized.toString(),
      total: total.toString(),
      characterBreakdown: breakdown,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
