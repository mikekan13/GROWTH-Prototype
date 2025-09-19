import { NextRequest, NextResponse } from "next/server";
import { withAuth, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";
import { OllamaService } from "@/lib/ollamaService";

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
      goals
    } = body;

    if (!campaignId) {
      throw createApiError("Campaign ID is required", API_ERRORS.VALIDATION.status);
    }

    if (!characterName?.trim()) {
      throw createApiError("Character name is required", API_ERRORS.VALIDATION.status);
    }

    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        worlds: worldId ? {
          where: { id: worldId }
        } : undefined
      }
    });

    if (!campaign) {
      throw createApiError("Campaign not found", API_ERRORS.NOT_FOUND.status);
    }

    // Check if Ollama is available
    const isOllamaAvailable = await OllamaService.checkConnection();
    if (!isOllamaAvailable) {
      throw createApiError("AI service is currently unavailable. Please try again later.", API_ERRORS.SERVICE_UNAVAILABLE.status);
    }

    // Get world details if specified
    const world = campaign.worlds && campaign.worlds.length > 0 ? campaign.worlds[0] : null;

    // Generate backstory using Ollama
    const narrativeBackstory = await OllamaService.generateBackstory({
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
      campaignName: campaign.name,
      campaignGenre: campaign.genre || undefined,
      campaignThemes: typeof campaign.themes === 'string' ? campaign.themes : undefined,
      campaignDescription: campaign.description || undefined,
      worldName: world?.name,
      worldDescription: world?.description || undefined
    });

    return NextResponse.json({
      narrativeBackstory,
      message: "Backstory generated successfully"
    });

  } catch (error) {
    console.error("Failed to generate backstory:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate backstory" },
      { status: 500 }
    );
  }
});