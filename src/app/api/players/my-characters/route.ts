import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const playerEmail = session.email;

    // Get all characters owned by the user
    const characters = await prisma.character.findMany({
      where: { playerEmail },
      include: {
        Campaign: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Format the response
    const formattedCharacters = characters.map(character => ({
      id: character.id,
      name: character.name,
      playerEmail: character.playerEmail,
      spreadsheetId: character.spreadsheetId,
      updatedAt: character.updatedAt.toISOString(),
      campaign: character.Campaign
    }));

    return NextResponse.json({
      characters: formattedCharacters
    });
  } catch (error) {
    console.error("Failed to get player characters:", error);
    return NextResponse.json(
      { error: "Failed to get characters" },
      { status: 500 }
    );
  }
});