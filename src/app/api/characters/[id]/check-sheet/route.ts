import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";
import { getDriveService } from "@/services/google";

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
    const character = await prisma.character.findUnique({
      where: { id: params.id },
      select: { spreadsheetId: true, name: true },
    });

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    if (!character.spreadsheetId) {
      return NextResponse.json({
        exists: false,
        error: "No spreadsheet ID associated with character"
      });
    }

    try {
      // Try to access the sheet using service account first
      const drive = await getDriveService();

      const response = await drive.files.get({
        fileId: character.spreadsheetId,
        fields: "id,name,trashed,owners",
      });

      const isAccessible = response.data && !response.data.trashed;

      return NextResponse.json({
        exists: isAccessible,
        spreadsheetId: character.spreadsheetId,
        characterName: character.name,
        sheetInfo: isAccessible ? {
          id: response.data.id,
          name: response.data.name,
          trashed: response.data.trashed,
          owners: response.data.owners,
        } : null,
      });

    } catch (sheetError: unknown) {
      // Sheet doesn't exist or is not accessible
      console.warn(`Sheet ${character.spreadsheetId} not accessible:`, sheetError instanceof Error ? sheetError.message : String(sheetError));

      return NextResponse.json({
        exists: false,
        spreadsheetId: character.spreadsheetId,
        characterName: character.name,
        error: sheetError instanceof Error ? sheetError.message : "Sheet not accessible",
      });
    }

  } catch (error) {
    console.error("Check sheet API error:", error);
    return NextResponse.json(
      { error: "Failed to check sheet status" },
      { status: 500 }
    );
  }
}