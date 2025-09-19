/**
 * Test cleanup endpoint for Playwright testing
 * Removes all test users and sessions
 */
import { NextRequest, NextResponse } from "next/server";
import { cleanupTestUsers } from "@/lib/testAuth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Only allow in test environment or when PLAYWRIGHT_TEST is set
  if (process.env.NODE_ENV !== "test" && !process.env.PLAYWRIGHT_TEST) {
    return NextResponse.json(
      { error: "Test endpoints only available in test environment" },
      { status: 403 }
    );
  }

  try {
    // Clean up test sessions
    await prisma.session.deleteMany({
      where: {
        sessionToken: {
          startsWith: "test-session-"
        }
      }
    });

    // Clean up test users
    await cleanupTestUsers();

    return NextResponse.json({
      success: true,
      message: "Test data cleaned up successfully"
    });

  } catch (error) {
    console.error("Test cleanup error:", error);
    return NextResponse.json(
      { error: "Failed to cleanup test data" },
      { status: 500 }
    );
  }
}