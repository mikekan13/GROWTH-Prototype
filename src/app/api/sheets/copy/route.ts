import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { copySpreadsheet, shareSpreadsheet } from "@/services/google";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { spreadsheetId, playerName, playerEmail } = await request.json();

    if (!spreadsheetId || !playerName || !playerEmail) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Copy the spreadsheet
    const newSpreadsheet = await copySpreadsheet(
      spreadsheetId,
      `${playerName} - Character Sheet`
    );

    if (!newSpreadsheet.id) {
      throw new Error("Failed to get new spreadsheet ID");
    }

    // Share with the player
    await shareSpreadsheet(newSpreadsheet.id, playerEmail, "writer");

    return NextResponse.json({
      id: newSpreadsheet.id,
      name: newSpreadsheet.name,
      url: `https://docs.google.com/spreadsheets/d/${newSpreadsheet.id}/edit`,
    });
  } catch (error) {
    console.error("Copy spreadsheet API error:", error);
    return NextResponse.json(
      { error: "Failed to copy spreadsheet" },
      { status: 500 }
    );
  }
}