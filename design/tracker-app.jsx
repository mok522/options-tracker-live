/* tracker-app.jsx — app shell: theme, tab routing, persistence.
   Dashboard view lives here; Trades / Tax / Import come from views.jsx.
   Reuses charts.jsx + shared.jsx atoms from window. */

const { OTT: A } = window;
const { useState, useEffect, useMemo } = React;

// ── theme hook ──────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('ott-theme') === 'dark'; } catch (e) { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('ott-theme', dark ? 'dark' : 'light'); } catch (e) {}
  }, [dark]);
  return [dark, setDark];
}

// ── shared shell atoms (exported for views.jsx) ─────────────
function Panel({ title, sub, right, children, style, bodyStyle, pad = '10px 13px 13px' }) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', borderRadius: 9, minHeight: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px 0', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.1px', whiteSpace: 'nowrap' }}>{title}</span>
            {sub && <span style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap', fontWeight: 450 }}>{sub}</span>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: pad, flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function Tile({ label, value, tone, delta, spark, sparkColor }) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ borderRadius: 9, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: c, letterSpacing: '-0.3px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
        {spark ? <MiniSpark data={spark} color={sparkColor || 'var(--pos-soft)'} width={52} height={20} />
          : delta != null ? <Delta value={delta} /> : null}
      </div>
    </div>
  );
}

