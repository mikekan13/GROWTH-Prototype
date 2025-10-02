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

    const backstory = await prisma.characterBackstory.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!backstory) {
      throw createApiError("Backstory not found", API_ERRORS.NOT_FOUND.status);
    }

    // Verify this backstory belongs to the current user
    if (backstory.playerId !== session.id) {
      throw createApiError("Access denied - this backstory is not assigned to you", API_ERRORS.FORBIDDEN.status);
    }

    // Only allow submission if status is DRAFT or REVISION_NEEDED
    if (backstory.status !== 'DRAFT' && backstory.status !== 'REVISION_NEEDED') {
      throw createApiError("Cannot submit backstory in current status", API_ERRORS.VALIDATION.status);
    }

    // Validate required fields
    if (!backstory.characterName?.trim()) {
      throw createApiError("Character name is required", API_ERRORS.VALIDATION.status);
    }

    if (!backstory.childhood?.trim() && !backstory.significantEvent?.trim() && !backstory.motivation?.trim()) {
      throw createApiError("At least one background story field is required", API_ERRORS.VALIDATION.status);
    }

    // Update status to SUBMITTED
    const updatedBackstory = await prisma.characterBackstory.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date()
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({
      backstory: updatedBackstory,
      message: "Backstory submitted successfully! Your GM will review it soon."
    });
  } catch (error) {
    console.error("Failed to submit backstory:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to submit backstory" },
      { status: 500 }
    );
  }
});