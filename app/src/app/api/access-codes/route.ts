import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listAccessCodes, generateAccessCodes, generateCodesSchema } from '@/services/access-code';

export async function GET() {
  try {
    const session = await requireAuth();
    const codes = await listAccessCodes(session.user.role);
    return NextResponse.json({ codes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = generateCodesSchema.parse(body);
    const codes = await generateAccessCodes(session.user.role, input);
    return NextResponse.json({ codes }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
