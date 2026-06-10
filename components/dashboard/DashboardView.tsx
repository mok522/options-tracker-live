'use client';

import { useMemo } from 'react';
import type { Trade } from '@/types/trade';
import { fmtSigned, fmtUSD } from '@/lib/formatters';
import { S1256_SYMS } from '@/lib/csvParser';
import { Tile } from '@/components/layout/Tile';
import { Panel } from '@/components/layout/Panel';
import { Icon } from '@/components/shared/Icon';
import { TradesTable } from '@/components/shared/TradesTable';
import { CumulativeLine } from '@/components/charts/CumulativeLine';
import { MonthlyBars } from '@/components/charts/MonthlyBars';
import { StrategyDonut, DonutLegend } from '@/components/charts/StrategyDonut';
import { WinRateBars } from '@/components/charts/WinRateBars';
import { Delta } from '@/components/shared/Delta';

interface DashboardViewProps {
  trades: Trade[];
  setTab: (t: string) => void;
}

const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const commOf = (t: Trade) => (t.comm != null ? t.comm : -(Math.round(t.qty * 0.66 * 100) / 100));
const s1256set = new Set(S1256_SYMS);

export function DashboardView({ trades, setTab }: DashboardViewProps) {
  const closed = useMemo(() => trades.filter((t) => t.status !== 'Open'), [trades]);
  const wins   = useMemo(() => closed.filter((t) => t.pl > 0), [closed]);
  const losses = useMemo(() => closed.filter((t) => t.pl < 0), [closed]);

  const netPL        = useMemo(() => trades.reduce((s, t) => s + t.pl, 0), [trades]);
  const winRate      = closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0;
  const grossWin     = wins.reduce((s, t) => s + t.pl, 0);
  const grossLoss    = Math.abs(losses.reduce((s, t) => s + t.pl, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : 0;
  const avgTrade     = closed.length ? Math.round(netPL / closed.length) : 0;
  const openCt       = useMemo(() => trades.filter((t) => t.status === 'Open').length, [trades]);
  const totalComm    = useMemo(() => Math.round(trades.reduce((s, t) => s + commOf(t), 0) * 100) / 100, [trades]);

  // Tax sidebar calcs (mirror TaxView logic)
  const s1256PL     = trades.filter((t) => s1256set.has(t.sym)).reduce((s, t) => s + t.pl, 0);
  const shortTermPL = closed.filter((t) => !s1256set.has(t.sym)).reduce((s, t) => s + (t.pl > 0 ? t.pl : 0), 0);
  const estTax      = Math.round((shortTermPL * 0.24 + Math.max(0, s1256PL * 0.4) * 0.24 + Math.max(0, s1256PL * 0.6) * 0.15) * 100) / 100;

  // Sparkline for Net P&L tile (trade-import order — approximate trend)
  const cumulSpark = useMemo(
    () => trades.reduce<number[]>((acc, t) => { acc.push((acc.at(-1) ?? 0) + t.pl); return acc; }, [0]),
    [trades],
  );

  const winRateDelta = Math.round((winRate - 50) * 10) / 10;

  // --- Monthly bars: last 12 calendar months ---
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      if (!t.date || t.status === 'Open') continue;
      const key = t.date.slice(0, 7); // "YYYY-MM"
      map.set(key, (map.get(key) ?? 0) + t.pl);
    }
    const now = new Date();
    const result: { m: string; pl: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({ m: MON_ABBR[d.getMonth()], pl: Math.round((map.get(key) ?? 0) * 100) / 100 });
    }
    return result;
  }, [trades]);

  // --- Cumulative line: date-sorted running sum + 6 evenly-spaced labels ---
  const { cumulativeData, cumulativeLabels } = useMemo(() => {
    const dated = trades
      .filter((t) => t.date && t.date.length === 10)
      .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));

    if (dated.length === 0) return { cumulativeData: undefined, cumulativeLabels: undefined };

    const pts: number[] = [0];
    for (const t of dated) pts.push(pts[pts.length - 1] + t.pl);

    const n = dated.length;
    const idxs = [0, Math.floor(n * 0.2), Math.floor(n * 0.4), Math.floor(n * 0.6), Math.floor(n * 0.8), n - 1];
    const labels = idxs.map((i) => {
      const d = new Date(dated[Math.min(i, n - 1)].date! + 'T00:00:00');
      return MON_ABBR[d.getMonth()];
    });

    return { cumulativeData: pts, cumulativeLabels: labels };
  }, [trades]);

  // --- Strategy donut: top-5 by |pl| ---
  const strategyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of closed) map.set(t.strat, (map.get(t.strat) ?? 0) + t.pl);
    if (map.size === 0) return undefined;

    const sorted = [...map.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5);
    const totalAbs = sorted.reduce((s, [, pl]) => s + Math.abs(pl), 0);
    if (totalAbs === 0) return undefined;

    return sorted.map(([name, pl], i) => ({
      name,
      pct: Math.round((Math.abs(pl) / totalAbs) * 100),
      pl: Math.round(pl * 100) / 100,
      varName: `--cat-${i + 1}` as string,
    }));
  }, [closed]);

  // --- Win-rate bars: top-6 symbols by trade count ---
  const winRateData = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>();
    for (const t of closed) {
      const cur = map.get(t.sym) ?? { wins: 0, total: 0 };
      cur.total += 1;
      if (t.pl > 0) cur.wins += 1;
      map.set(t.sym, cur);
    }
    if (map.size === 0) return undefined;

    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 6)
      .map(([sym, { wins, total }]) => ({
        sym,
        rate: Math.round((wins / total) * 100),
        n: total,
      }));
  }, [closed]);

  return (
    <div style={{ flex: 1, padding: 13, display: 'flex', flexDirection: 'column', gap: 11, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '208px minmax(0,1fr) 312px', gap: 11, minHeight: 0 }}>

        {/* left stat rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 0 }}>
          <Tile label="Net Realized P&L" value={fmtSigned(netPL)} tone={netPL >= 0 ? 'pos' : 'neg'} spark={cumulSpark} />
          <Tile label="Win Rate" value={winRate + '%'} delta={winRateDelta} />
          <Tile label="Profit Factor" value={profitFactor > 0 ? profitFactor.toFixed(2) : '—'} />
          <Tile label="Avg / Trade" value={closed.length ? fmtSigned(avgTrade) : '—'} tone={avgTrade >= 0 ? 'pos' : 'neg'} />
          <Tile label="Open Positions" value={openCt} />
          <Tile label="Commissions YTD" value={fmtUSD(totalComm)} tone="neg" />
          <Panel
            title="Tax Exposure"
            sub="est."
            style={{ flex: 1 }}
            pad="8px 13px 11px"
            bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 7, justifyContent: 'center' }}
          >
            {([
              ['Short-term', fmtUSD(shortTermPL)],
              ['Long-term',  fmtUSD(0)],
              ['§1256 60/40', fmtUSD(s1256PL)],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{l}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
            <button
              onClick={() => setTab('Tax Exposure')}
              style={{ marginTop: 4, font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--accent)' }}
            >
              View tax report <Icon name="chevRight" size={12} />
            </button>
          </Panel>
        </div>

        {/* center charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 0, height: '100%' }}>
          <Panel title="Cumulative Realized P&L" sub="YTD" style={{ flex: 1.42 }} right={<Delta value={winRateDelta} />}>
            <CumulativeLine width={640} height={206} data={cumulativeData} labels={cumulativeLabels} />
          </Panel>
          <Panel title="Monthly Realized P&L" sub="trailing 12 mo" style={{ flex: 1 }}>
            <MonthlyBars width={640} height={150} data={monthlyData} />
          </Panel>
        </div>

        {/* right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 0, height: '100%' }}>
          <Panel
            title="Strategy Mix"
            sub="of P&L"
            style={{ flex: 1 }}
            bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, justifyContent: 'center' }}
          >
            <StrategyDonut size={130} thickness={21} data={strategyData} />
            <div style={{ width: '100%' }}><DonutLegend data={strategyData} /></div>
          </Panel>
          <Panel title="Win Rate by Symbol" sub="top 6" style={{ flex: 1 }}>
            <WinRateBars width={286} height={158} data={winRateData} />
          </Panel>
        </div>
      </div>

      {/* recent trades */}
      <Panel
        title="Recent Trades"
        sub={`${closed.length} closed · ${openCt} open`}
        right={
          <button
            onClick={() => setTab('Trades')}
            style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}
          >
            View all trades <Icon name="chevRight" size={13} />
          </button>
        }
        style={{ flex: '0 0 auto', height: 220 }}
        pad="0 6px 4px"
      >
        <div style={{ height: '100%', overflowY: 'auto' }}>
          <TradesTable rows={trades.slice(0, 6)} dense />
        </div>
      </Panel>
    </div>
  );
}
