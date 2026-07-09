import type { Trade } from '@/types/trade';
import { computeOpenAnalytics, parseExp, positionKey, type MarksMap } from '@/lib/openAnalytics';

// One day's persisted state for one open position (may span multiple lots).
export interface SnapshotRow {
  positionKey: string;
  date: string;         // "YYYY-MM-DD" local
  mark: number;
  unrealizedPl: number; // summed across lots
  qty: number;          // summed across lots
  capturedAt: string;   // ISO timestamp
}

// Local-date YMD; the cron fires in a fixed UTC slot so local vs UTC only
// matters for the date label, and local matches the rest of the app.
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Build one snapshot row per open position from the current marks. Reuses
 * computeOpenAnalytics for lot-level mark matching and P&L, then aggregates
 * lots sharing a positionKey. Lots with no mark contribute nothing; a
 * position whose every lot lacks a mark is omitted entirely (a gap, not a 0).
 */
export function buildSnapshots(trades: Trade[], marks: MarksMap, now: Date = new Date()): SnapshotRow[] {
  const { rows } = computeOpenAnalytics(trades, {}, marks);
  const date = ymd(now);
  const capturedAt = now.toISOString();
  const byKey = new Map<string, SnapshotRow>();

  for (const r of rows) {
    if (r.mark == null || r.unrealizedPl == null) continue;
    const expDate = parseExp(r.trade.exp);
    const key = positionKey(r.trade.sym, r.strikeNum, expDate ? ymd(expDate) : null, r.kind, r.isShort);
    if (!key) continue;

    const cur = byKey.get(key);
    if (cur) {
      cur.unrealizedPl += r.unrealizedPl;
      cur.qty += r.trade.qty;
    } else {
      byKey.set(key, {
        positionKey: key, date, mark: r.mark,
        unrealizedPl: r.unrealizedPl, qty: r.trade.qty, capturedAt,
      });
    }
  }
  return [...byKey.values()];
}
