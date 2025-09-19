import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";

export interface GmailAuthResult {
  success: boolean;
  needsReauth: boolean;
  authUrl?: string;
  error?: string;
  gmail?: unknown;
}

export class GmailAuthService {
  /**
   * Get Gmail API client with automatic re-auth handling
   */
  static async getGmailClient(): Promise<GmailAuthResult> {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user) {
        return {
          success: false,
          needsReauth: true,
          error: "No authenticated session"
        };
      }

      // Get OAuth account
      const account = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: "google",
        },
      });

      if (!account?.access_token) {
        return {
          success: false,
          needsReauth: true,
          error: "No OAuth token found"
        };
      }

      // Set up OAuth client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
      );

      oauth2Client.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token,
      });

      // Test Gmail API access
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      try {
        // Test with a simple API call
        await gmail.users.getProfile({ userId: 'me' });

        // If we get here, OAuth is working
        return {
          success: true,
          needsReauth: false,
          gmail
        };

      } catch (apiError: unknown) {
        console.error('Gmail API test failed:', apiError.message);

        if (apiError.code === 403 && apiError.message?.includes('insufficient authentication scopes')) {
          // Need to re-authenticate with proper scopes
          return {
            success: false,
            needsReauth: true,
            authUrl: await this.generateReAuthUrl(session.user.id),
            error: "Gmail scope not granted - re-authentication required"
          };
        }

        if (apiError.code === 401) {
          // Token expired or invalid, try to refresh
          try {
            await oauth2Client.refreshAccessToken();
            return {
              success: true,
              needsReauth: false,
              gmail
            };
          } catch (_refreshError) {
            return {
              success: false,
              needsReauth: true,
              authUrl: await this.generateReAuthUrl(session.user.id),
              error: "Token refresh failed - re-authentication required"
            };
          }
        }

        return {
          success: false,
          needsReauth: false,
          error: apiError.message
        };
      }

    } catch (error: unknown) {
      return {
        success: false,
        needsReauth: false,
        error: error.message
      };
    }
  }

  /**
   * Generate re-authentication URL with forced consent
   */
  private static async generateReAuthUrl(userId: string): Promise<string> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
    );

    const scopes = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/gmail.send'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen
      state: `reauth_${userId}_${Date.now()}`
    });

    return authUrl;
  }

  /**
   * Send email via Gmail API with automatic re-auth
   */
  static async sendEmailWithAuth(to: string, subject: string, htmlContent: string, textContent: string): Promise<{
    success: boolean;
    messageId?: string;
    needsReauth?: boolean;
    authUrl?: string;
    error?: string;
  }> {
    console.log('📧 Attempting Gmail send with auto-reauth...');

    const authResult = await this.getGmailClient();

    if (!authResult.success) {
      if (authResult.needsReauth) {
        return {
          success: false,
          needsReauth: true,
          authUrl: authResult.authUrl,
          error: authResult.error
        };
      }
      return {
        success: false,
        error: authResult.error
      };
    }

    const gmail = authResult.gmail;

    try {
      // Create email in RFC 2822 format
      const fromEmail = process.env.GMAIL_EMAIL || 'noreply@gmail.com';
      const emailLines = [
        `From: "GROWTH RPG System" <${fromEmail}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="boundary123"`,
        ``,
        `--boundary123`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        textContent,
        ``,
        `--boundary123`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        htmlContent,
        ``,
        `--boundary123--`
      ];

      const email = emailLines.join('\r\n');
      const encodedEmail = Buffer.from(email).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
        },
      });

      console.log('✅ Gmail API email sent successfully!', response.data.id);

      return {
        success: true,
        messageId: response.data.id || 'gmail-sent'
      };

    } catch (sendError: unknown) {
      console.error('❌ Gmail API send failed:', sendError.message);

      if (sendError.code === 403 && sendError.message?.includes('insufficient authentication scopes')) {
        return {
          success: false,
          needsReauth: true,
          authUrl: await this.generateReAuthUrl((await getServerSession(authOptions))!.user.id),
          error: "Gmail send permission required - please re-authenticate"
        };
      }

      return {
        success: false,
        error: sendError.message
      };
    }
  }
}