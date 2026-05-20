/**
 * Email Provider — pluggable transactional mail interface.
 *
 * Production default (locked 2026-05-19): **Resend**. Chosen for Next.js fit,
 * React Email template support, simplest integration, and free-tier coverage
 * for beta. Postmark stays as a fallback consideration if deliverability
 * becomes a problem at scale.
 *
 * Dev / unset env: console provider. Set `EMAIL_PROVIDER=resend` plus
 * `RESEND_API_KEY` to enable real delivery.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  textBody: string;
  /** Optional HTML body. Falls back to text in providers without HTML support. */
  htmlBody?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const id = `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // eslint-disable-next-line no-console
    console.log(
      [
        '────────── EMAIL (console provider) ──────────',
        `id:      ${id}`,
        `to:      ${message.to}`,
        `subject: ${message.subject}`,
        '',
        message.textBody,
        '──────────────────────────────────────────────',
      ].join('\n'),
    );
    return { id };
  }
}

/**
 * Resend HTTP API provider. Implemented against the REST API directly so the
 * `resend` npm package is not a hard dependency for the rest of the app.
 * Failure mode: throws — callers (route handlers) translate to a 500.
 */
class ResendEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromAddress: string;
  constructor(apiKey: string, fromAddress: string) {
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
  }
  async send(message: EmailMessage) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [message.to],
        subject: message.subject,
        text: message.textBody,
        ...(message.htmlBody ? { html: message.htmlBody } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend API error ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const kind = (typeof process !== 'undefined' && process.env.EMAIL_PROVIDER) || 'console';
  switch (kind) {
    case 'resend': {
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM ?? 'GRO.WTH <onboarding@resend.dev>';
      if (!apiKey) {
        // eslint-disable-next-line no-console
        console.warn('[email] EMAIL_PROVIDER=resend but RESEND_API_KEY missing — falling back to console.');
        provider = new ConsoleEmailProvider();
      } else {
        provider = new ResendEmailProvider(apiKey, from);
      }
      return provider;
    }
    // Future providers fall through to console until their SDK is wired.
    case 'postmark':
    case 'ses':
    case 'console':
    default:
      provider = new ConsoleEmailProvider();
      return provider;
  }
}

export async function sendEmail(message: EmailMessage): Promise<{ id: string }> {
  return getEmailProvider().send(message);
}
