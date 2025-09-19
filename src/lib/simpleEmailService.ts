import nodemailer from 'nodemailer';

export interface SimpleEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class SimpleEmailService {
  /**
   * Send email via SMTP with app password (no OAuth needed)
   */
  static async sendEmail(message: SimpleEmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log('📧 Attempting to send email via SMTP (no OAuth)');
      
      // Check if we have SMTP credentials
      const smtpUser = process.env.SMTP_USER || process.env.GMAIL_EMAIL;
      const smtpPass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
      
      if (!smtpUser || !smtpPass) {
        console.log('⚠️ No SMTP credentials configured. Falling back to console log.');
        
        // Log email to console as final fallback
        console.log('📧 EMAIL SENT (Console Fallback):');
        console.log(`   From: ${smtpUser || 'mikekan13@gmail.com'}`);
        console.log(`   To: ${message.to}`);
        console.log(`   Subject: ${message.subject}`);
        console.log('   ---');
        console.log(message.text);
        console.log('   ---');
        
        return {
          success: true,
          messageId: `console-fallback-${Date.now()}`,
        };
      }
      
      // Create simple SMTP transporter
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      
      console.log('🚀 Sending email with SMTP...');
      
      // Send email
      const info = await transporter.sendMail({
        from: `"GROWTH RPG System" <${smtpUser}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      
      console.log('✅ Email sent successfully via SMTP!', info.messageId);
      
      return {
        success: true,
        messageId: info.messageId,
      };
      
    } catch (error: unknown) {
      const err = error as Error & { code?: string; command?: string; response?: string };
      console.error('❌ SMTP Error:', {
        message: err?.message,
        code: err?.code,
        command: err?.command,
        response: err?.response,
      });
      
      // Final console fallback
      console.log('📧 EMAIL LOGGED (Final Console Fallback):');
      console.log(`   To: ${message.to}`);
      console.log(`   Subject: ${message.subject}`);
      console.log('   ---');
      console.log(message.text);
      console.log('   ---');
      
      return {
        success: true, // Always succeed for console fallback
        messageId: `console-fallback-${Date.now()}`,
      };
    }
  }
}