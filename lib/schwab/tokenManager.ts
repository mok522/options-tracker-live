import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { settings } from '@/db/schema';
import { fetchWithTimeout } from './http';

const TOKENS_KEY = 'schwab_tokens';
const ACCOUNT_KEY = 'schwab_account_number';
const ACCOUNT_HASH_KEY = 'schwab_account_hash';

interface SchwabTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms since epoch
}

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

export async function getTokens(): Promise<SchwabTokens | null> {
  const raw = await getSetting(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SchwabTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(
  access_token: string,
  refresh_token: string,
  expires_in: number
): Promise<void> {
  const tokens: SchwabTokens = {
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  };
  await setSetting(TOKENS_KEY, JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    deleteSetting(TOKENS_KEY),
    deleteSetting(ACCOUNT_KEY),
    deleteSetting(ACCOUNT_HASH_KEY),
    deleteSetting('last_sync_at'),
  ]);
}

export async function isConnected(): Promise<boolean> {
  const tokens = await getTokens();
  return tokens !== null;
}

export async function getValidToken(): Promise<string> {
  const tokens = await getTokens();
  if (!tokens) throw new Error('Not connected to Schwab');

  // Refresh if expiring within 5 minutes
  if (tokens.expires_at - Date.now() > 5 * 60 * 1000) {
    return tokens.access_token;
  }

  const clientId = process.env.SCHWAB_CLIENT_ID!;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetchWithTimeout('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  await saveTokens(data.access_token, data.refresh_token ?? tokens.refresh_token, data.expires_in);
  return data.access_token;
}

export async function getCachedAccountNumber(): Promise<string | null> {
  return getSetting(ACCOUNT_KEY);
}

export async function saveAccountNumber(accountNumber: string): Promise<void> {
  await setSetting(ACCOUNT_KEY, accountNumber);
}

/** The encrypted account hash Schwab requires in /accounts/{hash}/... paths. */
export async function getCachedAccountHash(): Promise<string | null> {
  return getSetting(ACCOUNT_HASH_KEY);
}

export async function saveAccountHash(hash: string): Promise<void> {
  await setSetting(ACCOUNT_HASH_KEY, hash);
}

export async function getLastSyncAt(): Promise<string | null> {
  return getSetting('last_sync_at');
}

export async function saveLastSyncAt(iso: string): Promise<void> {
  await setSetting('last_sync_at', iso);
}
