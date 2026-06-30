import { NextResponse } from 'next/server';
import { signSession, constantTimeEqual, APP_AUTH } from '@/lib/appAuth';

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');

  const expected = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  // Fail closed: missing secrets ⇒ no one gets in.
  const ok = !!expected && !!secret && constantTimeEqual(password, expected);

  if (!ok) {
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }

  const value = await signSession(Date.now() + APP_AUTH.SESSION_TTL_MS, secret!);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(APP_AUTH.COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(APP_AUTH.SESSION_TTL_MS / 1000),
  });
  return res;
}
