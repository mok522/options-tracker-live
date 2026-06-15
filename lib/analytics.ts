import type { Trade } from '@/types/trade';

// Tier-1 performance analytics — all derived from realized (closed) trades only.
// Pure function, no side effects, safe on empty input (returns zeros / nulls).

export interface StrategyStat {
  strat: string;
  trades: number;
  winRate: number;   // 0..1
  netPl: number;
  expectancy: number; // netPl / trades
}

export interface SideStat {
  label: string;
  trades: number;
  winRate: number;   // 0..1
  netPl: number;
  avgPl: number;
}

export interface AnalyticsResult {
  closedCount: number;
  maxDrawdown: number;        // positive dollar magnitude of worst peak-to-trough
  maxDrawdownPct: number;     // 0..1, drawdown as a fraction of the peak it fell from
  expectancy: number;         // average $ P&L per closed trade
  payoffRatio: number | null; // avgWin / avgLoss (null when no losses)
  avgWin: number;             // average winning trade ($)
  avgLoss: number;            // average losing trade (positive magnitude, $)
  winRate: number;            // 0..1
  commissionDrag: number | null; // total commissions / gross profit (null when no gross profit)
  totalCommissions: number;   // positive magnitude ($)
  currentStreak: number;      // signed: +N consecutive wins, -N consecutive losses
  maxWinStreak: number;
  maxLossStreak: number;
  largestWin: number;         // most positive realized P&L
  largestLoss: number;        // most negative realized P&L (signed)
  longVsShort: SideStat[];    // [long premium, short premium]
  strategies: StrategyStat[]; // per-strategy, sorted by net P&L desc
  drawdownSeries: number[];   // underwater curve (values <= 0) over date-sorted closes
}

// Commission magnitude, mirroring the dashboard's fallback (0.66/contract round-trip).
function absComm(t: Trade): number {
  const c = t.comm != null ? t.comm : -(Math.round(t.qty * 0.66 * 100) / 100);
  return Math.abs(c);
}

export function computeAnalytics(trades: Trade[]): AnalyticsResult {
  const closed = trades.filter((t) => t.status !== 'Open');
  const wins = closed.filter((t) => t.pl > 0);
  const losses = closed.filter((t) => t.pl < 0);
  const N = closed.length;

  const sumWin = wins.reduce((s, t) => s + t.pl, 0);
  const sumLoss = losses.reduce((s, t) => s + t.pl, 0); // <= 0
  const netPl = closed.reduce((s, t) => s + t.pl, 0);

  const avgWin = wins.length ? sumWin / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(sumLoss) / losses.length : 0;
  const winRate = N ? wins.length / N : 0;
  const expectancy = N ? netPl / N : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : null;

  const totalCommissions = closed.reduce((s, t) => s + absComm(t), 0);
  const commissionDrag = sumWin > 0 ? totalCommissions / sumWin : null;

  // Date-sorted realized series → drawdown + streaks (FIFO over realization date).
  const dated = closed
    .filter((t) => t.date && t.date.length === 10)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));

  let cum = 0, peak = 0, maxDrawdown = 0, maxDrawdownPct = 0;
  const drawdownSeries: number[] = [0];
  for (const t of dated) {
    cum += t.pl;
    if (cum > peak) peak = cum;
    const dd = peak - cum; // >= 0
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? dd / peak : 0;
    }
    drawdownSeries.push(-dd);
  }

  let maxWinStreak = 0, maxLossStreak = 0, runW = 0, runL = 0;
  for (const t of dated) {
    if (t.pl > 0) { runW++; runL = 0; if (runW > maxWinStreak) maxWinStreak = runW; }
    else if (t.pl < 0) { runL++; runW = 0; if (runL > maxLossStreak) maxLossStreak = runL; }
    else { runW = 0; runL = 0; }
  }

  let currentStreak = 0;
  for (let i = dated.length - 1; i >= 0; i--) {
    const pl = dated[i].pl;
    if (pl === 0) break;
    if (currentStreak === 0) currentStreak = pl > 0 ? 1 : -1;
    else if (pl > 0 && currentStreak > 0) currentStreak++;
    else if (pl < 0 && currentStreak < 0) currentStreak--;
    else break;
  }

  const largestWin = wins.length ? Math.max(...wins.map((t) => t.pl)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map((t) => t.pl)) : 0;

  const mkSide = (label: string, arr: Trade[]): SideStat => {
    const n = arr.length;
    const w = arr.filter((t) => t.pl > 0).length;
    const net = arr.reduce((s, t) => s + t.pl, 0);
    return { label, trades: n, winRate: n ? w / n : 0, netPl: net, avgPl: n ? net / n : 0 };
  };
  const longVsShort = [
    mkSide('Long premium (debit)', closed.filter((t) => t.side === 'Buy')),
    mkSide('Short premium (credit)', closed.filter((t) => t.side === 'Sell')),
  ];

  const byStrat = new Map<string, Trade[]>();
  for (const t of closed) {
    const a = byStrat.get(t.strat) ?? [];
    a.push(t);
    byStrat.set(t.strat, a);
  }
  const strategies: StrategyStat[] = [...byStrat.entries()]
    .map(([strat, arr]) => {
      const n = arr.length;
      const w = arr.filter((t) => t.pl > 0).length;
      const net = arr.reduce((s, t) => s + t.pl, 0);
      return { strat, trades: n, winRate: n ? w / n : 0, netPl: net, expectancy: n ? net / n : 0 };
    })
    .sort((a, b) => b.netPl - a.netPl);

  return {
    closedCount: N,
    maxDrawdown, maxDrawdownPct,
    expectancy, payoffRatio, avgWin, avgLoss, winRate,
    commissionDrag, totalCommissions,
    currentStreak, maxWinStreak, maxLossStreak,
    largestWin, largestLoss,
    longVsShort, strategies, drawdownSeries,
  };
}
