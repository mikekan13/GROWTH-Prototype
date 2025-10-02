import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionManager";
import { prisma } from "@/lib/prisma";

type UserRole = "ADMIN" | "WATCHER" | "TRAILBLAZER" | "GODHEAD";

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();

    // Only allow your account to use this dev feature
    if (!user?.email || user.email !== "mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Unauthorized - Dev feature only" },
        { status: 403 }
      );
    }

    const { role } = await request.json();

    // Validate role
    const validRoles: UserRole[] = ["ADMIN", "WATCHER", "TRAILBLAZER", "GODHEAD"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    const userId = user.id;

    // Update user role in database
    await prisma.user.update({
      where: { id: userId },
      data: { role }
    });

    // Handle role-specific setup
    if (role === "ADMIN") {
      // ADMIN role has full access, no additional setup needed
      // Could add admin-specific initialization here if needed
    } else if (role === "WATCHER") {
      // Check if GM profile exists
      const existingGMProfile = await prisma.gMProfile.findUnique({
        where: { userId }
      });

      if (!existingGMProfile) {
        // Create GM profile if switching to GM
        await prisma.gMProfile.create({
          data: {
            userId,
            signupMonth: 1,
            baselineActive: true
          }
        });
      }
    } else if (role === "TRAILBLAZER") {
      // For TRAILBLAZER, we need both GM and Player profiles for dev testing
      // First ensure GM profile exists
      let gmProfile = await prisma.gMProfile.findUnique({
        where: { userId }
      });

      if (!gmProfile) {
        gmProfile = await prisma.gMProfile.create({
          data: {
            userId,
            signupMonth: 1,
            baselineActive: true
          }
        });
      }

      // Then check if they have a player profile
      const existingPlayerProfile = await prisma.playerProfile.findUnique({
        where: { userId }
      });

      if (!existingPlayerProfile) {
        // Create a player profile using their own GM profile ID for dev testing
        await prisma.playerProfile.create({
          data: {
            userId,
            gmId: gmProfile.id,
            joinedAt: new Date()
          }
        });
      }
    } else if (role === "GODHEAD") {
      // GODHEAD role for AI agents - not fully implemented yet
      // Could add AI agent-specific initialization here if needed
    }

    return NextResponse.json({
      success: true,
      role,
      message: `Role switched to ${role}`
    });

  } catch (error) {
    console.error("Error switching role:", error);
    return NextResponse.json(
      { error: "Failed to switch role" },
      { status: 500 }
    );
  }
}