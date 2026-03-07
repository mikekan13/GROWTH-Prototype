import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { redeemAccessCode, redeemCodeSchema } from '@/services/access-code';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { code } = redeemCodeSchema.parse(body);
    const result = await redeemAccessCode(session.user.id, code);
    return NextResponse.json({ message: `Access granted: ${result.role}`, role: result.role });
  } catch (error) {
    return errorResponse(error);
  }
}
