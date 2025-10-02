import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const userId = session.id;

    // Get campaigns where the user is a player
    const playerProfile = await prisma.playerProfile.findUnique({
      where: { userId },
      include: {
        gm: {
          include: {
            user: {
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
        }
      }
    });

    if (!playerProfile || !playerProfile.gm || !playerProfile.gm.user) {
      return NextResponse.json({
        campaigns: []
      });
    }

    interface CampaignWithCounts {
      id: string;
      name: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      _count: {
        characters: number;
        sessions: number;
      };
    }

    // Format campaigns with GM name
    const campaigns = (playerProfile.gm.user.campaigns as CampaignWithCounts[]).map((campaign) => ({
      ...campaign,
      gmName: playerProfile.gm.user.name || playerProfile.gm.user.email,
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