import { NextRequest, NextResponse } from "next/server";
import { CharacterFallbackService } from "@/services/characterFallback";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
    }

    const results = await CharacterFallbackService.listCampaignCharacters(campaignId, {
      preferSheets: true,
      autoSync: true,
      createMissingSheets: false,
      fallbackOnError: true
    });

    const simplified = results.map(result => ({
      data: {
        id: result.data?.id,
        name: result.data?.name,
        x: result.data?.x,
        y: result.data?.y,
        type: result.data?.type
      },
      source: result.source,
      hasPosition: (result.data?.x !== undefined && result.data?.x !== 0) || (result.data?.y !== undefined && result.data?.y !== 0)
    }));

    return NextResponse.json({
      success: true,
      characters: simplified,
      total: results.length
    });

  } catch (error) {
    console.error('❌ Failed to fetch campaign character debug info:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}