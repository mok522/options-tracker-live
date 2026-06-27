'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Trade } from '@/types/trade';
import { computeAnalytics } from '@/lib/analytics';
import { computeOpenAnalytics, type CloseSignal, type OpenRow } from '@/lib/openAnalytics';
import { getQuotes } from '@/actions/fetchQuotes';
import type { QuotesMap } from '@/lib/schwab/quotes';
import { fmtUSD, fmtSigned, fmtPct, fmtNum } from '@/lib/formatters';
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

// Close-signal badge styling. Per design rules --pos/--neg are reserved for P&L
// only, so signal urgency is expressed with accent/status tokens, never pos/neg.
const SIGNAL_STYLE: Record<CloseSignal, { bg: string; fg: string }> = {
  assignment: { bg: 'var(--accent-wash)', fg: 'var(--accent)' },
  expiring:   { bg: 'var(--accent-wash)', fg: 'var(--accent)' },
  profit:     { bg: 'var(--inset)',       fg: 'var(--text-1)' },
  decay:      { bg: 'var(--inset)',       fg: 'var(--text-2)' },
  manage:     { bg: 'var(--inset)',       fg: 'var(--text-2)' },
  hold:       { bg: 'transparent',        fg: 'var(--text-3)' },
  unknown:    { bg: 'transparent',        fg: 'var(--text-3)' },
};

const URGENT = new Set<CloseSignal>(['assignment', 'expiring']);

function SignalBadge({ row }: { row: OpenRow }) {
  const s = SIGNAL_STYLE[row.signal];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', border: URGENT.has(row.signal) ? '1px solid var(--accent)' : '1px solid transparent' }}>
      {URGENT.has(row.signal) && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />}
      {row.signalLabel}
    </span>
  );
}

// DTE cell — emphasised as it shortens (the core close-timing signal).
function dteText(dte: number | null): string {
  if (dte == null) return '—';
  if (dte < 0) return `${Math.abs(dte)}d past`;
  if (dte === 0) return 'today';
  return `${dte}d`;
}

function OpenPositionsSection({ trades, quotes }: { trades: Trade[]; quotes: QuotesMap }) {
  const o = useMemo(() => computeOpenAnalytics(trades, quotes), [trades, quotes]);

  if (o.count === 0) return null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>Open Positions</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {o.count} open · {o.quotedCount} with live quotes · sorted by urgency
          </div>
        </div>
        <span className="chip" style={{ gap: 6 }}>
          <Icon name="calendar" size={13} style={{ color: 'var(--accent)' }} /> Close-decision signals
        </span>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 11, flex: '0 0 auto' }}>
        <Tile label="Open Positions" value={o.count} />
        <Tile label="Credit at Risk" value={o.creditPremium > 0 ? fmtUSD(o.creditPremium) : '—'} />
        <Tile label="Debit Deployed" value={o.debitPremium > 0 ? fmtUSD(o.debitPremium) : '—'} />
        <Tile label="Expiring ≤7d" value={o.expiringCount} tone={o.expiringCount > 0 ? 'neg' : undefined} />
        <Tile label="In the Money" value={o.quotedCount ? o.itmCount : '—'} tone={o.itmCount > 0 ? 'neg' : undefined} />
        <Tile label="Avg DTE" value={o.avgDte != null ? `${o.avgDte}d` : '—'} />
      </div>

      {/* per-position decision table */}
      <div className="panel" style={{ borderRadius: 9, flex: '0 0 auto' }}>
        <div style={{ ...PANEL_HEAD, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>When to Close</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              Time decay, premium at risk & live moneyness per open leg
            </div>
          </div>
          {o.quotedCount < o.count && (
            <span className="pill pill-expired" title="Underlying quote unavailable for some symbols (e.g. indices) — moneyness shows —">
              {o.count - o.quotedCount} unquoted
            </span>
          )}
        </div>
        <div style={{ padding: '10px 6px 6px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={labelTh}>Symbol</th>
                <th style={labelTh}>Strategy</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Qty</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Strike</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Exp</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>DTE</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Held</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Premium</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Underlying</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Dist. to Strike</th>
                <th style={{ ...labelTh, textAlign: 'left' }}>Signal</th>
              </tr>
            </thead>
            <tbody>
              {o.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }} className="trow">
                  <td style={{ ...cell, fontWeight: 700 }}>{r.trade.sym}</td>
                  <td style={{ ...cell, color: 'var(--text-2)' }}>{r.trade.strat}</td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>{r.trade.qty}</td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>{r.trade.strike}</td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>{r.trade.exp}</td>
                  <td style={{ ...numCell, fontWeight: 600, color: r.dte != null && r.dte <= 7 ? 'var(--accent)' : 'var(--text-1)' }}>{dteText(r.dte)}</td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>{r.daysHeld != null ? `${r.daysHeld}d` : '—'}</td>
                  <td style={{ ...numCell, color: 'var(--text-1)' }}>
                    {fmtUSD(Math.abs(r.premium))}
                    <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>{r.isShort ? 'Cr' : 'Db'}</span>
                  </td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>{r.underlying != null ? fmtNum(r.underlying) : '—'}</td>
                  <td style={{ ...numCell, fontWeight: 600, color: r.itm === true ? 'var(--accent)' : 'var(--text-2)' }}>
                    {r.distancePct != null ? `${r.distancePct >= 0 ? '+' : '−'}${fmtPct(Math.abs(r.distancePct))}` : '—'}
                  </td>
                  <td style={cell}><SignalBadge row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function AnalyticsView({ trades }: AnalyticsViewProps) {
  const a = useMemo(() => computeAnalytics(trades), [trades]);
  const openCount = useMemo(() => trades.filter((t) => t.status === 'Open').length, [trades]);

  // Live underlying quotes for open-position symbols (bare ticker + index notation).
  const [quotes, setQuotes] = useState<QuotesMap>({});
  const symbolKey = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) if (t.status === 'Open') { set.add(t.sym); set.add(`$${t.sym}.X`); }
    return [...set].sort().join(',');
  }, [trades]);

  useEffect(() => {
    if (!symbolKey) return;
    let live = true;
    getQuotes(symbolKey.split(',')).then((q) => { if (live) setQuotes(q); });
    return () => { live = false; };
  }, [symbolKey]);

  // Nothing at all imported yet.
  if (a.closedCount === 0 && openCount === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--inset)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="grid" size={22} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>No trades yet</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sync your Schwab account to see open-position and performance analytics.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      <OpenPositionsSection trades={trades} quotes={quotes} />

      {a.closedCount === 0 ? (
        <div className="panel" style={{ borderRadius: 9, padding: '16px 16px', color: 'var(--text-3)', fontSize: 12.5, flex: '0 0 auto' }}>
          No closed trades yet — realized performance analytics appear once positions are closed.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: openCount ? 6 : 0 }}>
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
        </>
      )}
    </div>
  );
}
