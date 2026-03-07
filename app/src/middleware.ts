import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/trailblazer', '/watcher', '/terminal'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session_token')?.value;

  // Protect dashboard routes
  if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
    if (!sessionToken) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Redirect logged-in users away from home
  if (pathname === '/' && sessionToken) {
    // Let the page component handle the redirect based on role
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/trailblazer/:path*', '/watcher/:path*', '/terminal/:path*'],
};
