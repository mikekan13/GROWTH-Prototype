import { NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { PlayerInvitationService } from "@/lib/playerInvitations";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session) => {
  try {
    // Get GM profile
    const gmProfile = await prisma.gMProfile.findUnique({
      where: { userId: session.id }
    });

    if (!gmProfile) {
      return NextResponse.json(
        { error: "Only GMs can view their players" },
        { status: 403 }
      );
    }

    const result = await PlayerInvitationService.getGMPlayers(gmProfile.id);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Failed to get GM players:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : null) || "Failed to get players" },
      { status: 500 }
    );
  }
});