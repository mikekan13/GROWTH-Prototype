import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { registerSchema, registerUser } from '@/services/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = registerSchema.parse(body);
    const result = await registerUser(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
