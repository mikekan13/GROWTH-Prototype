import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const characters = await prisma.character.findMany({
      select: {
        id: true,
        name: true,
        json: true,
        campaignId: true,
        updatedAt: true
      },
      take: 10
    });

    return NextResponse.json({
      success: true,
      characters: characters.map(char => {
        const characterData = char.json as Record<string, unknown>;
        const position = characterData?.position as { x: number; y: number } | undefined;

        return {
          id: char.id,
          name: char.name,
          campaignId: char.campaignId,
          updatedAt: char.updatedAt,
          x: position?.x ?? null,
          y: position?.y ?? null,
          hasPosition: !!position
        };
      })
    });

  } catch (error) {
    console.error('❌ Failed to fetch character debug info:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    await prisma.$disconnect();
  }
}