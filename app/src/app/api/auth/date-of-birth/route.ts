import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setDateOfBirth, setDateOfBirthSchema } from '@/services/auth';

/** One-time DOB for accounts created before it was required (2026-10-12). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { dateOfBirth } = setDateOfBirthSchema.parse(body);
    const result = await setDateOfBirth(session.user.id, dateOfBirth);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
