import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { loginSchema, loginUser } from '@/services/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const result = await loginUser(input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
