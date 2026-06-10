'use client';

import { sampleSymbols } from '@/lib/sampleData';

interface WinRateBarsProps {
  width?: number;
  height?: number;
  data?: { sym: string; rate: number; n: number }[];
}

export function WinRateBars({ width = 460, height = 200, data = sampleSymbols }: WinRateBarsProps) {
  const plotH = height - 16;
  const rowH = plotH / data.length;
  const barH = Math.min(13, rowH * 0.5);
  const labelW = 42, valW = 38, padR = 6;
  const trackX = labelW, trackW = width - labelW - valW - padR;
  const refX = trackX + trackW * 0.5;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <line x1={refX} x2={refX} y1={4} y2={plotH} style={{ stroke: 'var(--axis)' }} strokeWidth="1" strokeDasharray="3 3" />
      <text x={refX} y={height - 2} textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 9 }}>50%</text>
      {data.map((d, i) => {
        const cy = rowH * i + rowH / 2;
        const w = trackW * (d.rate / 100);
        const good = d.rate >= 50;
        return (
          <g key={i}>
            <text x={labelW - 9} y={cy + 3.5} textAnchor="end" style={{ fill: 'var(--text-1)', fontSize: 11, fontWeight: 600 }}>{d.sym}</text>
            <rect x={trackX} y={cy - barH / 2} width={trackW} height={barH} rx={barH / 2} style={{ fill: 'var(--inset)' }} />
            <rect x={trackX} y={cy - barH / 2} width={Math.max(w, barH)} height={barH} rx={barH / 2}
              style={{ fill: good ? 'var(--pos-soft)' : 'var(--neg-soft)' }} />
            <text x={trackX + trackW + padR} y={cy + 3.5} textAnchor="end"
              style={{ fill: 'var(--text-2)', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d.rate}%</text>
          </g>
        );
      })}
    </svg>
  );
}
