'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Trade } from '@/types/trade';
import { computeOpenAnalytics, parseExp, positionKey, type CloseSignal, type OpenRow, type MarksMap } from '@/lib/openAnalytics';
import { getQuotes } from '@/actions/fetchQuotes';
import { getOpenPositionMarks } from '@/actions/fetchPositions';
import type { QuotesMap } from '@/lib/schwab/quotes';
import { fmtUSD, fmtSigned, fmtPct, fmtNum } from '@/lib/formatters';
import { Tile } from '@/components/layout/Tile';
import { Icon } from '@/components/shared/Icon';
import { ymd } from '@/lib/snapshotPositions';
import { PositionHistoryPanel } from './PositionHistoryPanel';

interface OpenPositionsViewProps {
  trades: Trade[];
}

const PANEL_HEAD: React.CSSProperties = { padding: '13px 14px 0' };
const labelTh: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' };
const cell: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap' };
const numCell: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const plColor = (n: number) => (n >= 0 ? 'var(--pos)' : 'var(--neg)');

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

export function OpenPositionsView({ trades }: OpenPositionsViewProps) {
  // Live underlying quotes (moneyness) + option marks (unrealized P&L).
  const [quotes, setQuotes] = useState<QuotesMap>({});
  const [marks, setMarks] = useState<MarksMap>({});
  const [selected, setSelected] = useState<{ row: OpenRow; key: string } | null>(null);

  const openHistory = (r: OpenRow) => {
    const expDate = parseExp(r.trade.exp);
    const key = positionKey(r.trade.sym, r.strikeNum, expDate ? ymd(expDate) : null, r.kind, r.isShort);
    if (key) setSelected({ row: r, key });
  };

  // This tab is options-only by design (spec 2026-07-13): share lots live in
  // the Trades table. Filter before any analytics touch the data.
  const optionTrades = useMemo(
    () => trades.filter((t) => (t.assetType ?? 'OPTION') === 'OPTION'),
    [trades],
  );

  const symbolKey = useMemo(() => {
    const set = new Set<string>();
    for (const t of optionTrades) if (t.status === 'Open') { set.add(t.sym); set.add(`$${t.sym}.X`); }
    return [...set].sort().join(',');
  }, [optionTrades]);

  useEffect(() => {
    if (!symbolKey) return;
    let live = true;
    getQuotes(symbolKey.split(',')).then((q) => { if (live) setQuotes(q); });
    getOpenPositionMarks().then((m) => { if (live) setMarks(m); });
    return () => { live = false; };
  }, [symbolKey]);

  const o = useMemo(() => computeOpenAnalytics(optionTrades, quotes, marks), [optionTrades, quotes, marks]);

  if (o.count === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--inset)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" size={22} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>No open positions</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sync your Schwab account — open option legs appear here with live close signals.</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>Open Positions</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {o.count} open · {o.pnlQuotedCount} with live P&L · sorted by urgency
          </div>
        </div>
        <span className="chip" style={{ gap: 6 }}>
          <Icon name="calendar" size={13} style={{ color: 'var(--accent)' }} /> Close-decision signals
        </span>
      </div>

      {/* KPI tiles */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 11, flex: '0 0 auto' }}>
        <Tile
          label="Unrealized P&L"
          value={o.totalUnrealizedPl != null ? fmtSigned(o.totalUnrealizedPl) : '—'}
          tone={o.totalUnrealizedPl == null ? undefined : o.totalUnrealizedPl >= 0 ? 'pos' : 'neg'}
        />
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
              P&L since open, time decay, premium at risk & live moneyness per open leg · click a row for P&L history · marks reflect Schwab&apos;s last mark (updates during market hours)
            </div>
          </div>
          {o.pnlQuotedCount < o.count && (
            <span className="pill pill-expired" title="No live option mark for some legs (e.g. indices, or outside market hours) — P&L shows —">
              {o.count - o.pnlQuotedCount} no mark
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
                <th style={{ ...labelTh, textAlign: 'right' }}>P&L Since Open</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>% Cap.</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Underlying</th>
                <th style={{ ...labelTh, textAlign: 'right' }}>Dist. to Strike</th>
                <th style={{ ...labelTh, textAlign: 'left' }}>Signal</th>
              </tr>
            </thead>
            <tbody>
              {o.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} className="trow"
                  onClick={() => openHistory(r)} title="View P&L history"
                  tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHistory(r); } }}>
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
                  <td style={{ ...numCell, fontWeight: 700, color: r.unrealizedPl != null ? plColor(r.unrealizedPl) : 'var(--text-3)' }}>
                    {r.unrealizedPl != null ? fmtSigned(r.unrealizedPl) : '—'}
                  </td>
                  <td style={{ ...numCell, color: 'var(--text-2)' }}>
                    {r.pctCaptured != null ? fmtPct(r.pctCaptured, 0) : '—'}
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

      {selected && (
        <PositionHistoryPanel row={selected.row} positionKey={selected.key} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
