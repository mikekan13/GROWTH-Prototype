import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { checkRateLimit, getClientKey } from '@/lib/rate-limit';
import { loginSchema, loginUser } from '@/services/auth';

export async function POST(request: NextRequest) {
  try {
    // 10 attempts per minute per IP — generous enough for typos, tight
    // enough to slow brute force.
    const ipKey = getClientKey(request);
    const limit = checkRateLimit(`login:${ipKey}`, 10, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const body = await request.json();
    const input = loginSchema.parse(body);
    const result = await loginUser(input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
