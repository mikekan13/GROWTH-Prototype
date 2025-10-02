/**
 * Session Check API
 * Returns current session user or null
 */

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessionManager';

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json({ user: null });
  }
}
