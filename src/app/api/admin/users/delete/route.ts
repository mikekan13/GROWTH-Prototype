import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    // Admin access only for Mikekan13@gmail.com
    if (session.email !== "Mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Get user details before deletion for verification
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        id: true,
      }
    });

    if (!userToDelete) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Prevent deleting the admin user
    if (userToDelete.email === "Mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Cannot delete the admin user" },
        { status: 403 }
      );
    }

    // Delete user and all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete related records first (due to foreign key constraints)

      // Delete sessions (new auth system)
      await tx.session.deleteMany({
        where: { userId: userId }
      });

      // Delete player profiles
      await tx.playerProfile.deleteMany({
        where: { userId: userId }
      });

      // Delete player invitations sent by this user
      await tx.playerInvitation.deleteMany({
        where: { gmId: userId }
      });

      // Delete player invitations for this user
      if (userToDelete.email) {
        await tx.playerInvitation.deleteMany({
          where: { playerEmail: userToDelete.email }
        });
      }

      // Delete characters owned by this user
      if (userToDelete.email) {
        await tx.character.deleteMany({
          where: { playerEmail: userToDelete.email }
        });
      }

      // Note: Campaigns don't have direct userId relationship
      // They would need to be deleted through GMProfile relationship if needed

      // Delete wallet (if exists)
      await tx.wallet.deleteMany({
        where: {
          ownerRef: userId,
          ownerType: { in: ['GODHEAD', 'TRAILBLAZER', 'WATCHER'] }
        }
      });

      // Finally delete the user
      await tx.user.delete({
        where: { id: userId }
      });
    });

    return NextResponse.json({
      success: true,
      message: `User ${userToDelete.email} has been successfully deleted`
    });

  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
});