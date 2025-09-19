import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (_session, _request: NextRequest) => {
  try {
    // Get all active campaigns that are accepting character creation
    const campaigns = await prisma.campaign.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        genre: true,
        themes: true,
        description: true,
        createdAt: true,
        worlds: {
          where: {
            isActive: true
          },
          select: {
            id: true,
            name: true,
            description: true,
            worldType: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Failed to fetch campaigns for character creation:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
});