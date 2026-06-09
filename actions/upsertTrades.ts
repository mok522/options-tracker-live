'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { trades as tradesTable } from '@/db/schema';
import type { Trade } from '@/types/trade';

// Replace all trades on each import. The TOS account statement is cumulative,
// so the latest CSV always reflects the complete state of the account.
export async function upsertTrades(incoming: Trade[]): Promise<void> {
  if (!incoming.length) return;
  await db.delete(tradesTable);
  for (const t of incoming) {
    await db.insert(tradesTable).values({
      id: t.id!, sym: t.sym, strat: t.strat, side: t.side,
      qty: t.qty, strike: t.strike, exp: t.exp, fill: t.fill,
      comm: t.comm ?? null, pl: t.pl, status: t.status,
      date: t.date ?? '',
    });
  }
  revalidatePath('/');
}
