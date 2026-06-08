'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { rawTrades, importHistory } from '@/db/schema';
import { deduplicateTrades } from '@/lib/parser/deduplicator';
import type { RawTrade, ImportResult } from '@/types';

export async function importTrades(
  newTrades: RawTrade[],
  fileName: string
): Promise<ImportResult> {
  // Fetch existing dedup keys from DB
  const existing = await db.select({ dedupKey: rawTrades.dedupKey }).from(rawTrades);

  // Build stubs with just dedupKey populated for dedup comparison
  const existingStubs = existing.map((row) => ({ dedupKey: row.dedupKey } as RawTrade));

  // Deduplicate
  const { newTrades: toInsert, skipped } = deduplicateTrades(newTrades, existingStubs);

  // Insert new trades one at a time (Turso libsql batch-values limitation)
  const now = new Date().toISOString();
  for (const trade of toInsert) {
    await db
      .insert(rawTrades)
      .values({
        dedupKey:   trade.dedupKey,
        execTime:   trade.execTime,
        spread:     trade.spread,
        side:       trade.side,
        qty:        trade.qty,
        posEffect:  trade.posEffect,
        symbol:     trade.symbol,
        underlying: trade.underlying,
        expiration: trade.expiration,
        strike:     trade.strike,
        optionType: trade.optionType,
        price:      trade.price,
        netPrice:   trade.netPrice,
        commission: trade.commission,
        importedAt: now,
      })
      .onConflictDoNothing();
  }

  // Record import history
  await db.insert(importHistory).values({
    id:           crypto.randomUUID(),
    fileName,
    importedAt:   now,
    rowCount:     toInsert.length,
    dedupSkipped: skipped,
  });

  // Invalidate all RSC caches
  revalidatePath('/', 'layout');

  return { inserted: toInsert.length, skipped, warnings: [] };
}
