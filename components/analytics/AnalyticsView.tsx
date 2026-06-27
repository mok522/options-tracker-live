'use client';

import { useMemo } from 'react';
import type { Trade } from '@/types/trade';
import { computeAnalytics } from '@/lib/analytics';
import { fmtUSD, fmtSigned, fmtPct } from '@/lib/formatters';
import { Tile } from '@/components/layout/Tile';
import { Icon } from '@/components/shared/Icon';

interface AnalyticsViewProps {
  trades: Trade[];
}

const PANEL_HEAD: React.CSSProperties = { padding: '13px 14px 0' };
const labelTh: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' };
const cell: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap' };
const numCell: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const plColor = (n: number) => (n >= 0 ? 'var(--pos)' : 'var(--neg)');

function streakLabel(streak: number): string {
  if (streak === 0) return '—';
  const n = Math.abs(streak);
  return `${n} ${streak > 0 ? (n === 1 ? 'win' : 'wins') : (n === 1 ? 'loss' : 'losses')}`;
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export function AnalyticsView({ trades }: AnalyticsViewProps) {
  const a = useMemo(() => computeAnalytics(trades), [trades]);

  if (a.closedCount === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--inset)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="grid" size={22} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>No closed trades yet</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Import a statement with realized trades to see performance analytics.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>Performance Analytics</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{a.closedCount} closed trades · realized only</div>
        </div>
        <span className="chip" style={{ gap: 6 }}><Icon name="spark" size={13} style={{ color: 'var(--accent)' }} /> Edge & risk metrics</span>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 11, flex: '0 0 auto' }}>
        <Tile label="Max Drawdown" value={a.maxDrawdown > 0 ? fmtUSD(-a.maxDrawdown) : '—'} tone="neg" />
        <Tile label="Expectancy / Trade" value={fmtSigned(Math.round(a.expectancy))} tone={a.expectancy >= 0 ? 'pos' : 'neg'} />
        <Tile label="Payoff Ratio" value={a.payoffRatio != null ? a.payoffRatio.toFixed(2) + '×' : '—'} />
        <Tile label="Avg Win" value={fmtUSD(a.avgWin)} tone="pos" />
        <Tile label="Avg Loss" value={a.avgLoss > 0 ? fmtUSD(-a.avgLoss) : '—'} tone="neg" />
        <Tile label="Commission Drag" value={a.commissionDrag != null ? fmtPct(a.commissionDrag) : '—'} tone="neg" />
      </div>

      {/* Long vs Short + Streaks & Extremes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 13, flex: '0 0 auto' }}>
        {/* long vs short */}
        <div className="panel" style={{ borderRadius: 9 }}>
          <div style={PANEL_HEAD}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Long vs Short Premium</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>By opening side — debit (buyer) vs credit (seller)</div>
          </div>
          <div style={{ padding: '10px 6px 6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={labelTh}>Direction</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>Trades</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>Win %</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>Avg P&L</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {a.longVsShort.map((s) => (
                  <tr key={s.label} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...cell, fontWeight: 600 }}>{s.label}</td>
                    <td style={{ ...numCell, color: 'var(--text-2)' }}>{s.trades}</td>
                    <td style={numCell}>{s.trades ? fmtPct(s.winRate) : '—'}</td>
                    <td style={{ ...numCell, color: s.trades ? plColor(s.avgPl) : 'var(--text-3)' }}>{s.trades ? fmtSigned(Math.round(s.avgPl)) : '—'}</td>
                    <td style={{ ...numCell, fontWeight: 700, color: s.trades ? plColor(s.netPl) : 'var(--text-3)' }}>{s.trades ? fmtSigned(s.netPl) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* streaks & extremes */}
        <div className="panel" style={{ borderRadius: 9 }}>
          <div style={PANEL_HEAD}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Streaks & Extremes</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Consecutive results by realization date</div>
          </div>
          <div style={{ padding: '4px 14px 12px' }}>
            <MetricRow label="Current streak" value={streakLabel(a.currentStreak)} color={a.currentStreak === 0 ? undefined : plColor(a.currentStreak)} />
            <MetricRow label="Longest win streak" value={String(a.maxWinStreak)} color="var(--pos)" />
            <MetricRow label="Longest loss streak" value={String(a.maxLossStreak)} color="var(--neg)" />
            <MetricRow label="Largest win" value={a.largestWin > 0 ? fmtSigned(a.largestWin) : '—'} color="var(--pos)" />
            <MetricRow label="Largest loss" value={a.largestLoss < 0 ? fmtSigned(a.largestLoss) : '—'} color="var(--neg)" />
          </div>
        </div>
      </div>

      {/* strategy performance */}
      <div className="panel" style={{ borderRadius: 9, flex: '0 0 auto' }}>
        <div style={{ ...PANEL_HEAD, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Strategy Performance</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Win rate & expectancy per strategy</div>
          </div>
          <span className="pill pill-closed">{a.strategies.length} strategies</span>
        </div>
        <div style={{ padding: '10px 6px 6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={labelTh}>Strategy</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Trades</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Win %</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Expectancy</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {a.strategies.map((s) => (
                <tr key={s.strat} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...cell, fontWeight: 600 }}>{s.strat}</td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>{s.trades}</td>
                  <td style={numCell}>{fmtPct(s.winRate)}</td>
                  <td style={{ ...numCell, color: plColor(s.expectancy) }}>{fmtSigned(Math.round(s.expectancy))}</td>
                  <td style={{ ...numCell, fontWeight: 700, color: plColor(s.netPl) }}>{fmtSigned(s.netPl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
