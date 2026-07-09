// Position P&L history metrics — pure functions over daily snapshot points.
// A "point" is one day's persisted mark/P&L for one position (see
// db/schema.ts `positionSnapshots`).

export interface SnapshotPoint {
  date: string;         // "YYYY-MM-DD"
  unrealizedPl: number; // $ P&L across the position's open legs that day
  mark: number;         // per-contract mark that day
  qty: number;          // contracts open at capture time
}

/**
 * Where `current` sits inside the historical min→max range, 0–100.
 * 100 = best it has ever been, 0 = worst. Clamped for values outside the
 * recorded range (live P&L can exceed yesterday's extremes). Returns null
 * with fewer than 2 points — no meaningful range yet. A flat range → 50.
 */
export function rangePercentile(current: number, history: number[]): number | null {
  if (history.length < 2) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  if (max === min) return 50;
  const pct = ((current - min) / (max - min)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

export interface HistoryStats {
  best: { date: string; pl: number };
  worst: { date: string; pl: number };
  daysTracked: number;
}

export function summarizeHistory(points: SnapshotPoint[]): HistoryStats | null {
  if (points.length === 0) return null;
  let best = points[0];
  let worst = points[0];
  for (const p of points) {
    if (p.unrealizedPl > best.unrealizedPl) best = p;
    if (p.unrealizedPl < worst.unrealizedPl) worst = p;
  }
  return {
    best: { date: best.date, pl: best.unrealizedPl },
    worst: { date: worst.date, pl: worst.unrealizedPl },
    daysTracked: points.length,
  };
}
