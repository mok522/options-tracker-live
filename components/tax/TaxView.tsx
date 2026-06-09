'use client';

import type { Trade } from '@/types/trade';
import { Icon } from '@/components/shared/Icon';
import { fmtUSD, fmtSigned } from '@/lib/formatters';
import { S1256_SYMS } from '@/lib/csvParser';

interface TaxViewProps {
  trades: Trade[];
}

function StatCard({ label, value, tone, hint }: { label: string; value: string; tone?: 'pos' | 'neg'; hint?: string }) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: c, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{hint}</span>}
    </div>
  );
}

const brackets = [
  { rate: '10%', upto: '$11,925' }, { rate: '12%', upto: '$48,475' },
  { rate: '22%', upto: '$103,350' }, { rate: '24%', upto: '$197,300' },
  { rate: '32%', upto: '$250,525' }, { rate: '35%', upto: '$626,350' }, { rate: '37%', upto: '—' },
];
const marginalIdx = 3;

const isS1256 = (t: Trade) => S1256_SYMS.includes(t.sym);

export function TaxView({ trades }: TaxViewProps) {
  const closed = trades.filter((t) => t.status !== 'Open');
  const s1256Trades = trades.filter(isS1256);
  const s1256PL = s1256Trades.reduce((s, x) => s + x.pl, 0);
  const nonS1256Closed = closed.filter((t) => !isS1256(t));
  const shortTerm = nonS1256Closed.reduce((s, t) => s + (t.pl > 0 ? t.pl : 0), 0);
  const longTerm = 0;
  const washCandidates = nonS1256Closed.filter((x) => x.pl < 0).slice(0, 5);
  const washTotal = washCandidates.reduce((s, x) => s + x.pl, 0);
  const estTax = Math.max(0, shortTerm) * 0.24 + Math.max(0, s1256PL * 0.4) * 0.24 + Math.max(0, s1256PL * 0.6) * 0.15;

  const ltOf = (pl: number) => pl * 0.6;
  const stOf = (pl: number) => pl * 0.4;

  const labelTh: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const cell: React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap' };
  const numCell: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>Tax Exposure</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Estimated · tax year 2025 · single filer assumption</div>
        </div>
        <span className="chip" style={{ gap: 6 }}><Icon name="shield" size={13} style={{ color: 'var(--accent)' }} /> Estimates only — not tax advice</span>
      </div>

      {/* headline cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flex: '0 0 auto' }}>
        <StatCard label="Short-Term Gains" value={fmtUSD(shortTerm)} tone="pos" hint="taxed as ordinary income" />
        <StatCard label="Long-Term Gains" value={fmtUSD(longTerm)} tone="pos" hint="held > 1 year" />
        <StatCard label="§1256 (60/40)" value={fmtUSD(s1256PL)} hint="SPX · NDX · RUT" />
        <StatCard label="Wash-Sale Adj." value={fmtUSD(Math.abs(washTotal))} tone="neg" hint={`${washCandidates.length} flagged losses`} />
        <StatCard label="Est. Tax Owed" value={fmtUSD(estTax)} hint="≈ 24% marginal" />
      </div>

      {/* two-column detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 13, flex: '0 0 auto' }}>
        {/* §1256 detection */}
        <div className="panel" style={{ borderRadius: 9 }}>
          <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Section 1256 Contracts</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Broad-based index options — 60% long-term / 40% short-term, marked to market</div>
            </div>
            <span className="pill pill-open">{s1256Trades.length} detected</span>
          </div>
          <div style={{ padding: '10px 6px 6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={labelTh}>Symbol</th>
                  <th style={labelTh}>Strategy</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>Realized</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>60% LT</th>
                  <th style={{ ...labelTh, textAlign: 'right' }}>40% ST</th>
                </tr>
              </thead>
              <tbody>
                {s1256Trades.map((x, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...cell, fontWeight: 700 }}>{x.sym}</td>
                    <td style={{ ...cell, color: 'var(--text-2)' }}>{x.strat}</td>
                    <td style={{ ...numCell, fontWeight: 600, color: x.pl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmtSigned(x.pl)}</td>
                    <td style={{ ...numCell, color: 'var(--text-2)' }}>{fmtSigned(Math.round(ltOf(x.pl)))}</td>
                    <td style={{ ...numCell, color: 'var(--text-2)' }}>{fmtSigned(Math.round(stOf(x.pl)))}</td>
                  </tr>
                ))}
                {s1256Trades.length > 0 && (
                  <tr style={{ borderTop: '1.5px solid var(--border-2)' }}>
                    <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Total §1256</td>
                    <td style={{ ...numCell, fontWeight: 700, color: s1256PL >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmtSigned(s1256PL)}</td>
                    <td style={{ ...numCell, fontWeight: 700 }}>{fmtSigned(Math.round(ltOf(s1256PL)))}</td>
                    <td style={{ ...numCell, fontWeight: 700 }}>{fmtSigned(Math.round(stOf(s1256PL)))}</td>
                  </tr>
                )}
                {s1256Trades.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No §1256 contracts detected</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* wash sales */}
        <div className="panel" style={{ borderRadius: 9 }}>
          <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Wash-Sale Flags</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Losses disallowed when repurchased within 30 days</div>
            </div>
            <span className="pill pill-expired"><Icon name="flag" size={11} /> {washCandidates.length}</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {washCandidates.map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 8, background: 'var(--neg-wash)' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 auto' }}>{x.sym}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{x.strat} · {x.exp}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Repurchased within 30 days — loss deferred</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(x.pl)}</span>
              </div>
            ))}
            {washCandidates.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>No wash-sale candidates detected</div>
            )}
          </div>
        </div>
      </div>

      {/* brackets */}
      <div className="panel" style={{ borderRadius: 9, flex: '0 0 auto' }}>
        <div style={{ padding: '13px 14px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Estimated Ordinary-Income Brackets</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Short-term gains stack on top of your ordinary income. Marginal bracket assumed at 24%.</div>
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
          {brackets.map((b, i) => (
            <div key={i} style={{
              flex: 1, padding: '11px 12px', borderRadius: 8, textAlign: 'center',
              background: i === marginalIdx ? 'var(--accent-wash)' : 'var(--inset)',
              border: i === marginalIdx ? '1px solid var(--accent-soft)' : '1px solid transparent',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: i === marginalIdx ? 'var(--accent)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{b.rate}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>≤ {b.upto}</div>
              {i === marginalIdx && <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>You</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
