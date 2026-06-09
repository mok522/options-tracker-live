export const dynamic = 'force-dynamic';

import { db } from '@/db/client';
import { trades as tradesTable } from '@/db/schema';
import { TrackerApp } from '@/components/TrackerApp';
import type { Trade } from '@/types/trade';

export default async function Home() {
  const rows = await db.select().from(tradesTable);
  const initialTrades: Trade[] = rows.map((r) => ({
    id:     r.id,
    sym:    r.sym,
    strat:  r.strat,
    side:   r.side as Trade['side'],
    qty:    r.qty,
    strike: r.strike,
    exp:    r.exp,
    fill:   r.fill,
    comm:   r.comm ?? null,
    pl:     r.pl,
    status: r.status as Trade['status'],
    date:   r.date ?? '',
  }));
  return <TrackerApp initialTrades={initialTrades} />;
}
