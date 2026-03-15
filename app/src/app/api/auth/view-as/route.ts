import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

const VALID_ROLES = ['TRAILBLAZER', 'WATCHER', 'ADMIN'] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { role } = await request.json();

    // Clear view-as mode
    if (!role || role === 'ADMIN') {
      const response = NextResponse.json({ viewAs: null });
      response.cookies.set('view_as_role', '', { path: '/', maxAge: 0 });
      return response;
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const response = NextResponse.json({ viewAs: role });
    response.cookies.set('view_as_role', role, {
      path: '/',
      httpOnly: false, // Client-side readable for DashboardShell
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const session = await requireAuth();

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    return NextResponse.json({ role: session.user.role });
  } catch (error) {
    return errorResponse(error);
  }
}
