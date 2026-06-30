'use client';

import { useState, useMemo } from 'react';
import type { Trade } from '@/types/trade';
import { StatusPill } from '@/components/shared/StatusPill';
import { Icon } from '@/components/shared/Icon';
import { fmtNum, fmtSigned } from '@/lib/formatters';
import { S1256_SYMS } from '@/lib/csvParser';

interface TradesViewProps {
  trades: Trade[];
}

function StatCard({ label, value, tone, hint }: { label: string; value: string | number; tone?: 'pos' | 'neg'; hint?: string }) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: c, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{hint}</span>}
    </div>
  );
}

const commOf = (t: Trade) => (t.comm != null ? t.comm : -(Math.round((t.qty * 0.66) * 100) / 100));

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Close/realization date for a finished trade; em-dash while still open.
function fmtCloseDate(t: Trade): string {
  if (t.status === 'Open' || !t.date) return '—';
  const [y, m, d] = t.date.split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${MON[m - 1]} ${d} '${String(y).slice(2)}`;
}

const thStatic: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
};

type SortKey = 'sym' | 'strat' | 'side' | 'qty' | 'exp' | 'fill' | 'pl' | 'date';

export function TradesView({ trades }: TradesViewProps) {
  const [status, setStatus] = useState('All');
  const [strat, setStrat] = useState('All');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: 'date', dir: -1 });

  const strategies = useMemo(() => ['All', ...Array.from(new Set(trades.map((t) => t.strat)))], [trades]);

  const rows = useMemo(() => {
    let r = trades.filter((t) =>
      (status === 'All' || t.status === status) &&
      (strat === 'All' || t.strat === strat) &&
      (q.trim() === '' || t.sym.toLowerCase().includes(q.trim().toLowerCase())));
    const k = sort.key;
    r = [...r].sort((a, b) => {
      const av = (a[k] ?? '') as string | number, bv = (b[k] ?? '') as string | number;
      if (typeof av === 'string') {
        return (av.toLowerCase() < (bv as string).toLowerCase() ? -sort.dir : av.toLowerCase() > (bv as string).toLowerCase() ? sort.dir : 0);
      }
      return ((av as number) - (bv as number)) * sort.dir;
    });
    return r;
  }, [trades, status, strat, q, sort]);

  const totalPL = rows.reduce((s, t) => s + t.pl, 0);
  const wins = rows.filter((t) => t.pl >= 0).length;
  const winRate = rows.length ? Math.round((wins / rows.length) * 100) : 0;
  const openCt = rows.filter((t) => t.status === 'Open').length;

  const setSortKey = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'sym' || key === 'strat' ? 1 : -1 });
  const arrow = (key: SortKey) => sort.key === key ? <span style={{ marginLeft: 3, color: 'var(--accent)' }}>{sort.dir === 1 ? '↑' : '↓'}</span> : null;

  const sortTh = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th
      onClick={() => setSortKey(key)}
      style={{ ...thStatic, textAlign: align, color: sort.key === key ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer', userSelect: 'none' }}
    >
      {label}{arrow(key)}
    </th>
  );

  const td: React.CSSProperties = { padding: '11px 14px', fontSize: 12.5, whiteSpace: 'nowrap' };
  const numTd: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'hidden' }}>
      {/* summary cards */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flex: '0 0 auto' }}>
        <StatCard label="Filtered P&L" value={fmtSigned(totalPL)} tone={totalPL >= 0 ? 'pos' : 'neg'} hint={`${rows.length} of ${trades.length} trades`} />
        <StatCard label="Win Rate" value={winRate + '%'} hint={`${wins} winners`} />
        <StatCard label="Open Positions" value={openCt} hint="in current filter" />
        <StatCard label="Avg / Trade" value={rows.length ? fmtSigned(Math.round(totalPL / rows.length)) : '—'} tone={totalPL >= 0 ? 'pos' : 'neg'} hint="realized" />
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <div className="seg">
          {['All', 'Open', 'Closed', 'Expired', 'Assigned'].map((o) => (
            <button key={o} className={status === o ? 'on' : ''} onClick={() => setStatus(o)}>{o}</button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <select
            value={strat}
            onChange={(e) => setStrat(e.target.value)}
            style={{ font: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', appearance: 'none', padding: '7px 28px 7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
          >
            {strategies.map((s) => <option key={s} value={s}>{s === 'All' ? 'All strategies' : s}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}>
            <Icon name="chevDown" size={14} />
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', width: 180 }}>
          <Icon name="search" size={14} style={{ color: 'var(--text-3)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol…"
            style={{ border: 0, background: 'transparent', font: 'inherit', fontSize: 12, color: 'var(--text-1)', width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button className="chip" style={{ cursor: 'pointer', gap: 6 }}>
          <Icon name="download" size={13} /> Export CSV
        </button>
      </div>

      {/* table */}
      <div className="panel" style={{ borderRadius: 9, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {sortTh('sym', 'Symbol')}
                {sortTh('strat', 'Strategy')}
                {sortTh('side', 'Side')}
                {sortTh('qty', 'Qty', 'right')}
                <th style={thStatic}>Strike</th>
                {sortTh('exp', 'Exp')}
                {sortTh('fill', 'Fill', 'right')}
                <th style={{ ...thStatic, textAlign: 'right' }}>Comm</th>
                {sortTh('pl', 'P&L', 'right')}
                {sortTh('date', 'Closed')}
                <th style={{ ...thStatic, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }} className="trow">
                  <td style={{ ...td, fontWeight: 700, color: 'var(--text-1)' }}>
                    {t.sym}
                    {S1256_SYMS.includes(t.sym) && (
                      <span title="§1256 contract" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', padding: '1px 4px', borderRadius: 4, marginLeft: 2 }}>§1256</span>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.strat}</td>
                  <td style={td}><span style={{ fontSize: 11.5, fontWeight: 600, color: t.side === 'Buy' ? 'var(--accent)' : 'var(--text-2)' }}>{t.side}</span></td>
                  <td style={{ ...numTd, color: 'var(--text-2)' }}>{t.qty}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.strike}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.exp}</td>
                  <td style={{ ...numTd, color: 'var(--text-2)' }}>{fmtNum(t.fill)}</td>
                  <td style={{ ...numTd, color: 'var(--text-3)' }}>{fmtNum(commOf(t))}</td>
                  <td style={{ ...numTd, fontWeight: 700, color: t.pl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmtSigned(t.pl)}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{fmtCloseDate(t)}</td>
                  <td style={{ ...td, textAlign: 'right' }}><StatusPill status={t.status} /></td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No trades match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
