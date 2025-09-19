import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth, validateRequired, createApiError, API_ERRORS } from "@/lib/apiHelpers";

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
      return createApiError(API_ERRORS.VALIDATION_ERROR, 'Position coordinates must be numbers');
    }

    // Update character position
    const character = await prisma.character.update({
      where: { id },
      data: {
        x: x,
        y: y
      }
    });

    console.log(`🎯 Updated character ${id} position to (${x}, ${y})`);

    return NextResponse.json({
      success: true,
      character: {
        id: character.id,
        x: character.x,
        y: character.y
      }
    });

  } catch (error: any) {
    console.error('❌ Failed to update character position:', error);

    if (error.code === 'P2025') {
      return createApiError(API_ERRORS.NOT_FOUND, 'Character not found');
    }

    return createApiError(API_ERRORS.INTERNAL_ERROR, 'Failed to update character position');
  } finally {
    await prisma.$disconnect();
  }
});