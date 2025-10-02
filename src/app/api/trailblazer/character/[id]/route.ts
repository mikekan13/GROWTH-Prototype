import { NextRequest, NextResponse } from "next/server";
import { withAuth, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (
  session,
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // Get character and verify player access
    const character = await prisma.character.findUnique({
      where: { id },
      include: {
        Campaign: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!character) {
      throw createApiError("Character not found", API_ERRORS.NOT_FOUND.status);
    }

    // Verify this character belongs to the current user
    if (character.playerEmail !== session.email) {
      throw createApiError("Access denied - this character is not assigned to you", API_ERRORS.FORBIDDEN.status);
    }

    return NextResponse.json({ character });
  } catch (error) {
    console.error("Failed to fetch character:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch character" },
      { status: 500 }
    );
  }
});