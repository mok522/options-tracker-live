import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Schwab credentials not configured' }, { status: 500 });
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'readonly',
  });

  const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?${params}`;
  return NextResponse.redirect(authUrl);
}
