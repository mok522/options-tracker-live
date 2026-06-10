'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trades as tradesTable } from '@/db/schema';
import type { Trade } from '@/types/trade';

// Additive import strategy:
//   1. Delete open positions — they may have closed, expired, or changed since last import.
//   2. Insert all incoming trades, skipping any whose ID already exists (idempotent for closed trades).
// Result: closed/expired trades accumulate across imports; open positions are refreshed each time.
export async function upsertTrades(incoming: Trade[]): Promise<void> {
  if (!incoming.length) return;
  await db.delete(tradesTable).where(eq(tradesTable.status, 'Open'));
  for (const t of incoming) {
    await db.insert(tradesTable).values({
      id: t.id!, sym: t.sym, strat: t.strat, side: t.side,
      qty: t.qty, strike: t.strike, exp: t.exp, fill: t.fill,
      comm: t.comm ?? null, pl: t.pl, status: t.status,
      date: t.date ?? '',
    }).onConflictDoNothing();
  }
  revalidatePath('/');
}
