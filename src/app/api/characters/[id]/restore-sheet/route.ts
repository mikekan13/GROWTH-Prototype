import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";
import { copySpreadsheet, shareSpreadsheet, getOrCreateCampaignFolder } from "@/services/google";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    // Get character and campaign info
    const character = await prisma.character.findUnique({
      where: { id: params.id },
      include: {
        Campaign: {
          select: { id: true, name: true, folderId: true }
        }
      },
    });

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const templateId = process.env.CHARACTER_TEMPLATE_ID;
    if (!templateId) {
      return NextResponse.json(
        { error: "No character template configured" },
        { status: 500 }
      );
    }

    console.log(`🔧 Restoring sheet for character "${character.name}"`);

    // Get campaign folder
    let targetFolderId = character.Campaign.folderId;
    if (!targetFolderId && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
      try {
        const campaignFolder = await getOrCreateCampaignFolder(
          character.Campaign.id,
          character.Campaign.name
        );
        targetFolderId = campaignFolder.id ?? null;
      } catch (error) {
        console.warn("Failed to get campaign folder:", error);
      }
    }

    // Create new sheet from template
    const newSpreadsheet = await copySpreadsheet(
      templateId,
      `${character.name} - Character Sheet (Restored)`,
      targetFolderId || undefined
    );

    if (!newSpreadsheet.id) {
      throw new Error("Failed to create restored spreadsheet");
    }

    console.log(`✅ Created restored sheet: ${newSpreadsheet.id}`);

    // TODO: Populate the sheet with character data from database
    // This would involve updating named ranges with stored character values
    // For now, just update the database with the new sheet ID

    // Update character with new spreadsheet ID
    await prisma.character.update({
      where: { id: character.id },
      data: {
        spreadsheetId: newSpreadsheet.id,
        // Reset revId since this is a new sheet
        revId: null,
      },
    });

    // Share with player if they have an email
    if (character.playerEmail) {
      try {
        await shareSpreadsheet(newSpreadsheet.id, character.playerEmail, "writer");
        console.log(`✅ Shared restored sheet with ${character.playerEmail}`);
      } catch (shareError) {
        console.warn("Failed to share restored sheet:", shareError);
      }
    }

    return NextResponse.json({
      success: true,
      spreadsheetId: newSpreadsheet.id,
      name: newSpreadsheet.name,
      url: `https://docs.google.com/spreadsheets/d/${newSpreadsheet.id}/edit`,
      message: "Character sheet restored successfully",
    });

  } catch (error) {
    console.error("Restore sheet API error:", error);
    return NextResponse.json(
      { error: `Failed to restore character sheet: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}