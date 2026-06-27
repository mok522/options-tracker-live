'use server';

import { isConnected } from '@/lib/schwab/tokenManager';
import { schwabFetch } from '@/lib/schwab/client';

export interface TestResult {
  ok: boolean;
  message: string;
}

/**
 * Lightweight, live connectivity check: validates the stored token and that the
 * Schwab API is reachable by hitting /accounts/accountNumbers (no data sync).
 * Surfaces the real status/error so connection problems are diagnosable.
 */
export async function testSchwabConnection(): Promise<TestResult> {
  try {
    if (!(await isConnected())) {
      return { ok: false, message: 'Not connected — click "Connect to Schwab" first.' };
    }

    const res = await schwabFetch('/trader/v1/accounts/accountNumbers');
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `Schwab API error ${res.status}: ${text.slice(0, 200) || res.statusText}` };
    }

    const list = (await res.json()) as Array<{ accountNumber?: string }>;
    const count = Array.isArray(list) ? list.length : 0;
    if (count === 0) {
      return { ok: false, message: 'Connected, but Schwab returned no accounts.' };
    }

    const last4 = String(list[0]?.accountNumber ?? '').slice(-4);
    const masked = last4 ? `••••${last4}` : 'account';
    return {
      ok: true,
      message: `Connection OK — token valid, ${count} account${count === 1 ? '' : 's'} (${masked}).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}
