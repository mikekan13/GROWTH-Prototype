import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, campaignId, spreadsheetId, playerEmail } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Character name is required" },
        { status: 400 }
      );
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID is required" },
        { status: 400 }
      );
    }

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Spreadsheet ID is required" },
        { status: 400 }
      );
    }

    // Verify the campaign exists and user has access
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Create the character in the database
    const character = await prisma.character.create({
      data: {
        name: name.trim(),
        campaignId,
        spreadsheetId,
        playerEmail: playerEmail || null,
        json: {}, // Empty JSON object for character data
        revId: null, // Will be set when sheet is first synced
      },
    });

    console.log(`✅ Created character "${character.name}" with spreadsheet ${spreadsheetId}`);

    return NextResponse.json({
      id: character.id,
      name: character.name,
      campaignId: character.campaignId,
      spreadsheetId: character.spreadsheetId,
      playerEmail: character.playerEmail,
      createdAt: character.updatedAt,
    });
  } catch (error) {
    console.error("Create character API error:", error);
    return NextResponse.json(
      { error: "Failed to create character" },
      { status: 500 }
    );
  }
}