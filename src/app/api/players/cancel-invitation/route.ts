import { NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { PlayerInvitationService } from "@/lib/playerInvitations";
import { prisma } from "@/lib/prisma";

export const POST = withAuth(async (session, req: { json: () => Promise<{ invitationId: string }> }) => {
  try {
    const { invitationId } = await req.json();

    if (!invitationId) {
      return NextResponse.json(
        { error: "Invitation ID is required" },
        { status: 400 }
      );
    }

    // Get GM profile
    const gmProfile = await prisma.gMProfile.findUnique({
      where: { userId: (session as { user: { id: string } }).user.id }
    });

    if (!gmProfile) {
      return NextResponse.json(
        { error: "Only GMs can cancel invitations" },
        { status: 403 }
      );
    }

    await PlayerInvitationService.cancelInvitation(gmProfile.id, invitationId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to cancel invitation:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : null) || "Failed to cancel invitation" },
      { status: 500 }
    );
  }
});