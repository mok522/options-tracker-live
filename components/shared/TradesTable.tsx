'use client';

import type { Trade } from '@/types/trade';
import { StatusPill } from './StatusPill';
import { fmtNum, fmtSigned } from '@/lib/formatters';
import { sampleTrades } from '@/lib/sampleData';

type ColName = 'Symbol' | 'Strategy' | 'Side' | 'Qty' | 'Strike' | 'Exp' | 'Fill' | 'P&L' | 'Status';

interface TradesTableProps {
  rows?: Trade[];
  dense?: boolean;
  cols?: ColName[];
}

export function TradesTable({ rows = sampleTrades, dense = false, cols }: TradesTableProps) {
  const all: ColName[] = ['Symbol', 'Strategy', 'Side', 'Qty', 'Strike', 'Exp', 'Fill', 'P&L', 'Status'];
  const show = cols || all;
  const has = (c: ColName) => show.includes(c);
  const cell = { padding: dense ? '7px 12px' : '10px 14px', fontSize: 12, whiteSpace: 'nowrap' as const };
  const th = { ...cell, textAlign: 'left' as const, fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', paddingTop: 9, paddingBottom: 9 };
  const numAlign = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {has('Symbol')   && <th style={th}>Symbol</th>}
          {has('Strategy') && <th style={th}>Strategy</th>}
          {has('Side')     && <th style={th}>Side</th>}
          {has('Qty')      && <th style={{ ...th, ...numAlign }}>Qty</th>}
          {has('Strike')   && <th style={th}>Strike</th>}
          {has('Exp')      && <th style={th}>Exp</th>}
          {has('Fill')     && <th style={{ ...th, ...numAlign }}>Fill</th>}
          {has('P&L')      && <th style={{ ...th, ...numAlign }}>P&amp;L</th>}
          {has('Status')   && <th style={{ ...th, textAlign: 'right' }}>Status</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {has('Symbol')   && <td style={{ ...cell, fontWeight: 700, color: 'var(--text-1)' }}>{t.sym}</td>}
            {has('Strategy') && <td style={{ ...cell, color: 'var(--text-2)' }}>{t.strat}</td>}
            {has('Side')     && <td style={cell}><span style={{ fontSize: 11, fontWeight: 600, color: t.side === 'Buy' ? 'var(--accent)' : 'var(--text-2)' }}>{t.side}</span></td>}
            {has('Qty')      && <td style={{ ...cell, ...numAlign, color: 'var(--text-2)' }}>{t.qty}</td>}
            {has('Strike')   && <td style={{ ...cell, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{t.strike || '—'}</td>}
            {has('Exp')      && <td style={{ ...cell, color: 'var(--text-2)' }}>{t.exp || '—'}</td>}
            {has('Fill')     && <td style={{ ...cell, ...numAlign, color: 'var(--text-2)' }}>{fmtNum(t.fill)}</td>}
            {has('P&L')      && <td style={{ ...cell, ...numAlign, fontWeight: 700, color: t.pl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmtSigned(t.pl)}</td>}
            {has('Status')   && <td style={{ ...cell, textAlign: 'right' }}><StatusPill status={t.status} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
