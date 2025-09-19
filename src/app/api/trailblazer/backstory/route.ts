import { NextRequest, NextResponse } from "next/server";
import { withAuth, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const backstories = await prisma.characterBackstory.findMany({
      where: {
        playerId: session.user.id
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            genre: true
          }
        },
        world: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return NextResponse.json({ backstories });
  } catch (error) {
    console.error("Failed to fetch backstories:", error);
    return NextResponse.json(
      { error: "Failed to fetch backstories" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    const body = await request.json();
    const {
      campaignId,
      worldId,
      characterName,
      hair,
      eyes,
      physicalFeatures,
      childhood,
      significantEvent,
      motivation,
      fears,
      relationships,
      goals,
      narrativeBackstory
    } = body;

    if (!campaignId) {
      throw createApiError("Campaign ID is required", API_ERRORS.VALIDATION.status);
    }

    // Get campaign to find GM
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        characters: {
          select: {
            id: true
          },
          take: 1
        }
      }
    });

    if (!campaign) {
      throw createApiError("Campaign not found", API_ERRORS.NOT_FOUND.status);
    }

    // Find GM for this campaign (first user who created characters in it)
    const gmProfile = await prisma.gMProfile.findFirst({
      include: {
        user: true
      }
    });

    if (!gmProfile) {
      throw createApiError("No GM found", API_ERRORS.NOT_FOUND.status);
    }

    const backstory = await prisma.characterBackstory.create({
      data: {
        campaignId,
        worldId,
        playerId: session.user.id,
        gmId: gmProfile.userId,
        characterName,
        hair,
        eyes,
        physicalFeatures,
        childhood,
        significantEvent,
        motivation,
        fears,
        relationships,
        goals,
        narrativeBackstory,
        status: 'DRAFT'
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({ backstory });
  } catch (error) {
    console.error("Failed to create backstory:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to create backstory" },
      { status: 500 }
    );
  }
});