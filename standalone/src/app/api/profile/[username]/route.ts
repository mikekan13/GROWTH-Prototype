import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { getPublicProfile } from '@/services/profile';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const profile = await getPublicProfile(username);
    return NextResponse.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
