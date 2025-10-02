import { NextRequest, NextResponse } from "next/server";
import { withAuth, createApiError, API_ERRORS } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const POST = withAuth(async (
  session,
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // Get character and verify player access
    const character = await prisma.character.findUnique({
      where: { id }
    });

    if (!character) {
      throw createApiError("Character not found", API_ERRORS.NOT_FOUND.status);
    }

    // Verify this character belongs to the current user
    if (character.playerEmail !== session.email) {
      throw createApiError("Access denied - this character is not assigned to you", API_ERRORS.FORBIDDEN.status);
    }

    // TODO: Implement Google Sheets refresh functionality
    // This should pull latest data from the character's Google Sheet
    // and update the database character record

    // For now, just return success
    // In the future, this will call the Google Sheets API to refresh data

    return NextResponse.json({
      success: true,
      message: "Character data refreshed from Google Sheets"
    });
  } catch (error) {
    console.error("Failed to refresh character:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to refresh character" },
      { status: 500 }
    );
  }
});