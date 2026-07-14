'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { trades as tradesTable, settings } from '@/db/schema';
import { recomputePositions, legKey, type PersistedLeg } from '@/lib/csvParser';
import type { Trade } from '@/types/trade';

const RAW_LEGS_KEY = 'raw_legs';

async function loadLegs(): Promise<PersistedLeg[]> {
  const row = await db.select().from(settings).where(eq(settings.key, RAW_LEGS_KEY));
  if (!row[0]) return [];
  try {
    return JSON.parse(row[0].value) as PersistedLeg[];
  } catch {
    return [];
  }
}

async function saveLegs(legs: PersistedLeg[]): Promise<void> {
  const value = JSON.stringify(legs);
  await db
    .insert(settings)
    .values({ key: RAW_LEGS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

// Multi-file import:
//   1. Merge the new file's raw legs into the persisted leg store (deduped).
//   2. Recompute ALL positions from the full union of legs — so trades that
//      open in one file and close in another are matched and realized.
//   3. Rebuild the trades table from the recomputed set.
// Returns the recomputed trades so the client can render the full set.
export async function importTrades(legs: Trade[], hasPnl: boolean): Promise<Trade[]> {
  if (!legs.length) return loadLegs().then(recomputePositions);

  // 1. Merge new legs into the persisted store (idempotent on re-import).
  const persisted = await loadLegs();
  const seen = new Set(persisted.map(legKey));
  for (const leg of legs) {
    const k = legKey(leg);
    if (!seen.has(k)) {
      seen.add(k);
      persisted.push({ ...leg, hasPnl });
    }
  }
  await saveLegs(persisted);

  // 2. Recompute positions across every imported file.
  const recomputed = recomputePositions(persisted);

  // 3. Rebuild the trades table from scratch (source of truth = raw legs).
  await db.delete(tradesTable);
  for (const t of recomputed) {
    await db
      .insert(tradesTable)
      .values({
        id: t.id!, sym: t.sym, strat: t.strat, side: t.side,
        qty: t.qty, strike: t.strike, exp: t.exp, fill: t.fill,
        comm: t.comm ?? null, pl: t.pl, status: t.status,
        date: t.date ?? '',
        assetType: t.assetType ?? 'OPTION',
        openDate: t.openDate ?? '',
      })
      .onConflictDoNothing();
  }

  revalidatePath('/');
  return recomputed;
}
