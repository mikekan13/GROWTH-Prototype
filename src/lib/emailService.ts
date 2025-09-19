import { promises as fs } from 'fs';
import { join } from 'path';
import { getGoogleAuth } from '../services/google';
import { NodemailerService } from './nodemailerService';
import { SimpleEmailService } from './simpleEmailService';

export interface EmailMessage {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export class EmailService {
  private static readonly EMAIL_LOG_FILE = join(process.cwd(), 'email-logs.txt');
  
  /**
   * Send email via Gmail API using existing Google OAuth
   */
  private static async sendViaGmailAPI(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
    try {
      const { google } = await import('googleapis');
      const auth = await getGoogleAuth();
      const gmail = google.gmail({ version: 'v1', auth });

      // Create the email message in RFC 2822 format
      const fromEmail = process.env.GMAIL_EMAIL || 'noreply@gmail.com';
      const emailLines = [
        `From: "GROWTH RPG System" <${fromEmail}>`,
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="boundary123"`,
        ``,
        `--boundary123`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        message.textContent,
        ``,
        `--boundary123`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        message.htmlContent,
        ``,
        `--boundary123--`
      ];
      
      const email = emailLines.join('\r\n');
      const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
      });

      return { 
        success: true, 
        messageId: response.data.id || 'gmail-api-sent' 
      };
    } catch (error: unknown) {
      const err = error as Error & { code?: string; status?: number; errors?: unknown; response?: { data?: unknown } };
      console.error('❌ Gmail API Error Details:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        errors: err?.errors,
        response: err?.response?.data
      });
      
      // Provide better error message for scope issues
      if (err?.message?.includes('insufficient authentication scopes') ||
          err?.message?.includes('Request had insufficient authentication scopes')) {
        console.error('🔐 Scope Error: The OAuth token does not have Gmail send permission');
        throw new Error('Gmail sending permission not granted. The OAuth token needs the gmail.send scope.');
      }
      
      throw error;
    }
  }
  
  /**
   * Send email via Nodemailer as fallback
   */
  private static async sendViaNodemailer(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
    console.log('🔄 Trying Nodemailer as alternative to Gmail API...');
    
    const result = await NodemailerService.sendEmail({
      to: message.to,
      subject: message.subject,
      html: message.htmlContent,
      text: message.textContent,
    });
    
    if (result.success) {
      console.log('✅ Email sent successfully via Nodemailer!', result.messageId);
      return { success: true, messageId: result.messageId };
    } else {
      console.error('❌ Nodemailer also failed:', result.error);
      throw new Error(result.error || 'Nodemailer failed');
    }
  }

  /**
   * Send email via Simple SMTP as final fallback
   */
  private static async sendViaSimpleSMTP(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
    console.log('🔄 Trying Simple SMTP as final fallback...');
    
    const result = await SimpleEmailService.sendEmail({
      to: message.to,
      subject: message.subject,
      html: message.htmlContent,
      text: message.textContent,
    });
    
    if (result.success) {
      console.log('✅ Email sent successfully via Simple SMTP!', result.messageId);
      return { success: true, messageId: result.messageId };
    } else {
      console.error('❌ Simple SMTP also failed:', result.error);
      throw new Error(result.error || 'Simple SMTP failed');
    }
  }

  /**
   * Send email - supports both development logging and real Gmail sending
   */
  static async sendEmail(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
    const emailMode = process.env.EMAIL_MODE || 'dev';
    
    try {
      if (emailMode === 'gmail') {
        // Try Gmail API first
        console.log(`📧 SENDING REAL EMAIL via Gmail API to: ${message.to}`);
        
        try {
          const result = await this.sendViaGmailAPI(message);
          
          if (result.success) {
            console.log(`✅ Email sent successfully via Gmail API! Message ID: ${result.messageId}`);
            return result;
          }
        } catch (gmailError: unknown) {
          console.log('⚠️ Gmail API failed, trying Nodemailer as fallback...');
          console.error('Gmail API Error:', (gmailError as Error)?.message);
          
          // Try Nodemailer as fallback
          try {
            return await this.sendViaNodemailer(message);
          } catch (nodemailerError: unknown) {
            console.log('⚠️ Nodemailer also failed, trying Simple SMTP as final fallback...');
            console.error('Nodemailer Error:', (nodemailerError as Error)?.message);
            
            // Try Simple SMTP as final fallback
            return await this.sendViaSimpleSMTP(message);
          }
        }
        
        // If Gmail API didn't throw but returned failure, try Nodemailer
        console.log('⚠️ Gmail API returned failure, trying Nodemailer as fallback...');
        try {
          return await this.sendViaNodemailer(message);
        } catch (nodemailerError: unknown) {
          console.log('⚠️ Nodemailer also failed, trying Simple SMTP as final fallback...');
          console.error('Nodemailer Error:', (nodemailerError as Error)?.message);
          
          // Try Simple SMTP as final fallback
          return await this.sendViaSimpleSMTP(message);
        }
      } else {
        // Development mode: Log email to console and file
        console.log('📧 EMAIL LOGGED (Development Mode):');
        console.log(`   To: ${message.to}`);
        console.log(`   Subject: ${message.subject}`);
        console.log(`   Content: ${message.textContent}`);
        console.log('   ---');
        
        // Log to file for debugging
        const logEntry = `
[${new Date().toISOString()}] EMAIL LOGGED (DEV MODE)
To: ${message.to}
Subject: ${message.subject}
Text Content:
${message.textContent}

HTML Content:
${message.htmlContent}

=====================================
`;
        
        await fs.appendFile(this.EMAIL_LOG_FILE, logEntry);
        
        return { 
          success: true, 
          messageId: `dev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` 
        };
      }
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return { success: false };
    }
  }

  /**
   * Send player invitation email
   */
  static async sendPlayerInvitation(
    playerEmail: string, 
    gmName: string,
    inviteToken: string,
    campaignName?: string
  ): Promise<{ success: boolean; messageId?: string }> {
    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite?token=${inviteToken}`;
    
    const subject = `🎲 You're invited to join ${gmName}'s GROWTH RPG campaign!`;
    
    const textContent = `
Hi there!

${gmName} has invited you to join their GROWTH RPG campaign${campaignName ? ` "${campaignName}"` : ''}!

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
    <p><strong>${gmName}</strong> has invited you to join their GROWTH RPG campaign${campaignName ? ` <strong>"${campaignName}"</strong>` : ''}!</p>
    
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

    return await this.sendEmail({
      to: playerEmail,
      subject,
      textContent,
      htmlContent
    });
  }

  /**
   * Get recent email logs for debugging
   */
  static async getRecentEmailLogs(lines: number = 50): Promise<string> {
    try {
      const content = await fs.readFile(this.EMAIL_LOG_FILE, 'utf-8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).join('\n');
    } catch (_error) {
      return 'No email logs found.';
    }
  }
}