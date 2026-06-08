/* variation2.jsx — "Curve-Forward": horizontal nav, ticker stat bar,
   full-width cumulative hero, 3-up secondary charts. */

const { OTT: D2 } = window;

function V2Panel({ title, sub, right, children, style, bodyStyle }) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {title && (
        <div className="panel-hd">
          <div>
            <div className="panel-title">{title}</div>
            {sub && <div className="panel-sub" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: '12px 16px 16px', flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function V2Topnav() {
  const tabs = ['Dashboard', 'Trades', 'Tax Exposure', 'Import'];
  return (
    <header style={{ height: 56, flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px' }}>
      <Logo />
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%' }}>
        {tabs.map((t, i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 12px',
            fontSize: 13, fontWeight: i === 0 ? 600 : 500,
            color: i === 0 ? 'var(--text-1)' : 'var(--text-2)',
            borderBottom: i === 0 ? '2px solid var(--accent)' : '2px solid transparent' }}>{t}</div>
        ))}
      </nav>
      <div style={{ flex: 1 }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', width: 200 }}>
        <Icon name="search" size={15} /><span style={{ fontSize: 12.5 }}>Search…</span>
      </div>
      <div className="seg"><button>3M</button><button className="on">YTD</button><button>1Y</button></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 8, background: 'var(--text-1)', color: 'var(--surface)', fontSize: 12.5, fontWeight: 600 }}>
        <Icon name="upload" size={14} /> Import CSV
      </div>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>JM</div>
    </header>
  );
}

function TickerStat({ label, value, tone, delta, last }) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 22px', borderRight: last ? 'none' : '1px solid var(--border)', flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 21, fontWeight: 700, color: c, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
        {delta != null && <Delta value={delta} />}
      </div>
    </div>
  );
}

function Variation2() {
  const k = D2.kpis;
  return (
    <div className="dash" style={{ display: 'flex', flexDirection: 'column' }}>
      <V2Topnav />
      <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        {/* ticker stat bar */}
        <div className="panel" style={{ display: 'flex', alignItems: 'center', padding: '16px 4px' }}>
          <TickerStat label="Net Realized P&L" value={D2.fmtSigned(k.netPL)} tone="pos" delta={18.6} />
          <TickerStat label="Win Rate" value={k.winRate + '%'} delta={k.winRateDelta} />
          <TickerStat label="Profit Factor" value={k.profitFactor.toFixed(2)} />
          <TickerStat label="Avg / Trade" value={D2.fmtSigned(k.avgTrade)} tone="pos" />
          <TickerStat label="Open Positions" value={k.openTrades} />
          <TickerStat label="Commissions" value={D2.fmtUSD(k.commissions)} tone="neg" last />
        </div>

        {/* hero: cumulative curve + side highlights */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.62fr 1fr', gap: 14, flex: '0 0 auto' }}>
          <V2Panel title="Cumulative Realized P&L" sub="January – June 2026 · year to date"
            right={<div style={{ display: 'flex', gap: 7 }}><span className="chip" style={{ color: 'var(--pos)', borderColor: 'var(--pos-soft)' }}><Icon name="arrowUp" size={12} /> {D2.fmtSigned(k.netPL)}</span></div>}
            style={{ height: 318 }}>
            <CumulativeLine width={760} height={250} />
          </V2Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <V2Panel title="This Month" sub="June 2026" style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--pos)', letterSpacing: '-0.6px', fontVariantNumeric: 'tabular-nums' }}>+$5,107</span>
                <Delta value={28.5} />
              </div>
              <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
                <div><div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Trades</div><div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>17</div></div>
                <div><div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Win Rate</div><div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>71%</div></div>
                <div><div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 600 }}>Fees</div><div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>−$154</div></div>
              </div>
            </V2Panel>
            <V2Panel title="Best & Worst" style={{ flex: 1 }} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--pos-wash)', color: 'var(--pos)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{k.bestSym}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Covered Call · Apr</span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--pos)', fontVariantNumeric: 'tabular-nums' }}>{D2.fmtSigned(k.bestTrade)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--border)' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--neg-wash)', color: 'var(--neg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{k.worstSym}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Long Call · Mar</span>
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>{D2.fmtSigned(k.worstTrade)}</span>
              </div>
            </V2Panel>
          </div>
        </div>

        {/* 3-up secondary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          <V2Panel title="Monthly P&L" sub="Trailing 12 mo">
            <MonthlyBars width={400} height={172} />
          </V2Panel>
          <V2Panel title="Strategy Mix" sub="By realized P&L" bodyStyle={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <StrategyDonut size={132} thickness={22} />
            <div style={{ flex: 1 }}><DonutLegend metric="pl" /></div>
          </V2Panel>
          <V2Panel title="Win Rate by Symbol" sub="Top 6 by volume">
            <WinRateBars width={400} height={172} />
          </V2Panel>
        </div>
      </div>
    </div>
  );
}

window.Variation2 = Variation2;
