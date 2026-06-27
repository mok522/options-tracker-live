'use client';

import { sampleMonthly } from '@/lib/sampleData';
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

interface MonthlyBarsProps {
  width?: number;
  height?: number;
  data?: { m: string; pl: number }[];
}

export function MonthlyBars({ width = 460, height = 200, data = sampleMonthly }: MonthlyBarsProps) {
  const padL = 34, padR = 10, padT = 14, padB = 22;
  const W = width, H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  const vals = data.map((d) => d.pl);
  const maxV = Math.max(...vals, 0), minV = Math.min(...vals, 0);
  const ticks = niceTicks(minV, maxV, 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const span = (hi - lo) || 1; // flat data → avoid divide-by-zero
  const yv = (v: number) => padT + ih - ((v - lo) / span) * ih;
  const zeroY = yv(0);
  const bw = iw / (data.length || 1);
  const barW = Math.min(26, bw * 0.56);
  const lastIdx = data.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={yv(t)} y2={yv(t)}
            style={{ stroke: t === 0 ? 'var(--axis)' : 'var(--grid)' }} strokeWidth="1" />
          <text x={padL - 7} y={yv(t) + 3} textAnchor="end"
            style={{ fill: 'var(--text-3)', fontSize: 9.5, fontVariantNumeric: 'tabular-nums' }}>{kFmt(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + bw * i + bw / 2;
        const top = d.pl >= 0 ? yv(d.pl) : zeroY;
        const h = Math.abs(yv(d.pl) - zeroY);
        const pos = d.pl >= 0;
        const isLast = i === lastIdx;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(h, 1)} rx={3}
              style={{ fill: pos ? 'var(--pos-soft)' : 'var(--neg-soft)', opacity: isLast ? 1 : 0.85 }} />
            <text x={cx} y={H - 7} textAnchor="middle"
              style={{ fill: isLast ? 'var(--text-1)' : 'var(--text-3)', fontSize: 9.5, fontWeight: isLast ? 600 : 450 }}>{d.m}</text>
          </g>
        );
      })}
      {(() => {
        const d = data[lastIdx];
        const cx = padL + bw * lastIdx + bw / 2;
        const ty = yv(d.pl) - 30;
        const label = fmtSigned(d.pl);
        const tw = label.length * 6.2 + 14;
        return (
          <g>
            <rect x={Math.min(cx - tw / 2, W - tw)} y={ty} width={tw} height={20} rx={5}
              style={{ fill: 'var(--text-1)' }} />
            <text x={Math.min(cx, W - tw / 2)} y={ty + 13.5} textAnchor="middle"
              style={{ fill: 'var(--surface)', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{label}</text>
          </g>
        );
      })()}
    </svg>
  );
}
