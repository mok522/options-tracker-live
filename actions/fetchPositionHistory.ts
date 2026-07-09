'use server';

import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { positionSnapshots } from '@/db/schema';
import type { SnapshotPoint } from '@/lib/positionHistory';

// All daily snapshots for one position, oldest first. Empty array when the
// position has no history yet (or on any failure — the panel shows its
// empty state either way).
export async function getPositionHistory(positionKey: string): Promise<SnapshotPoint[]> {
  try {
    const rows = await db
      .select()
      .from(positionSnapshots)
      .where(eq(positionSnapshots.positionKey, positionKey))
      .orderBy(asc(positionSnapshots.date));
    return rows.map((r) => ({ date: r.date, unrealizedPl: r.unrealizedPl, mark: r.mark, qty: r.qty }));
  } catch {
    return [];
  }
}
