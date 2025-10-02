import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import { CharacterFallbackService } from "@/services/characterFallback";

// Get character data with Google Sheets fallback
export async function GET(
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
    const { searchParams } = new URL(request.url);

    // Get query parameters for fallback options
    const preferSheets = searchParams.get('preferSheets') === 'true';
    const autoSync = searchParams.get('autoSync') !== 'false'; // Default true
    const createMissingSheets = searchParams.get('createMissingSheets') !== 'false'; // Default true
    const fallbackOnError = searchParams.get('fallbackOnError') !== 'false'; // Default true

    console.log(`🔍 API: Getting character ${characterId} with fallback options:`, {
      preferSheets,
      autoSync,
      createMissingSheets,
      fallbackOnError
    });

    const result = await CharacterFallbackService.getCharacterData(characterId, {
      preferSheets,
      autoSync,
      createMissingSheets,
      fallbackOnError
    });

    if (!result.data) {
      return NextResponse.json(
        { error: result.error || "Character not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      character: result.data,
      source: result.source,
      spreadsheetId: result.spreadsheetId,
      syncStatus: result.syncStatus,
      error: result.error
    });

  } catch (error) {
    console.error("Character API error:", error);
    return NextResponse.json(
      { error: `Failed to get character: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// Update character data with Google Sheets sync
export async function PATCH(
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
    const body = await request.json();
    const { characterData, syncToSheets = true, updateDatabase = true } = body;

    console.log(`📝 API: Updating character ${characterId}`, {
      syncToSheets,
      updateDatabase,
      hasData: !!characterData
    });

    const result = await CharacterFallbackService.saveCharacterData(
      characterId,
      characterData,
      { syncToSheets, updateDatabase }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to save character" },
        { status: 500 }
      );
    }

    // Return updated character data
    const updatedResult = await CharacterFallbackService.getCharacterData(characterId, {
      preferSheets: syncToSheets,
      autoSync: true
    });

    return NextResponse.json({
      success: true,
      character: updatedResult.data,
      source: updatedResult.source,
      syncStatus: updatedResult.syncStatus
    });

  } catch (error) {
    console.error("Character update API error:", error);
    return NextResponse.json(
      { error: `Failed to update character: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// Delete character and associated Google Sheet
export const DELETE = withAuth(async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id: characterId } = await params;

    // Get character data first to access spreadsheet ID
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        Campaign: true
      }
    });

    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 }
      );
    }

    // Check if character is assigned to a player
    if (character.playerEmail) {
      return NextResponse.json(
        { error: "Cannot delete character that is assigned to a player" },
        { status: 400 }
      );
    }

    // Delete from Google Drive if spreadsheet exists
    if (character.spreadsheetId) {
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          },
          scopes: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
          ],
        });

        const drive = google.drive({ version: 'v3', auth });

        // Delete the Google Sheet
        await drive.files.delete({
          fileId: character.spreadsheetId
        });

        console.log(`Deleted Google Sheet: ${character.spreadsheetId}`);
      } catch (driveError) {
        console.error("Failed to delete Google Sheet:", driveError);
        // Continue with database deletion even if Google Sheet deletion fails
      }
    }

    // Delete character from database (this will cascade delete related records)
    await prisma.character.delete({
      where: { id: characterId }
    });

    console.log(`Deleted character: ${character.name} (${characterId})`);

    return NextResponse.json({
      success: true,
      message: "Character deleted successfully"
    });

  } catch (error) {
    console.error("Failed to delete character:", error);
    return NextResponse.json(
      { error: "Failed to delete character" },
      { status: 500 }
    );
  }
});