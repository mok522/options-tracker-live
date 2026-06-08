/* variation3.jsx — "Dense Bento": Bloomberg-style panelized grid.
   Stat rail + central charts + right rail + full trades table. */

const { OTT: D3 } = window;

function V3Panel({ title, sub, right, children, style, bodyStyle, pad = '10px 12px 12px' }) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', borderRadius: 8, minHeight: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.1px' }}>{title}</span>
            {sub && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{sub}</span>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: pad, flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function V3Tile({ label, value, tone, delta, invert, spark, sparkColor }) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: c, letterSpacing: '-0.3px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {spark ? <MiniSpark data={spark} color={sparkColor || 'var(--pos-soft)'} width={48} height={18} />
          : delta != null ? <Delta value={delta} invert={invert} /> : null}
      </div>
    </div>
  );
}

function V3Topbar() {
  const quote = (sym, px, chg) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{sym}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{px}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: chg >= 0 ? 'var(--pos)' : 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>{chg >= 0 ? '+' : '−'}{Math.abs(chg)}%</span>
    </div>
  );
  return (
    <header style={{ height: 46, flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px' }}>
      <Logo compact />
      <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {['Dashboard', 'Trades', 'Tax', 'Import'].map((t, i) => (
          <span key={t} style={{ fontSize: 12, fontWeight: i === 0 ? 600 : 500, padding: '5px 10px', borderRadius: 6,
            color: i === 0 ? 'var(--text-1)' : 'var(--text-2)', background: i === 0 ? 'var(--inset)' : 'transparent' }}>{t}</span>
        ))}
      </div>
      <div style={{ width: 1, height: 18, background: 'var(--border)' }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {quote('SPX', '5,431.20', 0.4)}
        {quote('NDX', '19,284.6', 0.6)}
        {quote('VIX', '13.84', -2.1)}
      </div>
      <div style={{ flex: 1 }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-3)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos-soft)' }}></span>
        Synced 2:14 PM
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 7, background: 'var(--text-1)', color: 'var(--surface)', fontSize: 12, fontWeight: 600 }}>
        <Icon name="upload" size={13} /> Import
      </div>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>JM</div>
    </header>
  );
}

function Variation3() {
  const k = D3.kpis, t = D3.tax;
  return (
    <div className="dash" style={{ display: 'flex', flexDirection: 'column' }}>
      <V3Topbar />
      <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        {/* upper region: 3 columns */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '202px 1fr 296px', gap: 10, minHeight: 0 }}>
          {/* left stat rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <V3Tile label="Net Realized P&L" value={D3.fmtSigned(k.netPL)} tone="pos" spark={D3.cumulative} sparkColor="var(--pos-soft)" />
            <V3Tile label="Win Rate" value={k.winRate + '%'} delta={k.winRateDelta} />
            <V3Tile label="Profit Factor" value={k.profitFactor.toFixed(2)} />
            <V3Tile label="Avg / Trade" value={D3.fmtSigned(k.avgTrade)} tone="pos" />
            <V3Tile label="Open Positions" value={k.openTrades} />
            <V3Tile label="Commissions YTD" value={D3.fmtUSD(k.commissions)} tone="neg" />
            {/* tax mini panel */}
            <V3Panel title="Tax Exposure" sub="est." style={{ flex: 1 }} pad="8px 12px 10px"
              bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-2)' }}>Short-term</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{D3.fmtUSD(t.shortTerm)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-2)' }}>§1256 (60/40)</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{D3.fmtUSD(t.s1256)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-2)' }}>Wash sales</span>
                <span className="pill pill-expired" style={{ fontSize: 10 }}><Icon name="flag" size={10} /> {t.washFlags} flags</span>
              </div>
            </V3Panel>
          </div>

          {/* center charts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <V3Panel title="Cumulative Realized P&L" sub="YTD" style={{ flex: 1.42 }}
              right={<Delta value={18.6} />}>
              <CumulativeLine width={620} height={210} />
            </V3Panel>
            <V3Panel title="Monthly Realized P&L" sub="trailing 12 mo" style={{ flex: 1 }}>
              <MonthlyBars width={620} height={150} />
            </V3Panel>
          </div>

          {/* right rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <V3Panel title="Strategy Mix" sub="of P&L" style={{ flex: 1 }}
              bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
              <StrategyDonut size={124} thickness={20} />
              <div style={{ width: '100%' }}><DonutLegend /></div>
            </V3Panel>
            <V3Panel title="Win Rate by Symbol" sub="top 6" style={{ flex: 1 }}>
              <WinRateBars width={272} height={158} />
            </V3Panel>
          </div>
        </div>

        {/* bottom: full trades table */}
        <V3Panel title="Recent Trades" sub="142 closed · 11 open"
          right={<div style={{ display: 'flex', gap: 6 }}>
            <span className="chip" style={{ fontSize: 10.5, padding: '3px 7px' }}><Icon name="filter" size={11} /> All status</span>
            <span className="chip" style={{ fontSize: 10.5, padding: '3px 7px' }}><Icon name="download" size={11} /> Export</span>
          </div>}
          style={{ flex: '0 0 auto', height: 196 }} pad="0 6px 4px">
          <TradesTable rows={D3.trades.slice(0, 6)} dense />
        </V3Panel>
      </div>
    </div>
  );
}

window.Variation3 = Variation3;
