import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";
import { sheetsMapper } from "@/services/sheetsMapping";

/**
 * POST /api/characters/[id]/sync-from-sheets
 *
 * Syncs character data from Google Sheets to the database.
 * This reads the latest data from the character's Google Sheet and updates the database.
 */
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
    const characterId = params.id;

    console.log(`🔄 Syncing character ${characterId} from Google Sheets`);

    // Get character from database
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        name: true,
        spreadsheetId: true,
        playerEmail: true,
        Campaign: {
          select: {
            id: true,
            gmUserId: true,
          }
        }
      }
    });

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Check if user has access to this character
    const hasAccess = character.Campaign.gmUserId === user.id ||
                     character.playerEmail === user.email;

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if character has a spreadsheet
    if (!character.spreadsheetId) {
      return NextResponse.json({
        error: "Character has no Google Sheet associated with it"
      }, { status: 400 });
    }

    // Read character data from Google Sheets
    console.log(`📖 Reading data from sheet ${character.spreadsheetId}`);
    const sheetData = await sheetsMapper.readCharacterFromSheet(character.spreadsheetId);

    if (!sheetData) {
      return NextResponse.json({
        error: "Could not read character data from Google Sheets"
      }, { status: 500 });
    }

    // Update character in database
    await prisma.character.update({
      where: { id: characterId },
      data: {
        name: sheetData.identity?.name || character.name,
        json: sheetData as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });

    console.log(`✅ Successfully synced character ${character.name} from Google Sheets`);

    return NextResponse.json({
      success: true,
      message: "Character synced successfully from Google Sheets",
      syncedAt: new Date().toISOString(),
      data: sheetData
    });

  } catch (error) {
    console.error("❌ Error syncing character from Google Sheets:", error);
    return NextResponse.json({
      success: false,
      error: "Failed to sync character from Google Sheets",
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 });
  }
}
