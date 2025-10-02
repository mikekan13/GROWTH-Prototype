import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth, validateRequired } from "@/lib/apiHelpers";

const prisma = new PrismaClient();

export const PATCH = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    const body = await request.json();

    // Validate required fields
    validateRequired(body, ['x', 'y']);

    const { x, y } = body;

    // Ensure x and y are valid numbers
    if (typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { error: 'Position coordinates must be numbers' },
        { status: 400 }
      );
    }

    // Get current character to access JSON data
    const currentCharacter = await prisma.character.findUnique({
      where: { id }
    });

    if (!currentCharacter) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      );
    }

    // Update character position in JSON field
    const characterData = currentCharacter.json as Record<string, unknown>;
    const updatedJson = {
      ...characterData,
      position: { x, y }
    };

    const character = await prisma.character.update({
      where: { id },
      data: {
        json: updatedJson
      }
    });

    console.log(`🎯 Updated character ${id} position to (${x}, ${y})`);

    return NextResponse.json({
      success: true,
      character: {
        id: character.id,
        x,
        y
      }
    });

  } catch (error: unknown) {
    console.error('❌ Failed to update character position:', error);

    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update character position' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
});