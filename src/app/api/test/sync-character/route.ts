import { NextResponse } from "next/server";
import { syncCharacterSheet } from "@/services/characterSync";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    console.log("🧪 Testing character sheet sync for 'Lady Death' Tara Almswood");

    // Get the character from the database
    const character = await prisma.character.findFirst({
      where: {
        name: {
          contains: "Lady Death",
        },
      },
      include: {
        Campaign: true,
      },
    });

    if (!character) {
      return NextResponse.json({ error: "Character 'Lady Death' not found" }, { status: 404 });
    }

    console.log(`📋 Found character: ${character.name} (${character.id})`);
    console.log(`📁 Campaign: ${character.Campaign.name}`);
    console.log(`📊 Current sheet ID: ${character.spreadsheetId}`);

    // Trigger sync with creation allowed
    const result = await syncCharacterSheet(
      {
        id: character.id,
        campaignId: character.campaignId,
        name: character.name,
        playerEmail: character.playerEmail || undefined,
        spreadsheetId: character.spreadsheetId || '',
        json: character.json as Record<string, unknown> || {},
      },
      {
        createIfMissing: true,
        preserveData: true,
        campaignName: character.Campaign.name,
        folderId: character.Campaign.folderId || undefined,
      }
    );

    console.log("🔍 Sync result:", result);

    return NextResponse.json({
      success: true,
      character: {
        id: character.id,
        name: character.name,
        campaign: character.Campaign.name,
        oldSpreadsheetId: character.spreadsheetId,
        newSpreadsheetId: result.newSpreadsheetId,
      },
      result,
    });
  } catch (error) {
    console.error("❌ Character sync test failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}