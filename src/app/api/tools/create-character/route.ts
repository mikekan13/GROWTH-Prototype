import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { characterName, campaignId } = await request.json();

    if (!characterName?.trim()) {
      return NextResponse.json(
        { error: "Character name is required" },
        { status: 400 }
      );
    }

    // If no campaignId provided, find a default campaign for the user
    let targetCampaignId = campaignId;

    if (!targetCampaignId) {
      // Find user's most recent campaign or create a default one
      const recentCampaign = await prisma.campaign.findFirst({
        where: {
          gmUserId: user.id,
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (recentCampaign) {
        targetCampaignId = recentCampaign.id;
      } else {
        // Create a default campaign for character creation
        const newCampaign = await prisma.campaign.create({
          data: {
            name: "My Campaign",
            description: "Default campaign for character creation",
            gmUserId: user.id,
          }
        });
        targetCampaignId = newCampaign.id;
      }
    }

    // Verify the campaign exists and user has access
    const campaign = await prisma.campaign.findUnique({
      where: { id: targetCampaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.gmUserId !== user.id) {
      return NextResponse.json(
        { error: "Access denied to campaign" },
        { status: 403 }
      );
    }

    // Create initial character data structure
    const initialCharacterData = {
      name: characterName.trim(),
      attributes: {
        body: { value: 10, max: 10 },
        mind: { value: 10, max: 10 },
        soul: { value: 10, max: 10 },
        sight: { value: 10, max: 10 },
        sound: { value: 10, max: 10 },
        scent: { value: 10, max: 10 },
        taste: { value: 10, max: 10 },
        touch: { value: 10, max: 10 },
        sixth: { value: 10, max: 10 }
      },
      skills: [],
      abilities: [],
      items: [],
      background: "",
      notes: ""
    };

    // Create the character in the database (without Google Sheets)
    const character = await prisma.character.create({
      data: {
        name: characterName.trim(),
        campaignId: targetCampaignId,
        spreadsheetId: null, // No spreadsheet by default
        playerEmail: user.email || null,
        json: initialCharacterData,
        revId: null,
      },
    });

    console.log(`✅ Created character "${character.name}" in campaign "${campaign.name}"`);

    return NextResponse.json({
      success: true,
      character: {
        id: character.id,
        name: character.name,
        campaignId: character.campaignId,
        json: character.json,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
      }
    });
  } catch (error) {
    console.error("Tools create character API error:", error);
    return NextResponse.json(
      { error: `Failed to create character: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}