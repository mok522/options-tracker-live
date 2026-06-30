// Stateless app-login session helpers. Web Crypto only, so the same code runs in
// edge middleware and Node route handlers. No session store — the cookie carries
// a signed expiry.

const COOKIE_NAME = 'ott_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

// Length-checked constant-time string compare (avoids early-exit timing leak).
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// "<base64url(expiryMs)>.<base64url(HMAC(expiryMs))>"
export async function signSession(expiryMs: number, secret: string): Promise<string> {
  const payload = String(expiryMs);
  const sig = b64url(await hmac(payload, secret));
  return `${b64url(new TextEncoder().encode(payload))}.${sig}`;
}

export async function verifySession(value: string | undefined, secret: string): Promise<boolean> {
  if (!value || !secret) return false;
  const [payloadB64, sig] = value.split('.');
  if (!payloadB64 || !sig) return false;
  let payload: string;
  try {
    payload = new TextDecoder().decode(b64urlToBytes(payloadB64));
  } catch {
    return false;
  }
  const expected = b64url(await hmac(payload, secret));
  if (!constantTimeEqual(sig, expected)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function isAuthDisabled(): boolean {
  return process.env.DISABLE_APP_AUTH === 'true';
}

export const APP_AUTH = { COOKIE_NAME, SESSION_TTL_MS };
