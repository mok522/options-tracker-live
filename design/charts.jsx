/* charts.jsx — clean static SVG charts. No interactivity; tooltips are
   "baked in" so they read as a live terminal. Colors come from CSS vars
   so they re-theme with light/dark. */

const { OTT } = window;

// ── helpers ─────────────────────────────────────────────────
function niceTicks(min, max, count) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + 1e-6; v += step) out.push(v);
  return out;
}
const kFmt = (n) => {
  const a = Math.abs(n);
  if (a >= 1000) return (n / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k';
  return String(n);
};
// Catmull-Rom → smooth path
function smoothPath(pts) {
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

// ── Monthly P&L bars ────────────────────────────────────────
function MonthlyBars({ width = 460, height = 200, data = OTT.monthly }) {
  const padL = 34, padR = 10, padT = 14, padB = 22;
  const W = width, H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  const vals = data.map((d) => d.pl);
  const maxV = Math.max(...vals, 0), minV = Math.min(...vals, 0);
  const ticks = niceTicks(minV, maxV, 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const zeroY = y(0);
  const bw = iw / data.length;
  const barW = Math.min(26, bw * 0.56);
  const lastIdx = data.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)}
            style={{ stroke: t === 0 ? 'var(--axis)' : 'var(--grid)' }} strokeWidth="1" />
          <text x={padL - 7} y={y(t) + 3} textAnchor="end"
            style={{ fill: 'var(--text-3)', fontSize: 9.5, fontVariantNumeric: 'tabular-nums' }}>{kFmt(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + bw * i + bw / 2;
        const top = d.pl >= 0 ? y(d.pl) : zeroY;
        const h = Math.abs(y(d.pl) - zeroY);
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
      {/* baked tooltip on last bar */}
      {(() => {
        const d = data[lastIdx];
        const cx = padL + bw * lastIdx + bw / 2;
        const ty = y(d.pl) - 30;
        const label = OTT.fmtSigned(d.pl);
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

// ── Strategy donut ──────────────────────────────────────────
function StrategyDonut({ size = 168, data = OTT.strategies, thickness = 26 }) {
  const r = size / 2, ir = r - thickness, cx = r, cy = r;
  let a0 = -Math.PI / 2;
  const gap = 0.035; // radians between segments
  const arcs = data.map((d) => {
    const sweep = (d.pct / 100) * Math.PI * 2;
    const s = a0 + gap / 2, e = a0 + sweep - gap / 2;
    a0 += sweep;
    const large = e - s > Math.PI ? 1 : 0;
    const p = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
    const [x1, y1] = p(s, r), [x2, y2] = p(e, r);
    const [x3, y3] = p(e, ir), [x4, y4] = p(s, ir);
    return { d, path: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${large} 0 ${x4} ${y4} Z` };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
      {arcs.map((a, i) => <path key={i} d={a.path} style={{ fill: `var(${a.d.varName})` }} />)}
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: 'var(--text-1)', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>5</text>
      <text x={cx} y={cy + 13} textAnchor="middle" style={{ fill: 'var(--text-3)', fontSize: 10, fontWeight: 500, letterSpacing: '0.3px' }}>STRATEGIES</text>
    </svg>
  );
}

function DonutLegend({ data = OTT.strategies, metric = 'pct' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: `var(${d.varName})`, flex: '0 0 auto' }}></span>
          <span style={{ color: 'var(--text-2)', flex: 1, whiteSpace: 'nowrap' }}>{d.name}</span>
          <span style={{ color: 'var(--text-1)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {metric === 'pct' ? d.pct + '%' : OTT.fmtSigned(d.pl)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Win rate by symbol (horizontal) ─────────────────────────
function WinRateBars({ width = 460, height = 200, data = OTT.symbols }) {
  const plotH = height - 16;            // reserve bottom strip for the 50% label
  const rowH = plotH / data.length;
  const barH = Math.min(13, rowH * 0.5);
  const labelW = 42, valW = 38, padR = 6;
  const trackX = labelW, trackW = width - labelW - valW - padR;
  const refX = trackX + trackW * 0.5; // 50% break-even
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
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

// ── Cumulative P&L line + area ──────────────────────────────
function CumulativeLine({ width = 480, height = 220, data = OTT.cumulative, showAxis = true }) {
  const padL = showAxis ? 38 : 8, padR = 12, padT = 16, padB = 20;
  const iw = width - padL - padR, ih = height - padT - padB;
  const maxV = Math.max(...data), minV = Math.min(...data, 0);
  const ticks = niceTicks(minV, maxV, 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x = (i) => padL + (i / (data.length - 1)) * iw;
  const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line} L ${x(data.length - 1)} ${y(lo)} L ${x(0)} ${y(lo)} Z`;
  const last = data.length - 1;
  const endLabel = OTT.fmtSigned(data[last]);
  const gid = 'cumgrad-' + Math.round(width);
  const months = ['Jul','Sep','Nov','Jan','Mar','May'];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--pos-soft)', stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: 'var(--pos-soft)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--grid)' }} strokeWidth="1" />
          {showAxis && <text x={padL - 7} y={y(t) + 3} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{kFmt(t)}</text>}
        </g>
      ))}
      {months.map((m, i) => (
        <text key={m} x={padL + (iw * i) / (months.length - 1)} y={height - 5} textAnchor="middle"
          style={{ fill: 'var(--text-3)', fontSize: 9.5 }}>{m}</text>
      ))}
      <path d={area} style={{ fill: `url(#${gid})` }} />
      <path d={line} fill="none" style={{ stroke: 'var(--pos-soft)' }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(data[last])} r="3.5" style={{ fill: 'var(--pos-soft)' }} />
      <circle cx={x(last)} cy={y(data[last])} r="6.5" fill="none" style={{ stroke: 'var(--pos-soft)', opacity: 0.3 }} strokeWidth="2" />
      {(() => {
        const tw = endLabel.length * 6.4 + 16, tx = Math.min(x(last) - tw + 6, width - tw), ty = y(data[last]) - 28;
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

// ── tiny sparkline for KPI cards ────────────────────────────
function MiniSpark({ width = 72, height = 26, data, color = 'var(--pos-soft)' }) {
  const min = Math.min(...data), max = Math.max(...data);
  const x = (i) => (i / (data.length - 1)) * width;
  const y = (v) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const pts = data.map((v, i) => [x(i), y(v)]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <path d={smoothPath(pts)} fill="none" style={{ stroke: color }} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(data[data.length - 1])} r="2.2" style={{ fill: color }} />
    </svg>
  );
}

Object.assign(window, { MonthlyBars, StrategyDonut, DonutLegend, WinRateBars, CumulativeLine, MiniSpark });
