import nodemailer from 'nodemailer';
import { getGoogleAuth } from '../services/google';

export interface NodemailerEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class NodemailerService {
  /**
   * Send email via Nodemailer using OAuth2
   */
  static async sendEmail(message: NodemailerEmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log('📧 Attempting to send email via Nodemailer with OAuth2');
      
      // Get OAuth2 client
      const oauth2Client = await getGoogleAuth();
      
      // Get access token
      const tokenInfo = await oauth2Client.getAccessToken();
      const accessToken = tokenInfo.token;
      
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }
      
      console.log('✅ Got access token for Nodemailer');
      
      // Create transporter
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.GMAIL_EMAIL || 'mikekan13@gmail.com',
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: oauth2Client.credentials.refresh_token,
          accessToken: accessToken,
        },
      });
      
      console.log('🚀 Sending email with Nodemailer...');
      
      // Send email
      const info = await transporter.sendMail({
        from: `"GROWTH RPG System" <${process.env.GMAIL_EMAIL || 'mikekan13@gmail.com'}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      
      console.log('✅ Email sent successfully via Nodemailer!', info.messageId);
      
      return {
        success: true,
        messageId: info.messageId,
      };
      
    } catch (error: unknown) {
      const err = error as Error & { code?: string; command?: string; response?: string };
      console.error('❌ Nodemailer Error:', {
        message: err?.message,
        code: err?.code,
        command: err?.command,
        response: err?.response,
        stack: err?.stack?.split('\n')[0],
      });
      
      return {
        success: false,
        error: error?.message || 'Unknown nodemailer error',
      };
    }
  }
}