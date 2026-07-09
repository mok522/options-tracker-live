import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, isAuthDisabled, APP_AUTH } from '@/lib/appAuth';

// Reachable without a session. Everything else requires a valid cookie.
// /api/cron/snapshot is public here but enforces CRON_SECRET itself.
const PUBLIC_PATHS = ['/login', '/api/app-auth/login', '/api/cron/snapshot'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isAuthDisabled() || PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET ?? '';
  const ok = await verifySession(req.cookies.get(APP_AUTH.COOKIE_NAME)?.value, secret);
  if (ok) return NextResponse.next();

  // Unauthenticated API calls get a clean 401 instead of an HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next static assets and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
