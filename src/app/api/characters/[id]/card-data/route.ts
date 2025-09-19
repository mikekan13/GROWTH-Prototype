import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readCharacterFromSheet } from "@/services/sheetReader";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await context.params;
    const characterId = params.id;

    // Get character data from database
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
    const hasAccess = character.Campaign.gmUserId === session.user.id ||
                     character.playerEmail === session.user.email;

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Read character card data from Google Sheets
    console.log(`📊 Fetching character card data for ${character.name} from sheet ${character.spreadsheetId}`);

    const cardData = await readCharacterFromSheet(character.spreadsheetId, characterId);

    if (!cardData) {
      return NextResponse.json({
        error: "Could not read character data from sheet",
        fallback: {
          name: character.name,
          portrait: null,
          tkv: "0",
          attributes: {
            clout: { current: 0, max: 1 },
            celerity: { current: 0, max: 1 },
            constitution: { current: 0, max: 1 },
            focus: { current: 0, max: 1 },
            frequency: { current: 0, max: 1 },
            flow: { current: 0, max: 1 },
            willpower: { current: 0, max: 1 },
            wisdom: { current: 0, max: 1 }
          }
        }
      }, { status: 200 });
    }

    console.log(`✅ Successfully retrieved character card data for ${cardData.name}`);

    return NextResponse.json({
      success: true,
      data: cardData,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Error fetching character card data:", error);
    return NextResponse.json({
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 });
  }
}