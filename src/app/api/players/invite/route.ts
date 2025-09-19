import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/apiHelpers";
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

    // SECURITY: Only allow mikekan13@gmail.com to send invitations during testing
    if (session.user.email !== 'mikekan13@gmail.com') {
      return NextResponse.json(
        { error: "Player invitations are currently restricted to authorized users only" },
        { status: 403 }
      );
    }

    console.log('🎲 Starting Gmail-powered player invitation...');
    console.log('📧 From:', session.user.email);
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
    const _subject = `🎲 You're invited to join ${gmName}'s GROWTH RPG campaign!`;

    const _textContent = `Hi there!

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
The GROWTH RPG Team`;

    const _htmlContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 8px; margin: 20px 0; }
    .invite-button { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
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
    <div style="text-align: center;">
      <a href="${inviteUrl}" class="invite-button">Accept Invitation</a>
    </div>
    <div class="warning">⏰ <strong>Note:</strong> This invitation expires in 7 days.</div>
    <p>If the button doesn't work, copy and paste this link:<br><code>${inviteUrl}</code></p>
  </div>
</body>
</html>`;

    // Return manual invite link instead of sending email
    console.log('🔗 Creating manual invite link for testing...');
    console.log('📋 Invite URL:', inviteUrl);

    return NextResponse.json({
      success: true,
      inviteToken,
      inviteUrl,
      playerEmail,
      gmName,
      message: `✅ Invitation created! Copy the invite link below and send it manually to ${playerEmail}`,
      instructions: "Copy the invite link and send it to your player via your preferred method (text, Discord, etc.)"
    });
  } catch (error: unknown) {
    console.error("Failed to invite player:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : null) || "Failed to invite player" },
      { status: 400 }
    );
  }
});