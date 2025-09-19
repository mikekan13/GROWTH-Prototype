import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { PlayerInvitationService } from "@/lib/playerInvitations";

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    const { inviteToken } = await request.json();

    if (!inviteToken) {
      return NextResponse.json(
        { error: "Invite token is required" },
        { status: 400 }
      );
    }

    await PlayerInvitationService.acceptInvitation({
      inviteToken,
      userId: (session as { user: { id: string } }).user.id
    });

    return NextResponse.json({
      success: true,
      message: "Successfully joined GM's player group"
    });
  } catch (error: unknown) {
    console.error("Failed to accept invitation:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : null) || "Failed to accept invitation" },
      { status: 400 }
    );
  }
});

// Public endpoint to check invitation details
export const GET = async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const inviteToken = url.searchParams.get('token');

    if (!inviteToken) {
      return NextResponse.json(
        { error: "Invite token is required" },
        { status: 400 }
      );
    }

    const invitation = await PlayerInvitationService.getInvitationByToken(inviteToken);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      invitation: {
        gmName: invitation.gm.user.name,
        gmEmail: invitation.gm.user.email,
        playerEmail: invitation.playerEmail,
        expiresAt: invitation.expiresAt,
        isValid: invitation.isValid
      }
    });
  } catch (error: unknown) {
    console.error("Failed to get invitation details:", error);
    return NextResponse.json(
      { error: "Failed to get invitation details" },
      { status: 500 }
    );
  }
};