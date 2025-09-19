import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const characters = await prisma.character.findMany({
      select: {
        id: true,
        name: true,
        x: true,
        y: true,
        campaignId: true,
        updatedAt: true
      },
      take: 10
    });

    return NextResponse.json({
      success: true,
      characters: characters.map(char => ({
        ...char,
        x: char.x,
        y: char.y,
        hasPosition: char.x !== null && char.y !== null
      }))
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