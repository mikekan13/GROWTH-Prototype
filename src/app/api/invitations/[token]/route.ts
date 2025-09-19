import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Get invitation details by token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invitation = await prisma.playerInvitation.findUnique({
      where: { inviteToken: token },
      include: {
        gm: {
          include: { user: true }
        }
      }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found or expired" },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 }
      );
    }

    // Check if invitation has already been accepted
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { error: `This invitation has already been ${invitation.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      gmName: invitation.gm.user.name || "Your GM",
      playerEmail: invitation.playerEmail,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString()
    });
  } catch (error) {
    console.error("Failed to get invitation details:", error);
    return NextResponse.json(
      { error: "Failed to get invitation details" },
      { status: 500 }
    );
  }
}