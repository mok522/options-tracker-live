'use client';

import { sampleCumulative } from '@/lib/sampleData';
import { fmtSigned } from '@/lib/formatters';

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

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

interface CumulativeLineProps {
  width?: number;
  height?: number;
  data?: number[];
  showAxis?: boolean;
  labels?: string[];
}

export function CumulativeLine({ width = 480, height = 220, data = sampleCumulative, showAxis = true, labels }: CumulativeLineProps) {
  const padL = showAxis ? 38 : 8, padR = 12, padT = 16, padB = 20;
  const iw = width - padL - padR, ih = height - padT - padB;
  const maxV = Math.max(...data), minV = Math.min(...data, 0);
  const ticks = niceTicks(minV, maxV, 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const xv = (i: number) => padL + (i / (data.length - 1)) * iw;
  const yv = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const pts: [number, number][] = data.map((v, i) => [xv(i), yv(v)]);
  const line = smoothPath(pts);
  const area = `${line} L ${xv(data.length - 1)} ${yv(lo)} L ${xv(0)} ${yv(lo)} Z`;
  const last = data.length - 1;
  const endLabel = fmtSigned(data[last]);
  const gid = `cumgrad-${Math.round(width)}`;
  const months = labels ?? ['Jul', 'Sep', 'Nov', 'Jan', 'Mar', 'May'];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--pos-soft)', stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: 'var(--pos-soft)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={yv(t)} y2={yv(t)} style={{ stroke: 'var(--grid)' }} strokeWidth="1" />
          {showAxis && <text x={padL - 7} y={yv(t) + 3} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{kFmt(t)}</text>}
        </g>
      ))}
      {months.map((m, i) => (
        <text key={m} x={padL + (iw * i) / (months.length - 1)} y={height - 5} textAnchor="middle"
          style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{m}</text>
      ))}
      <path d={area} style={{ fill: `url(#${gid})` }} />
      <path d={line} fill="none" style={{ stroke: 'var(--pos-soft)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xv(last)} cy={yv(data[last])} r="3.5" style={{ fill: 'var(--pos-soft)' }} />
      <circle cx={xv(last)} cy={yv(data[last])} r="6.5" fill="none" style={{ stroke: 'var(--pos-soft)', opacity: 0.3 }} strokeWidth="2" />
      {(() => {
        const tw = endLabel.length * 6.4 + 16;
        const tx = Math.min(xv(last) - tw + 6, width - tw);
        const ty = yv(data[last]) - 28;
        return (
          <g>
            <rect x={tx} y={ty} width={tw} height={21} rx={5} style={{ fill: 'var(--text-1)' }} />
            <text x={tx + tw / 2} y={ty + 14} textAnchor="middle" style={{ fill: 'var(--surface)', fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{endLabel}</text>
          </g>
        );
      })()}
    </svg>
  );
}
