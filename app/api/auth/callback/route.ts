import { NextRequest, NextResponse } from 'next/server';
import { saveTokens, saveAccountNumber } from '@/lib/schwab/tokenManager';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?schwab_error=' + encodeURIComponent(error), request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?schwab_error=missing_code', request.url));
  }

  const clientId = process.env.SCHWAB_CLIENT_ID!;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET!;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error('Token exchange failed:', tokenRes.status, text);
    return NextResponse.redirect(new URL('/?schwab_error=token_exchange_failed', request.url));
  }

  const tokens = await tokenRes.json();
  await saveTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);

  // Fetch and cache account number
  try {
    const { schwabFetch } = await import('@/lib/schwab/client');
    const acctRes = await schwabFetch('/trader/v1/accounts?fields=positions');
    if (acctRes.ok) {
      const accounts = await acctRes.json();
      const accountNumber = accounts[0]?.securitiesAccount?.accountNumber ?? accounts[0]?.accountNumber ?? '';
      if (accountNumber) await saveAccountNumber(String(accountNumber));
    }
  } catch (e) {
    console.error('Failed to fetch account number:', e);
  }

  return NextResponse.redirect(new URL('/?connected=true', request.url));
}
