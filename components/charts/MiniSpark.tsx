'use client';

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

interface MiniSparkProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function MiniSpark({ data, color = 'var(--pos-soft)', width = 72, height = 26 }: MiniSparkProps) {
  const min = Math.min(...data), max = Math.max(...data);
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const pts: [number, number][] = data.map((v, i) => [x(i), y(v)]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <path d={smoothPath(pts)} fill="none" style={{ stroke: color }} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(data[data.length - 1])} r="2.2" style={{ fill: color }} />
    </svg>
  );
}
