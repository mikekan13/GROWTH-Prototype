/**
 * Test-only authentication endpoint for Playwright testing
 * Bypasses Google OAuth and creates session directly
 */
import { NextRequest, NextResponse } from "next/server";
import { createTestUser, createTestSession, TEST_USERS } from "@/lib/testAuth";
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
    const { userType } = await request.json();

    // Validate user type
    if (!userType || !TEST_USERS[userType as keyof typeof TEST_USERS]) {
      return NextResponse.json(
        { error: "Invalid user type. Must be ADMIN, WATCHER, or TRAILBLAZER" },
        { status: 400 }
      );
    }

    // Ensure test user exists in database (only create if doesn't exist)
    try {
      await createTestUser(userType);
    } catch (error) {
      // If user already exists, that's fine for our testing purposes
      if (error instanceof Error && error.message.includes('already')) {
        console.log(`Test user ${userType} already exists, proceeding with session creation`);
      } else {
        throw error;
      }
    }

    // Get the actual user from database for session creation
    const testUser = TEST_USERS[userType as keyof typeof TEST_USERS];
    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email }
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "Test user not found in database" },
        { status: 500 }
      );
    }

    // Generate test session
    const session = createTestSession(userType);

    // Create session in database (NextAuth format)
    const sessionRecord = await prisma.session.create({
      data: {
        sessionToken: `test-session-${userType}-${Date.now()}`,
        userId: dbUser.id,
        expires: new Date(session.expires)
      }
    });

    return NextResponse.json({
      success: true,
      session,
      sessionToken: sessionRecord.sessionToken,
      message: `Test login successful for ${userType}`
    });

  } catch (error) {
    console.error("Test login error:", error);
    return NextResponse.json(
      { error: "Failed to create test login" },
      { status: 500 }
    );
  }
}