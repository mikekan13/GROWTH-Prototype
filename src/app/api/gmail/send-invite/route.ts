import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
import { GmailAuthService } from "@/lib/gmailAuthService";
import { PlayerInvitationService } from "@/lib/playerInvitations";
import { prisma } from "@/lib/prisma";

export const POST = withAuth(async (session, request: NextRequest) => {
  try {
    const { playerEmail } = await request.json();

    if (!playerEmail) {
      return NextResponse.json(
        { error: "Player email is required" },
        { status: 400 }
      );
    }

    console.log('🎲 Starting Gmail-powered player invitation...');
    console.log('📧 From:', (session as { user: { email: string } }).user.email);
    console.log('📧 To:', playerEmail);

    // Get GM profile
    const gmProfile = await prisma.gMProfile.findUnique({
      where: { userId: (session as { user: { id: string } }).user.id },
      include: { user: true }
    });

    if (!gmProfile) {
      return NextResponse.json(
        { error: "Only GMs can invite players" },
        { status: 403 }
      );
    }

    // Create the invitation in the database first
    const { inviteToken, gmName } = await PlayerInvitationService.invitePlayer({
      gmId: gmProfile.id,
      playerEmail
    });

    console.log('✅ Invitation created in database');
    console.log('🔗 Token:', inviteToken);

    // Prepare email content
    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite?token=${inviteToken}`;
    const subject = `🎲 You're invited to join ${gmName}'s GROWTH RPG campaign!`;

    const textContent = `
Hi there!

${gmName} has invited you to join their GROWTH RPG campaign!

🎲 GROWTH is an innovative tabletop RPG system where your character's power is dynamically managed through KRMA (Karmic Resource Management Architecture).

To accept this invitation:
1. Click the link below (or copy and paste it into your browser)
2. Sign in with your Google account
3. You'll automatically join ${gmName}'s campaign

Invitation Link: ${inviteUrl}

⏰ This invitation expires in 7 days.

Welcome to the GROWTH universe!

Best regards,
The GROWTH RPG Team
`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 8px; margin: 20px 0; }
    .invite-button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
    .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 10px; border-radius: 4px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎲 GROWTH RPG Invitation</h1>
  </div>

  <div class="content">
    <h2>You're Invited!</h2>
    <p><strong>${gmName}</strong> has invited you to join their GROWTH RPG campaign!</p>

    <p>🎲 <strong>GROWTH</strong> is an innovative tabletop RPG system where your character's power is dynamically managed through KRMA (Karmic Resource Management Architecture).</p>

    <h3>How to Join:</h3>
    <ol>
      <li>Click the invitation button below</li>
      <li>Sign in with your Google account</li>
      <li>You'll automatically join ${gmName}'s campaign</li>
    </ol>

    <div style="text-align: center;">
      <a href="${inviteUrl}" class="invite-button">Accept Invitation</a>
    </div>

    <div class="warning">
      ⏰ <strong>Note:</strong> This invitation expires in 7 days.
    </div>

    <p>If the button doesn't work, copy and paste this link into your browser:<br>
    <code>${inviteUrl}</code></p>
  </div>

  <div class="footer">
    <p>Welcome to the GROWTH universe!<br>
    <em>The GROWTH RPG Team</em></p>
  </div>
</body>
</html>
`;

    // Attempt to send email via Gmail API
    console.log('📤 Attempting Gmail API send...');
    const emailResult = await GmailAuthService.sendEmailWithAuth(
      playerEmail,
      subject,
      htmlContent,
      textContent
    );

    if (emailResult.success) {
      console.log('✅ EMAIL SENT SUCCESSFULLY via Gmail API!');
      return NextResponse.json({
        success: true,
        inviteToken,
        emailSent: true,
        messageId: emailResult.messageId,
        message: `Invitation sent successfully to ${playerEmail}! Check their inbox.`
      });
    }

    if (emailResult.needsReauth) {
      console.log('🔐 OAuth re-authentication required');
      return NextResponse.json({
        success: false,
        needsReauth: true,
        authUrl: emailResult.authUrl,
        inviteToken, // Still return the token so invitation exists
        error: "Gmail permission required. Please re-authenticate to send emails.",
        message: "Invitation created but email sending requires re-authentication"
      });
    }

    // Email failed but invitation still exists
    console.log('❌ Email sending failed:', emailResult.error);
    return NextResponse.json({
      success: false,
      inviteToken, // Still return the token
      emailSent: false,
      error: emailResult.error,
      message: `Invitation created but email delivery failed: ${emailResult.error}`
    });

  } catch (error: unknown) {
    console.error("❌ Player invitation failed:", error);
    return NextResponse.json(
      {
        error: (error instanceof Error ? error.message : null) || "Failed to invite player",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
});