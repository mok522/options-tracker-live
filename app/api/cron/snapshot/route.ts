import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db/client';
import { positionSnapshots, trades as tradesTable } from '@/db/schema';
import { isConnected } from '@/lib/schwab/tokenManager';
import { fetchOpenOptionMarks } from '@/lib/schwab/positions';
import { buildSnapshots } from '@/lib/snapshotPositions';
import type { Trade } from '@/types/trade';

export const dynamic = 'force-dynamic';

/**
 * Daily position-P&L snapshot, triggered by Vercel Cron (see vercel.json).
 * Auth: CRON_SECRET as a Bearer token — Vercel Cron sends it automatically
 * when the env var is set. Fail-closed: no secret configured → 401 always.
 * The app-login middleware exempts this path; this check replaces it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await isConnected())) {
    return NextResponse.json({ error: 'Schwab not connected' }, { status: 503 });
  }

  let marks;
  try {
    marks = await fetchOpenOptionMarks();
  } catch (e) {
    console.error('snapshot cron: marks fetch failed', e);
    return NextResponse.json({ error: 'Schwab marks fetch failed' }, { status: 503 });
  }

  const rows = await db.select().from(tradesTable);
  const trades: Trade[] = rows.map((r) => ({
    id: r.id, sym: r.sym, strat: r.strat, side: r.side as Trade['side'],
    qty: r.qty, strike: r.strike, exp: r.exp, fill: r.fill,
    comm: r.comm ?? null, pl: r.pl, status: r.status as Trade['status'],
    date: r.date ?? '',
  }));

  const snapshots = buildSnapshots(trades, marks);
  let written = 0;
  try {
    for (const s of snapshots) {
      await db.insert(positionSnapshots).values(s).onConflictDoUpdate({
        target: [positionSnapshots.positionKey, positionSnapshots.date],
        set: { mark: s.mark, unrealizedPl: s.unrealizedPl, qty: s.qty, capturedAt: s.capturedAt },
      });
      written++;
    }
  } catch (e) {
    console.error(`snapshot cron: upsert failed after ${written}/${snapshots.length} rows (next: ${snapshots[written]?.positionKey})`, e);
    return NextResponse.json({ error: 'Snapshot write failed', written, total: snapshots.length }, { status: 500 });
  }

  return NextResponse.json({ ok: true, written, date: snapshots[0]?.date ?? null });
}
