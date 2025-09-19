import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const userId = (session as { user: { id: string } }).user.id;

    // Get campaigns where the user is a player
    const playerProfile = await prisma.playerProfile.findUnique({
      where: { userId },
      include: {
        gm: {
          include: {
            campaigns: {
              include: {
                _count: {
                  select: {
                    characters: true,
                    sessions: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!playerProfile || !playerProfile.gm) {
      return NextResponse.json({
        campaigns: []
      });
    }

    // Format campaigns with GM name
    const campaigns = playerProfile.gm.campaigns.map(campaign => ({
      ...campaign,
      gmName: playerProfile.gm.name || playerProfile.gm.email,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      campaigns
    });
  } catch (error) {
    console.error("Failed to get player campaigns:", error);
    return NextResponse.json(
      { error: "Failed to get campaigns" },
      { status: 500 }
    );
  }
});