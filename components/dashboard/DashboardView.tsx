'use client';

import Link from 'next/link';
import type { Position, TaxSummary } from '@/types';
import { fmtUSD, fmtSigned, fmtPct } from '@/lib/formatters';
import {
  selectMonthlyPnL,
  selectCumulativePnL,
  selectStrategyBreakdown,
  selectWinRateBySymbol,
  selectKPIs,
} from '@/lib/selectors';
import { Panel } from '@/components/shared/Panel';
import { MetricTile } from '@/components/shared/MetricTile';
import { StatusPill } from '@/components/shared/StatusPill';
import { MonthlyBars } from '@/components/charts/MonthlyBars';
import { CumulativeLine } from '@/components/charts/CumulativeLine';
import { StrategyDonut } from '@/components/charts/StrategyDonut';
import { WinRateBars } from '@/components/charts/WinRateBars';

interface DashboardViewProps {
  positions: Position[];
  taxSummary: TaxSummary;
}

export function DashboardView({ positions }: DashboardViewProps) {
  if (positions.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground text-lg">
          No trade data yet. Import a CSV to get started.
        </p>
        <Link
          href="/import"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Import CSV
        </Link>
      </div>
    );
  }

  const kpis = selectKPIs(positions);
  const monthlyPnL = selectMonthlyPnL(positions);
  const cumulativePnL = selectCumulativePnL(positions);
  const strategyBreakdown = selectStrategyBreakdown(positions);
  const winRateBySymbol = selectWinRateBySymbol(positions);

  // Last 6 closed positions
  const recentClosed = [...positions]
    .filter((p) => p.status !== 'Open' && p.closeDate !== null)
    .sort((a, b) => new Date(b.closeDate!).getTime() - new Date(a.closeDate!).getTime())
    .slice(0, 6);

  return (
    <div className="p-6 space-y-6">
      {/* 3-column grid */}
      <div className="grid grid-cols-[220px_1fr_280px] gap-4 items-start">
        {/* Left column: KPI tiles */}
        <div className="flex flex-col gap-3">
          <MetricTile
            label="Net Realized P&L"
            value={fmtUSD(kpis.netPnl)}
            delta={fmtSigned(kpis.netPnl)}
          />
          <MetricTile
            label="Win Rate"
            value={fmtPct(kpis.winRate)}
          />
          <MetricTile
            label="Profit Factor"
            value={kpis.profitFactor.toFixed(2)}
          />
          <MetricTile
            label="Avg / Trade"
            value={fmtSigned(kpis.avgPerTrade)}
            delta={kpis.avgPerTrade >= 0 ? `+${fmtUSD(kpis.avgPerTrade)}` : fmtUSD(kpis.avgPerTrade)}
          />
          <MetricTile
            label="Open Positions"
            value={kpis.openCount.toString()}
          />
          <MetricTile
            label="Commissions"
            value={fmtUSD(kpis.commissionsTotal)}
          />
        </div>

        {/* Center column: charts */}
        <div className="flex flex-col gap-4">
          <Panel title="Cumulative P&L">
            <CumulativeLine data={cumulativePnL} />
          </Panel>
          <Panel title="Monthly P&L">
            <MonthlyBars data={monthlyPnL} />
          </Panel>
        </div>

        {/* Right column: donut + win rate */}
        <div className="flex flex-col gap-4">
          <Panel title="Strategy Mix">
            <StrategyDonut data={strategyBreakdown} />
          </Panel>
          <Panel title="Win Rate by Symbol">
            <WinRateBars data={winRateBySymbol} />
          </Panel>
        </div>
      </div>

      {/* Recent trades strip */}
      <Panel title="Recent Closed Trades">
        {recentClosed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed trades yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground">Symbol</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Strategy</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Close Date</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClosed.map((pos) => {
                    const pnl = pos.realizedPnl ?? 0;
                    const closeDate =
                      pos.closeDate instanceof Date
                        ? pos.closeDate
                        : new Date(pos.closeDate!);
                    return (
                      <tr
                        key={pos.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2 font-medium">{pos.underlying}</td>
                        <td className="py-2 text-muted-foreground">{pos.strategy}</td>
                        <td className="py-2">
                          <StatusPill status={pos.status} />
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {closeDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit',
                          })}
                        </td>
                        <td
                          className="py-2 text-right font-medium tabular-nums"
                          style={{ color: pnl >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
                        >
                          {fmtSigned(pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-right">
              <Link
                href="/trades"
                className="text-sm text-primary hover:underline"
              >
                View all trades →
              </Link>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
