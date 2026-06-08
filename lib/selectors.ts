import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Monthly P&L
// ---------------------------------------------------------------------------

/**
 * Groups closed positions by month (e.g. "Jan 24"), sums realizedPnl per month.
 * Returns results sorted chronologically.
 */
export function selectMonthlyPnL(
  positions: Position[],
): { month: string; pnl: number }[] {
  const map = new Map<string, number>();

  for (const pos of positions) {
    if (pos.status === 'Open' || pos.realizedPnl === null || pos.closeDate === null) {
      continue;
    }

    const d = pos.closeDate instanceof Date ? pos.closeDate : new Date(pos.closeDate);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    map.set(key, (map.get(key) ?? 0) + pos.realizedPnl);
  }

  // Sort by actual date — reconstruct a sortable key
  const closed = positions.filter(
    (p) => p.status !== 'Open' && p.realizedPnl !== null && p.closeDate !== null,
  );

  // Build sorted unique months
  const monthOrder: string[] = [];
  const seen = new Set<string>();

  const sortedClosed = [...closed].sort(
    (a, b) =>
      new Date(a.closeDate!).getTime() - new Date(b.closeDate!).getTime(),
  );

  for (const pos of sortedClosed) {
    const d = pos.closeDate instanceof Date ? pos.closeDate : new Date(pos.closeDate!);
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!seen.has(key)) {
      seen.add(key);
      monthOrder.push(key);
    }
  }

  return monthOrder.map((month) => ({ month, pnl: map.get(month) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Cumulative P&L
// ---------------------------------------------------------------------------

/**
 * Sorts closed positions by closeDate, computes running sum.
 */
export function selectCumulativePnL(
  positions: Position[],
): { date: string; cumPnl: number }[] {
  const closed = positions
    .filter(
      (p) => p.status !== 'Open' && p.realizedPnl !== null && p.closeDate !== null,
    )
    .sort((a, b) => new Date(a.closeDate!).getTime() - new Date(b.closeDate!).getTime());

  let running = 0;
  const result: { date: string; cumPnl: number }[] = [];

  for (const pos of closed) {
    running += pos.realizedPnl!;
    const d = pos.closeDate instanceof Date ? pos.closeDate : new Date(pos.closeDate!);
    const dateStr = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
    result.push({ date: dateStr, cumPnl: running });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Strategy breakdown
// ---------------------------------------------------------------------------

/**
 * Counts positions per strategy type, returns top 6 + "Other".
 */
export function selectStrategyBreakdown(
  positions: Position[],
): { name: string; value: number; pct: number }[] {
  const map = new Map<string, number>();

  for (const pos of positions) {
    map.set(pos.strategy, (map.get(pos.strategy) ?? 0) + 1);
  }

  if (map.size === 0) return [];

  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const total = positions.length;

  const top6 = sorted.slice(0, 6);
  const rest = sorted.slice(6);

  const result = top6.map(([name, value]) => ({
    name,
    value,
    pct: value / total,
  }));

  if (rest.length > 0) {
    const otherCount = rest.reduce((s, [, v]) => s + v, 0);
    result.push({ name: 'Other', value: otherCount, pct: otherCount / total });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Win rate by symbol
// ---------------------------------------------------------------------------

/**
 * For each underlying with >= 2 closed trades, computes win rate (pnl > 0 / total closed).
 * Returns top 8 by trade count.
 */
export function selectWinRateBySymbol(
  positions: Position[],
): { symbol: string; winRate: number; trades: number }[] {
  const closed = positions.filter(
    (p) => p.status !== 'Open' && p.realizedPnl !== null,
  );

  const map = new Map<string, { wins: number; total: number }>();

  for (const pos of closed) {
    const existing = map.get(pos.underlying) ?? { wins: 0, total: 0 };
    existing.total += 1;
    if ((pos.realizedPnl ?? 0) > 0) existing.wins += 1;
    map.set(pos.underlying, existing);
  }

  const result = [...map.entries()]
    .filter(([, v]) => v.total >= 2)
    .map(([symbol, { wins, total }]) => ({
      symbol,
      winRate: wins / total,
      trades: total,
    }))
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 8);

  return result;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export function selectKPIs(positions: Position[]): {
  netPnl: number;
  winRate: number;
  profitFactor: number;
  avgPerTrade: number;
  openCount: number;
  commissionsTotal: number;
} {
  const closed = positions.filter(
    (p) => p.status !== 'Open' && p.realizedPnl !== null,
  );

  const openCount = positions.filter((p) => p.status === 'Open').length;

  if (closed.length === 0) {
    return {
      netPnl: 0,
      winRate: 0,
      profitFactor: 0,
      avgPerTrade: 0,
      openCount,
      commissionsTotal: positions.reduce((s, p) => s + Math.abs(p.commissions), 0),
    };
  }

  const netPnl = closed.reduce((s, p) => s + (p.realizedPnl ?? 0), 0);
  const wins = closed.filter((p) => (p.realizedPnl ?? 0) > 0);
  const losses = closed.filter((p) => (p.realizedPnl ?? 0) <= 0);

  const winRate = wins.length / closed.length;
  const totalGains = wins.reduce((s, p) => s + (p.realizedPnl ?? 0), 0);
  const totalLosses = Math.abs(losses.reduce((s, p) => s + (p.realizedPnl ?? 0), 0));

  const profitFactor = totalLosses === 0 ? 0 : totalGains / totalLosses;
  const avgPerTrade = netPnl / closed.length;
  const commissionsTotal = positions.reduce((s, p) => s + Math.abs(p.commissions), 0);

  return { netPnl, winRate, profitFactor, avgPerTrade, openCount, commissionsTotal };
}
