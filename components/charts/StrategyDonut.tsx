'use client';

import { sampleStrategies } from '@/lib/sampleData';
import { fmtSigned } from '@/lib/formatters';

interface StrategyItem {
  name: string;
  pct: number;
  pl: number;
  varName: string;
}

interface StrategyDonutProps {
  size?: number;
  data?: StrategyItem[];
  thickness?: number;
}

export function StrategyDonut({ size = 168, data = sampleStrategies, thickness = 26 }: StrategyDonutProps) {
  const r = size / 2, ir = r - thickness, cx = r, cy = r;
  let a0 = -Math.PI / 2;
  const gap = 0.035;
  const arcs = data.map((d) => {
    const sweep = (d.pct / 100) * Math.PI * 2;
    const s = a0 + gap / 2, e = a0 + sweep - gap / 2;
    a0 += sweep;
    const large = e - s > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number): [number, number] => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
    const [x1, y1] = p(s, r), [x2, y2] = p(e, r);
    const [x3, y3] = p(e, ir), [x4, y4] = p(s, ir);
    return { d, path: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${large} 0 ${x4} ${y4} Z` };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
      {arcs.map((a, i) => <path key={i} d={a.path} style={{ fill: `var(${a.d.varName})` }} />)}
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: 'var(--text-1)', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data.length}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 10, fontWeight: 500, letterSpacing: '0.3px' }}>STRATEGIES</text>
    </svg>
  );
}

interface DonutLegendProps {
  data?: StrategyItem[];
  metric?: 'pct' | 'pl';
}

export function DonutLegend({ data = sampleStrategies, metric = 'pct' }: DonutLegendProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: `var(${d.varName})`, flex: '0 0 auto' }}></span>
          <span style={{ color: 'var(--text-2)', flex: 1, whiteSpace: 'nowrap' }}>{d.name}</span>
          <span style={{ color: 'var(--text-1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {metric === 'pct' ? d.pct + '%' : fmtSigned(d.pl)}
          </span>
        </div>
      ))}
    </div>
  );
}