function Topbar({ dark, setDark, tab, setTab }) {
  const tabs = ['Dashboard', 'Trades', 'Tax Exposure', 'Import'];
  const quote = (sym, px, chg) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>{sym}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{px}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: chg >= 0 ? 'var(--pos)' : 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>{chg >= 0 ? '+' : '\u2212'}{Math.abs(chg)}%</span>
    </div>
  );
  return (
    <header style={{ height: 50, flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px' }}>
      <Logo compact />
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ font: 'inherit', cursor: 'pointer', border: 0,
            fontSize: 12.5, fontWeight: tab === t ? 600 : 500, padding: '6px 11px', borderRadius: 7,
            color: tab === t ? 'var(--text-1)' : 'var(--text-2)', background: tab === t ? 'var(--inset)' : 'transparent' }}>{t}</button>
        ))}
      </div>
      <div style={{ width: 1, height: 18, background: 'var(--border)' }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {quote('SPX', '5,431.20', 0.4)}{quote('NDX', '19,284.6', 0.6)}{quote('VIX', '13.84', -2.1)}
      </div>
      <div style={{ flex: 1 }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos-soft)' }}></span> Synced 2:14 PM
      </div>
      <button onClick={() => setDark((d) => !d)} title="Toggle theme" style={{ font: 'inherit', cursor: 'pointer',
        width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
        color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {dark
          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>}
      </button>
      <button onClick={() => setTab('Import')} style={{ font: 'inherit', cursor: 'pointer', border: 0, display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 13px', borderRadius: 8, background: 'var(--text-1)', color: 'var(--surface)', fontSize: 12.5, fontWeight: 600 }}>
        <Icon name="upload" size={14} /> Import CSV
      </button>
      <div style={{ width: 31, height: 31, borderRadius: 8, background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>JM</div>
    </header>
  );
}

// ── Dashboard view ──────────────────────────────────────────
function DashboardView({ trades, setTab, lastImport }) {
  const k = A.kpis, t = A.tax;
  return (
    <div style={{ flex: 1, padding: 13, display: 'flex', flexDirection: 'column', gap: 11, overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '208px minmax(0,1fr) 312px', gap: 11, minHeight: 0 }}>
        {/* left stat rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 0 }}>
          <Tile label="Net Realized P&L" value={A.fmtSigned(k.netPL)} tone="pos" spark={A.cumulative} />
          <Tile label="Win Rate" value={k.winRate + '%'} delta={k.winRateDelta} />
          <Tile label="Profit Factor" value={k.profitFactor.toFixed(2)} />
          <Tile label="Avg / Trade" value={A.fmtSigned(k.avgTrade)} tone="pos" />
          <Tile label="Open Positions" value={k.openTrades} />
          <Tile label="Commissions YTD" value={A.fmtUSD(k.commissions)} tone="neg" />
          <Panel title="Tax Exposure" sub="est." style={{ flex: 1 }} pad="8px 13px 11px"
            bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 7, justifyContent: 'center' }}>
            {[['Short-term', A.fmtUSD(t.shortTerm)], ['Long-term', A.fmtUSD(t.longTerm)], ['\u00A71256 60/40', A.fmtUSD(t.s1256)]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{l}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
            <button onClick={() => setTab('Tax Exposure')} style={{ marginTop: 4, font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', padding: 0, textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--accent)' }}>
              View tax report <Icon name="chevRight" size={12} />
            </button>
          </Panel>
        </div>
        {/* center charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 0 }}>
          <Panel title="Cumulative Realized P&L" sub="YTD" style={{ flex: 1.42 }} right={<Delta value={18.6} />}>
            <CumulativeLine width={640} height={206} />
          </Panel>
          <Panel title="Monthly Realized P&L" sub="trailing 12 mo" style={{ flex: 1 }}>
            <MonthlyBars width={640} height={150} />
          </Panel>
        </div>
        {/* right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, minHeight: 0 }}>
          <Panel title="Strategy Mix" sub="of P&L" style={{ flex: 1 }}
            bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, justifyContent: 'center' }}>
            <StrategyDonut size={130} thickness={21} />
            <div style={{ width: '100%' }}><DonutLegend /></div>
          </Panel>
          <Panel title="Win Rate by Symbol" sub="top 6" style={{ flex: 1 }}>
            <WinRateBars width={286} height={158} />
          </Panel>
        </div>
      </div>
      {/* recent trades */}
      <Panel title="Recent Trades" sub={`${k.closedTrades} closed \u00B7 ${k.openTrades} open`}
        right={<button onClick={() => setTab('Trades')} style={{ font: 'inherit', cursor: 'pointer', border: 0, background: 'transparent', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>View all trades <Icon name="chevRight" size={13} /></button>}
        style={{ flex: '0 0 auto', height: 220 }} pad="0 6px 4px">
        <div style={{ height: '100%', overflowY: 'auto' }}><TradesTable rows={trades.slice(0, 6)} dense /></div>
      </Panel>
    </div>
  );
}

// ── App shell ───────────────────────────────────────────────
function TrackerApp() {
  const [dark, setDark] = useTheme();
  const [tab, setTab] = useState('Dashboard');
  const [trades, setTrades] = useState(() => {
    try { const s = localStorage.getItem('ott-trades'); if (s) return JSON.parse(s); } catch (e) {}
    return A.trades;
  });
  const [lastImport, setLastImport] = useState(() => {
    try { return localStorage.getItem('ott-last-import') || 'Jun 7, 2026 · 2:14 PM'; } catch (e) { return 'Jun 7, 2026 · 2:14 PM'; }
  });

  const onImport = (newTrades) => {
    const list = newTrades && newTrades.length ? newTrades : A.trades;
    setTrades(list);
    const now = new Date();
    const stamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' \u00B7 ' +
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setLastImport(stamp);
    try { localStorage.setItem('ott-trades', JSON.stringify(list)); localStorage.setItem('ott-last-import', stamp); } catch (e) {}
    setTab('Dashboard');
  };

  const view = () => {
    if (tab === 'Trades') return <TradesView trades={trades} />;
    if (tab === 'Tax Exposure') return <TaxView trades={trades} />;
    if (tab === 'Import') return <ImportView onImport={onImport} lastImport={lastImport} />;
    return <DashboardView trades={trades} setTab={setTab} lastImport={lastImport} />;
  };

  return (
    <div className="dash" style={{ display: 'flex', flexDirection: 'column' }}>
      <Topbar dark={dark} setDark={setDark} tab={tab} setTab={setTab} />
      {view()}
    </div>
  );
}

Object.assign(window, { Panel, Tile });
window.TrackerApp = TrackerApp;
