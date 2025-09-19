import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { getGoogleAuth } from "@/services/google";
import { google } from "googleapis";

export const GET = withAuth(async (session, _request: NextRequest) => {
  try {
    console.log('🔍 GMAIL SETUP DIAGNOSTIC');
    console.log('========================');

    const diagnostics = {
      timestamp: new Date().toISOString(),
      user: (session as { user: { email: string } }).user.email,
      steps: [] as Array<Record<string, unknown>>
    };

    // Step 1: Check OAuth client setup
    diagnostics.steps.push({
      step: 1,
      name: "OAuth Client Configuration",
      status: "checking",
      details: {
        clientId: process.env.GOOGLE_CLIENT_ID ? "✅ Present" : "❌ Missing",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ? "✅ Present" : "❌ Missing"
      }
    });

    // Step 2: Test OAuth authentication
    try {
      const auth = await getGoogleAuth();
      diagnostics.steps.push({
        step: 2,
        name: "OAuth Authentication",
        status: "success",
        details: "✅ Successfully got OAuth client"
      });

      // Step 3: Test Gmail API access
      try {
        const gmail = google.gmail({ version: 'v1', auth });

        // Test basic Gmail API access
        const profile = await gmail.users.getProfile({ userId: 'me' });

        diagnostics.steps.push({
          step: 3,
          name: "Gmail API Access",
          status: "success",
          details: {
            emailAddress: profile.data.emailAddress,
            messagesTotal: profile.data.messagesTotal,
            threadsTotal: profile.data.threadsTotal
          }
        });

        // Step 4: Test Gmail send capability with a dry run
        try {
          // Create a test email message
          const testEmail = [
            'From: "GROWTH RPG System" <' + (process.env.GMAIL_EMAIL || 'noreply@gmail.com') + '>',
            'To: ' + (session as { user: { email: string } }).user.email,
            'Subject: Gmail API Test - Success!',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            '',
            'This is a test email to verify Gmail API is working.',
            'If you receive this, Gmail sending is functional!',
            '',
            'Test timestamp: ' + new Date().toISOString()
          ].join('\r\n');

          const encodedEmail = Buffer.from(testEmail).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          // Actually send the test email
          const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
              raw: encodedEmail,
            },
          });

          diagnostics.steps.push({
            step: 4,
            name: "Gmail Send Test",
            status: "success",
            details: {
              messageId: result.data.id,
              message: "✅ Test email sent successfully to " + (session as { user: { email: string } }).user.email
            }
          });

        } catch (sendError: unknown) {
          diagnostics.steps.push({
            step: 4,
            name: "Gmail Send Test",
            status: "error",
            details: {
              error: (sendError as Error).message,
              code: (sendError as Error & { code?: string }).code,
              scopes_issue: (sendError as Error).message?.includes('insufficient authentication scopes')
            }
          });
        }

      } catch (gmailError: unknown) {
        diagnostics.steps.push({
          step: 3,
          name: "Gmail API Access",
          status: "error",
          details: {
            error: (gmailError as Error).message,
            code: (gmailError as Error & { code?: string }).code
          }
        });
      }

    } catch (authError: unknown) {
      diagnostics.steps.push({
        step: 2,
        name: "OAuth Authentication",
        status: "error",
        details: {
          error: (authError as Error).message
        }
      });
    }

    // Summary
    const allStepsSuccess = diagnostics.steps.every((step) => (step as { status: string }).status === 'success');
    (diagnostics as { summary?: Record<string, string> }).summary = {
      overall: allStepsSuccess ? "✅ Gmail API Ready" : "❌ Issues Found",
      recommendation: allStepsSuccess
        ? "Gmail API is properly configured and functional"
        : "Please re-authenticate or check Google Cloud Console settings"
    };

    console.log('📊 DIAGNOSTIC RESULTS:', diagnostics);

    return NextResponse.json(diagnostics);

  } catch (error: unknown) {
    console.error("❌ Gmail setup diagnostic failed:", error);
    return NextResponse.json(
      {
        error: (error instanceof Error ? error.message : null) || "Gmail diagnostic failed",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
});