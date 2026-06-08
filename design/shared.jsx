/* shared.jsx — UI atoms reused across the three dashboard layouts. */

const { OTT: D } = window;

// ── icon set (1.6 stroke line icons) ────────────────────────
function Icon({ name, size = 16, stroke = 1.7, style }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { display: 'block', ...style } };
  const paths = {
    grid:    <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    table:   <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/></>,
    tax:     <><path d="M9 7h6M9 12h6M9 17h3"/><rect x="4" y="3" width="16" height="18" rx="2"/></>,
    upload:  <><path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>,
    search:  <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
    bell:    <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></>,
    gear:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.86 1.2 1.4 2.1 1.4H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    arrowUp: <><path d="M12 19V5M6 11l6-6 6 6"/></>,
    chevDown:<><path d="M6 9l6 6 6-6"/></>,
    chevRight:<><path d="M9 6l6 6-6 6"/></>,
    calendar:<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>,
    filter:  <><path d="M3 5h18M6 12h12M10 19h4"/></>,
    download:<><path d="M12 4v11M8 11l4 4 4-4"/><path d="M4 20h16"/></>,
    flag:    <><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></>,
    shield:  <><path d="M12 3l8 3v6c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6z"/></>,
    spark:   <><path d="M3 13l4-4 4 3 6-7"/><path d="M17 5h4v4"/></>,
    dot:     <circle cx="12" cy="12" r="3"/>,
  };
  return <svg {...p}>{paths[name]}</svg>;
}

// ── wordmark ────────────────────────────────────────────────
function Logo({ compact = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
          <path d="M3 16l5-6 4 3 7-9" stroke="var(--pos-soft)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="19" cy="4" r="2" fill="var(--pos-soft)"/>
        </svg>
      </div>
      {!compact && (
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text-1)' }}>Tradesheet</div>
          <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '0.4px', color: 'var(--text-3)', textTransform: 'uppercase' }}>Options Tracker</div>
        </div>
      )}
    </div>
  );
}

// ── status pill ─────────────────────────────────────────────
function StatusPill({ status }) {
  const cls = { Open: 'pill-open', Closed: 'pill-closed', Expired: 'pill-expired', Assigned: 'pill-assigned' }[status] || 'pill-closed';
  return <span className={`pill ${cls}`}>{status}</span>;
}

// ── KPI card ────────────────────────────────────────────────
function KpiCard({ label, value, sub, tone = 'neutral', spark, sparkColor, big = false, icon }) {
  const valColor = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ padding: big ? '18px 18px 16px' : '14px 15px', display: 'flex', flexDirection: 'column', gap: big ? 10 : 7, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', letterSpacing: '0.2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
        {icon && <span style={{ color: 'var(--text-faint)' }}><Icon name={icon} size={14} /></span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: big ? 30 : 22, fontWeight: 700, letterSpacing: '-0.5px', color: valColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
        {spark && <MiniSpark data={spark} color={sparkColor || 'var(--pos-soft)'} width={big ? 86 : 64} height={big ? 30 : 24} />}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 450 }}>{sub}</div>}
    </div>
  );
}

// ── delta badge ─────────────────────────────────────────────
function Delta({ value, suffix = '%', invert = false }) {
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 600,
      color: good ? 'var(--pos)' : 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? 'none' : 'rotate(180deg)' }}><path d="M12 19V5M6 11l6-6 6 6"/></svg>
      {Math.abs(value)}{suffix}
    </span>
  );
}

// ── trades table ────────────────────────────────────────────
function TradesTable({ rows = D.trades, dense = false, cols }) {
  const all = ['Symbol', 'Strategy', 'Side', 'Qty', 'Strike', 'Exp', 'Fill', 'P&L', 'Status'];
  const show = cols || all;
  const has = (c) => show.includes(c);
  const cell = { padding: dense ? '7px 12px' : '10px 14px', fontSize: 12, whiteSpace: 'nowrap' };
  const th = { ...cell, textAlign: 'left', fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', paddingTop: 9, paddingBottom: 9 };
  const numAlign = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {has('Symbol') && <th style={th}>Symbol</th>}
          {has('Strategy') && <th style={th}>Strategy</th>}
          {has('Side') && <th style={th}>Side</th>}
          {has('Qty') && <th style={{ ...th, ...numAlign }}>Qty</th>}
          {has('Strike') && <th style={th}>Strike</th>}
          {has('Exp') && <th style={th}>Exp</th>}
          {has('Fill') && <th style={{ ...th, ...numAlign }}>Fill</th>}
          {has('P&L') && <th style={{ ...th, ...numAlign }}>P&amp;L</th>}
          {has('Status') && <th style={{ ...th, textAlign: 'right' }}>Status</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {has('Symbol') && <td style={{ ...cell, fontWeight: 700, color: 'var(--text-1)' }}>{t.sym}</td>}
            {has('Strategy') && <td style={{ ...cell, color: 'var(--text-2)' }}>{t.strat}</td>}
            {has('Side') && <td style={cell}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.side === 'Buy' ? 'var(--accent)' : 'var(--text-2)' }}>{t.side}</span>
            </td>}
            {has('Qty') && <td style={{ ...cell, ...numAlign, color: 'var(--text-2)' }}>{t.qty}</td>}
            {has('Strike') && <td style={{ ...cell, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{t.strike}</td>}
            {has('Exp') && <td style={{ ...cell, color: 'var(--text-2)' }}>{t.exp}</td>}
            {has('Fill') && <td style={{ ...cell, ...numAlign, color: 'var(--text-2)' }}>{D.fmtNum(t.fill)}</td>}
            {has('P&L') && <td style={{ ...cell, ...numAlign, fontWeight: 700, color: t.pl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{D.fmtSigned(t.pl)}</td>}
            {has('Status') && <td style={{ ...cell, textAlign: 'right' }}><StatusPill status={t.status} /></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

Object.assign(window, { Icon, Logo, StatusPill, KpiCard, Delta, TradesTable });
