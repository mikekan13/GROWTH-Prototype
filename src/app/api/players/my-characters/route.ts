import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    const userId = (session as { user: { id: string } }).user.id;

    // Get all characters owned by the user
    const characters = await prisma.character.findMany({
      where: { userId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format the response
    const formattedCharacters = characters.map(character => ({
      ...character,
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
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