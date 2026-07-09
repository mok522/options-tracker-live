'use client';

import { fmtSigned } from '@/lib/formatters';
import type { SnapshotPoint } from '@/lib/positionHistory';

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) out.push(v);
  return out;
}

const kFmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return (n / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k';
  return String(n);
};

// "2026-07-08" → "Jul 8"
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return m && d ? `${MON[m - 1]} ${d}` : ymd;
}

interface PositionHistoryLineProps {
  points: SnapshotPoint[]; // oldest first; caller guarantees length >= 2
  width?: number;
  height?: number;
}

export function PositionHistoryLine({ points, width = 560, height = 200 }: PositionHistoryLineProps) {
  const padL = 40, padR = 14, padT = 14, padB = 22;
  const iw = width - padL - padR, ih = height - padT - padB;
  const vals = points.map((p) => p.unrealizedPl);
  const ticks = niceTicks(Math.min(...vals, 0), Math.max(...vals, 0), 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const span = (hi - lo) || 1;
  const xv = (i: number) => padL + (i / (points.length - 1)) * iw;
  const yv = (v: number) => padT + ih - ((v - lo) / span) * ih;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xv(i)} ${yv(p.unrealizedPl)}`).join(' ');
  const last = points.length - 1;
  const tone = vals[last] >= 0 ? 'var(--pos-soft)' : 'var(--neg-soft)';
  const hiIdx = vals.indexOf(Math.max(...vals));
  const loIdx = vals.indexOf(Math.min(...vals));

  // x labels: first, middle, last date
  const labelIdxs = points.length >= 3 ? [0, Math.floor(last / 2), last] : [0, last];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={yv(t)} y2={yv(t)} style={{ stroke: 'var(--grid)' }} strokeWidth="1" />
          <text x={padL - 7} y={yv(t) + 3} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{kFmt(t)}</text>
        </g>
      ))}
      {/* zero line emphasised when the range crosses it */}
      {lo < 0 && hi > 0 && (
        <line x1={padL} x2={width - padR} y1={yv(0)} y2={yv(0)} style={{ stroke: 'var(--axis)' }} strokeWidth="1" />
      )}
      {labelIdxs.map((i) => (
        <text key={i} x={xv(i)} y={height - 5} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
          style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{shortDate(points[i].date)}</text>
      ))}
      <path d={line} fill="none" style={{ stroke: tone }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* high / low markers — P&L extremes, so pos/neg tokens */}
      <circle cx={xv(hiIdx)} cy={yv(vals[hiIdx])} r="3.5" style={{ fill: 'var(--pos)' }} />
      <circle cx={xv(loIdx)} cy={yv(vals[loIdx])} r="3.5" style={{ fill: 'var(--neg)' }} />
      {/* latest point + value tag */}
      <circle cx={xv(last)} cy={yv(vals[last])} r="3.5" style={{ fill: tone }} />
      {(() => {
        const label = fmtSigned(vals[last]);
        const tw = label.length * 6.4 + 16;
        const tx = Math.min(xv(last) - tw + 6, width - tw);
        const ty = Math.max(2, yv(vals[last]) - 28);
        return (
          <g>
            <rect x={tx} y={ty} width={tw} height={21} rx={5} style={{ fill: 'var(--text-1)' }} />
            <text x={tx + tw / 2} y={ty + 14} textAnchor="middle"
              style={{ fill: 'var(--surface)', fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{label}</text>
          </g>
        );
      })()}
    </svg>
  );
}
