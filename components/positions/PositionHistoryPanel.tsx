'use client';

import { useEffect, useState } from 'react';
import type { OpenRow } from '@/lib/openAnalytics';
import { getPositionHistory } from '@/actions/fetchPositionHistory';
import { rangePercentile, summarizeHistory, type SnapshotPoint } from '@/lib/positionHistory';
import { PositionHistoryLine } from '@/components/charts/PositionHistoryLine';
import { fmtSigned, fmtUSD } from '@/lib/formatters';
import { Icon } from '@/components/shared/Icon';

const plColor = (n: number) => (n >= 0 ? 'var(--pos)' : 'var(--neg)');

// 74 → "74th", 21 → "21st", 42 → "42nd"…
function ordinal(n: number): string {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
}

interface PositionHistoryPanelProps {
  row: OpenRow;
  positionKey: string;
  onClose: () => void;
}

export function PositionHistoryPanel({ row, positionKey, onClose }: PositionHistoryPanelProps) {
  const [points, setPoints] = useState<SnapshotPoint[] | null>(null); // null = loading

  useEffect(() => {
    let live = true;
    setPoints(null);
    getPositionHistory(positionKey).then((p) => { if (live) setPoints(p); });
    return () => { live = false; };
  }, [positionKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = row.trade;
  // Live unrealized P&L when a mark resolved this session; otherwise the
  // most recent snapshot stands in as "current".
  const current = row.unrealizedPl ?? (points && points.length ? points[points.length - 1].unrealizedPl : null);
  const stats = points ? summarizeHistory(points) : null;
  const pctile = points && current != null ? rangePercentile(current, points.map((p) => p.unrealizedPl)) : null;

  return (
    <>
      <div className="slideout-backdrop" onClick={onClose} />
      <div className="slideout" role="dialog" aria-label={`${t.sym} position history`}>
        {/* header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px' }}>
              {t.sym} <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{t.strike} · {t.exp}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {t.strat} · {row.isShort ? 'short' : 'long'} · {t.qty} contract{t.qty !== 1 ? 's' : ''}
              {row.mark != null && <> · mark {fmtUSD(row.mark)}</>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'var(--inset)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', flex: '0 0 auto' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* headline: current P&L + percentile of range */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>P&L Since Open</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', color: current != null ? plColor(current) : 'var(--text-3)', marginTop: 2 }}>
              {current != null ? fmtSigned(current) : '—'}
            </div>
            {pctile != null && (
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{ordinal(pctile)} percentile</span> of its tracked history
              </div>
            )}
          </div>

          {/* chart / loading / empty */}
          {points === null ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>Loading history…</div>
          ) : points.length < 2 ? (
            <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--inset)', borderRadius: 9, padding: 18, textAlign: 'center' }}>
              <Icon name="calendar" size={20} style={{ color: 'var(--text-3)' }} />
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>History builds up as daily snapshots accumulate.</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{points.length === 1 ? '1 day tracked so far — the chart appears from day 2.' : 'First snapshot lands after the next market close.'}</div>
            </div>
          ) : (
            <div>
              <PositionHistoryLine points={points} />
            </div>
          )}

          {/* stats row */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {([
                ['Best Day', fmtSigned(stats.best.pl), plColor(stats.best.pl), stats.best.date],
                ['Worst Day', fmtSigned(stats.worst.pl), plColor(stats.worst.pl), stats.worst.date],
                ['Days Tracked', String(stats.daysTracked), 'var(--text-1)', ''],
              ] as [string, string, string, string][]).map(([label, value, color, sub]) => (
                <div key={label} className="panel" style={{ borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  {sub && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
