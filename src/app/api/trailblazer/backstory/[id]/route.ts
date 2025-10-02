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

    const backstory = await prisma.characterBackstory.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            genre: true
          }
        },
        world: {
          select: {
            id: true,
            name: true
          }
        },
        player: {
          select: {
            id: true,
            name: true,
            email: true
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

    return NextResponse.json({ backstory });
  } catch (error) {
    console.error("Failed to fetch backstory:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch backstory" },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async (
  session,
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const body = await request.json();

    // Find the backstory
    const backstory = await prisma.characterBackstory.findUnique({
      where: { id }
    });

    if (!backstory) {
      throw createApiError("Backstory not found", API_ERRORS.NOT_FOUND.status);
    }

    // Verify this backstory belongs to the current user
    if (backstory.playerId !== session.id) {
      throw createApiError("Access denied - this backstory is not assigned to you", API_ERRORS.FORBIDDEN.status);
    }

    // Only allow updates if status is DRAFT or REVISION_NEEDED
    if (backstory.status !== 'DRAFT' && backstory.status !== 'REVISION_NEEDED') {
      throw createApiError("Cannot edit backstory in current status", API_ERRORS.VALIDATION.status);
    }

    // Build update data
    const updateData: {
      characterName?: string;
      hair?: string;
      eyes?: string;
      physicalFeatures?: string;
      childhood?: string;
      significantEvent?: string;
      motivation?: string;
      fears?: string;
      relationships?: string;
      goals?: string;
      narrativeBackstory?: string;
      worldId?: string;
    } = {};

    // Character Identity fields
    if ('characterName' in body) updateData.characterName = body.characterName;
    if ('hair' in body) updateData.hair = body.hair;
    if ('eyes' in body) updateData.eyes = body.eyes;
    if ('physicalFeatures' in body) updateData.physicalFeatures = body.physicalFeatures;

    // Background Story fields
    if ('childhood' in body) updateData.childhood = body.childhood;
    if ('significantEvent' in body) updateData.significantEvent = body.significantEvent;
    if ('motivation' in body) updateData.motivation = body.motivation;
    if ('fears' in body) updateData.fears = body.fears;
    if ('relationships' in body) updateData.relationships = body.relationships;
    if ('goals' in body) updateData.goals = body.goals;
    if ('narrativeBackstory' in body) updateData.narrativeBackstory = body.narrativeBackstory;

    // World selection
    if ('worldId' in body) updateData.worldId = body.worldId;

    const updatedBackstory = await prisma.characterBackstory.update({
      where: { id },
      data: updateData,
      include: {
        campaign: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({ backstory: updatedBackstory });
  } catch (error) {
    console.error("Failed to update backstory:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to update backstory" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (
  session,
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    const backstory = await prisma.characterBackstory.findUnique({
      where: { id }
    });

    if (!backstory) {
      throw createApiError("Backstory not found", API_ERRORS.NOT_FOUND.status);
    }

    // Verify this backstory belongs to the current user
    if (backstory.playerId !== session.id) {
      throw createApiError("Access denied - this backstory is not assigned to you", API_ERRORS.FORBIDDEN.status);
    }

    // Only allow deletion if status is DRAFT
    if (backstory.status !== 'DRAFT') {
      throw createApiError("Cannot delete backstory that has been submitted", API_ERRORS.VALIDATION.status);
    }

    await prisma.characterBackstory.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete backstory:", error);

    if (error instanceof Error && 'statusCode' in error) {
      const apiError = error as { statusCode: number; message: string };
      return NextResponse.json(
        { error: apiError.message },
        { status: apiError.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete backstory" },
      { status: 500 }
    );
  }
});