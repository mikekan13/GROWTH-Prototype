import { NextRequest, NextResponse } from "next/server";
import { EmailService } from "@/lib/emailService";
import { withAuth } from "@/lib/apiHelpers";

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    console.log('🧪 Starting email test...');
    console.log('👤 Authenticated user:', session.user.email);

    const { to, testMode: _testMode } = await request.json();

    if (!to) {
      return NextResponse.json(
        { error: "Recipient email is required" },
        { status: 400 }
      );
    }

    console.log(`📧 Testing email send from ${session.user.email} to ${to}`);

    // Test the email service directly
    const result = await EmailService.sendPlayerInvitation(
      to,
      session.user.name || 'Test GM',
      'test-token-' + Date.now(),
      'Test Campaign'
    );

    console.log('📧 Email service result:', result);

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
      from: session.user.email,
      to
    });
  } catch (error: unknown) {
    console.error("❌ Email test failed:", error);
    return NextResponse.json(
      {
        error: (error instanceof Error ? error.message : null) || "Email test failed",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
});