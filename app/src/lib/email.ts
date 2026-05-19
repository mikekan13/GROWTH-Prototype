/**
 * Email Provider — pluggable transactional mail interface.
 *
 * In dev this logs to the console so flows can be exercised end-to-end
 * without an external service. Production should swap implementation by
 * setting EMAIL_PROVIDER=resend|postmark|ses and providing the
 * corresponding API key. See M6d in ROADMAP.md.
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

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const kind = (typeof process !== 'undefined' && process.env.EMAIL_PROVIDER) || 'console';
  switch (kind) {
    // Stub for future providers — currently all fall through to console
    // until the real client SDKs are added in production rollout.
    case 'resend':
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
