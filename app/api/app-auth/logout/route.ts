import { NextResponse } from 'next/server';
import { APP_AUTH } from '@/lib/appAuth';

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(APP_AUTH.COOKIE_NAME, '', {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0,
  });
  return res;
}
