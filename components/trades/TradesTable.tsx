'use client';

import { useState, useMemo } from 'react';
import type { Position } from '@/types';
import { StatusPill } from '@/components/shared/StatusPill';
import { fmtUSD, fmtSigned } from '@/lib/formatters';

type SortKey =
  | 'underlying'
  | 'strategy'
  | 'status'
  | 'openDate'
  | 'closeDate'
  | 'expiration'
  | 'qty'
  | 'realizedPnl'
  | 'commissions';

type SortDir = 'asc' | 'desc';

interface Props {
  positions: Position[];
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function getValue(p: Position, key: SortKey): number | string {
  switch (key) {
    case 'underlying': return p.underlying;
    case 'strategy': return p.strategy;
    case 'status': return p.status;
    case 'openDate': return p.openDate.getTime();
    case 'closeDate': return p.closeDate ? p.closeDate.getTime() : -Infinity;
    case 'expiration': return p.expiration ? p.expiration.getTime() : -Infinity;
    case 'qty': return p.qty;
    case 'realizedPnl': return p.realizedPnl ?? -Infinity;
    case 'commissions': return p.commissions;
  }
}

const COLS: { key: SortKey; label: string }[] = [
  { key: 'underlying', label: 'Symbol' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'status', label: 'Status' },
  { key: 'openDate', label: 'Open Date' },
  { key: 'closeDate', label: 'Close Date' },
  { key: 'expiration', label: 'Expiry' },
  { key: 'qty', label: 'Qty' },
  { key: 'realizedPnl', label: 'P&L' },
  { key: 'commissions', label: 'Commission' },
];

export function TradesTable({ positions }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('closeDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...positions].sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      let cmp = 0;
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv);
      } else if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [positions, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIndicator({ colKey }: { colKey: SortKey }) {
    if (colKey !== sortKey) return <span className="ml-1 text-muted-foreground/40">⇅</span>;
    return (
      <span className="ml-1 text-muted-foreground">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border" style={{ background: 'var(--inset)' }}>
            {COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.4px] transition-colors"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-1)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
              >
                {col.label}
                <SortIndicator colKey={col.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={COLS.length}
                className="px-3 py-6 text-center text-muted-foreground"
              >
                No positions match the current filters.
              </td>
            </tr>
          )}
          {sorted.map((p) => {
            const pnl = p.realizedPnl ?? null;
            return (
              <tr
                key={p.id}
                className="border-b border-border last:border-0 transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <td className="whitespace-nowrap px-3 py-1.5 text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {p.underlying}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
                  {p.strategy}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <StatusPill status={p.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[12px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                  {fmtDate(p.openDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[12px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                  {fmtDate(p.closeDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[12px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                  {fmtDate(p.expiration)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-[12px] tabular-nums text-right" style={{ color: 'var(--text-2)' }}>
                  {p.qty}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-1.5 tabular-nums text-right font-medium"
                  style={{
                    color:
                      pnl === null
                        ? 'var(--color-neutral)'
                        : pnl >= 0
                        ? 'var(--color-pos)'
                        : 'var(--color-neg)',
                  }}
                >
                  {pnl === null ? '—' : fmtSigned(pnl)}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-1.5 tabular-nums text-right"
                  style={{ color: 'var(--color-neutral)' }}
                >
                  {fmtUSD(p.commissions)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
