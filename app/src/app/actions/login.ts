'use server';
/**
 * LOGIN WITHOUT SCRIPT (2026-11-02): on Michael's phone the password manager filled and submitted the form before the
 * dev bundle had loaded over Tailscale, so the browser's own submit ran — first as GET with the credentials in the URL,
 * then as a bare POST. A server action behind the form logs the user in whether or not the page's script is running;
 * the fetch path and the native path end in the same place. Errors go back to the page as a message, never credentials.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { loginSchema, loginUser } from '@/services/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({ login: formData.get('login'), password: formData.get('password') });
  let error: string | null = null;
  let to: string | null = null;
  if (!parsed.success) error = 'Username and password required';
  else {
    const h = await headers();
    const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'local').split(',')[0].trim();
    const limit = checkRateLimit(`login:${ip}`, 10, 60 * 1000);
    if (!limit.allowed) error = 'Too many login attempts. Try again shortly.';
    else {
      try {
        to = (await loginUser(parsed.data)).redirect;
      } catch (e) {
        error = e instanceof Error ? e.message : 'Login failed';
      }
    }
  }
  // redirect() throws to unwind — it must run outside the try.
  if (to) redirect(to);
  redirect(`/?error=${encodeURIComponent(error ?? 'Login failed')}`);
}
