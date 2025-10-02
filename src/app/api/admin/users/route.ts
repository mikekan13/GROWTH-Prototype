import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    // Admin access only for Mikekan13@gmail.com
    if (session.email !== "Mikekan13@gmail.com") {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Get all users with counts
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        krmaBalance: true,
        _count: {
          select: {
            sessions: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format the response
    const formattedUsers = users.map(user => ({
      ...user,
      krmaBalance: user.krmaBalance?.toString() || "0",
    }));

    return NextResponse.json({
      users: formattedUsers
    });
  } catch (error) {
    console.error("Failed to get users:", error);
    return NextResponse.json(
      { error: "Failed to get users" },
      { status: 500 }
    );
  }
});