'use server';

import { revalidatePath } from 'next/cache';
import { getLastSyncAt, saveLastSyncAt } from '@/lib/schwab/tokenManager';
import { resolveAccount } from '@/lib/schwab/accounts';
import { schwabFetch } from '@/lib/schwab/client';
import { adaptTransactions } from '@/lib/schwab/adapter';
import { importTrades } from '@/actions/upsertTrades';
import type { Trade } from '@/types/trade';

export interface SyncResult {
  trades: Trade[];
  newCount: number;
  error?: string;
}

export async function syncSchwab(): Promise<SyncResult> {
  try {
    // Resolve the encrypted account hash (required by the transactions endpoint)
    const { hashValue } = await resolveAccount();

    // Date range: since last sync, or 365 days if first sync
    const lastSync = await getLastSyncAt();
    const startDate = lastSync
      ? new Date(lastSync)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const params = new URLSearchParams({
      types: 'TRADE',
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });

    const txRes = await schwabFetch(
      `/trader/v1/accounts/${hashValue}/transactions?${params}`
    );
    if (!txRes.ok) {
      const text = await txRes.text();
      throw new Error(`Transactions fetch failed: ${txRes.status} ${text}`);
    }

    const transactions = await txRes.json();
    const legs = adaptTransactions(Array.isArray(transactions) ? transactions : []);

    if (legs.length === 0) {
      return { trades: [], newCount: 0 };
    }

    // Feed through existing import pipeline (hasPnl=false → FIFO matching)
    const trades = await importTrades(legs, false);
    await saveLastSyncAt(endDate.toISOString());

    revalidatePath('/', 'layout');
    return { trades, newCount: legs.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('syncSchwab error:', msg);
    return { trades: [], newCount: 0, error: msg };
  }
}
