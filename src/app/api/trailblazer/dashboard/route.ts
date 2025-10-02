import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    // Get characters assigned to this player (user)
    const characters = await prisma.character.findMany({
      where: {
        playerEmail: session.email
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Get campaigns where this user is a player
    const campaigns = await prisma.campaign.findMany({
      where: {
        characters: {
          some: {
            playerEmail: session.email
          }
        }
      },
      select: {
        id: true,
        name: true,
        genre: true,
        themes: true,
        description: true,
        createdAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return NextResponse.json({
      characters,
      campaigns
    });
  } catch (error) {
    console.error("Failed to fetch trailblazer dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
});