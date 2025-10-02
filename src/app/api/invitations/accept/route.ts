import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { PlayerInvitationService } from "@/lib/playerInvitations";

// Accept an invitation
export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    const { inviteToken } = await request.json();

    if (!inviteToken) {
      return NextResponse.json(
        { error: "Invitation token is required" },
        { status: 400 }
      );
    }

    await PlayerInvitationService.acceptInvitation({
      inviteToken,
      userId: session.id
    });

    return NextResponse.json({
      success: true,
      message: "Invitation accepted successfully! Welcome to the campaign."
    });
  } catch (error: unknown) {
    console.error("Failed to accept invitation:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : null) || "Failed to accept invitation" },
      { status: 400 }
    );
  }
});