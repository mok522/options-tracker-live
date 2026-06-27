'use server';

import { revalidatePath } from 'next/cache';
import { saveLastSyncAt } from '@/lib/schwab/tokenManager';
import { resolveAccount } from '@/lib/schwab/accounts';
import { schwabFetch } from '@/lib/schwab/client';
import { adaptTransactions } from '@/lib/schwab/adapter';
import { importTrades } from '@/actions/upsertTrades';
import type { Trade } from '@/types/trade';
import type { SchwabTransaction } from '@/lib/schwab/adapter';

export interface SyncResult {
  trades: Trade[];
  newCount: number;
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Schwab caps each /transactions request to a span of < 1 year, so we page
// backwards in ~1-year windows (minus a day for safety).
const WINDOW_MS = 364 * DAY_MS;
// How far back to attempt. Schwab's API only retains a limited history (often
// ~1 year), so older windows typically return empty or are rejected — we stop
// paging once that happens. This ceiling just bounds the number of requests.
const MAX_LOOKBACK_YEARS = 6;

/**
 * Pull TRADE transactions across the full available history by paging backwards
 * in <1-year windows. Tolerates older windows that Schwab rejects/empties
 * (its retention horizon) by stopping once we hit one with no data, as long as
 * we've already collected some.
 */
async function fetchAllTradeTransactions(hashValue: string): Promise<SchwabTransaction[]> {
  const floor = Date.now() - MAX_LOOKBACK_YEARS * 365 * DAY_MS;
  const all: SchwabTransaction[] = [];
  let windowEnd = Date.now();

  while (windowEnd > floor) {
    const windowStart = Math.max(floor, windowEnd - WINDOW_MS);
    const params = new URLSearchParams({
      types: 'TRADE',
      startDate: new Date(windowStart).toISOString(),
      endDate: new Date(windowEnd).toISOString(),
    });

    const res = await schwabFetch(`/trader/v1/accounts/${hashValue}/transactions?${params}`);
    if (!res.ok) {
      // First window failing is a real error; failures on older windows just
      // mean we've gone past Schwab's retention — stop there with what we have.
      if (all.length === 0) {
        const text = await res.text();
        throw new Error(`Transactions fetch failed: ${res.status} ${text}`);
      }
      break;
    }

    const tx = await res.json();
    const batch = Array.isArray(tx) ? (tx as SchwabTransaction[]) : [];
    all.push(...batch);

    windowEnd = windowStart - 1;
  }

  return all;
}

export async function syncSchwab(): Promise<SyncResult> {
  try {
    // Resolve the encrypted account hash (required by the transactions endpoint)
    const { hashValue } = await resolveAccount();

    // Pull the full available history (not just since last sync); dedup in the
    // import pipeline keeps re-syncs idempotent.
    const transactions = await fetchAllTradeTransactions(hashValue);
    const legs = adaptTransactions(transactions);

    if (legs.length === 0) {
      await saveLastSyncAt(new Date().toISOString());
      return { trades: [], newCount: 0 };
    }

    // Feed through existing import pipeline (hasPnl=false → FIFO matching)
    const trades = await importTrades(legs, false);
    await saveLastSyncAt(new Date().toISOString());

    revalidatePath('/', 'layout');
    return { trades, newCount: legs.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('syncSchwab error:', msg);
    return { trades: [], newCount: 0, error: msg };
  }
}
