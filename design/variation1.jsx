/* variation1.jsx — "Classic Terminal": left sidebar, KPI row, 2×2 chart grid, trades strip. */

const { OTT: D1 } = window;

function V1Panel({ title, sub, right, children, style, bodyStyle }) {
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <div className="panel-hd">
        <div>
          <div className="panel-title">{title}</div>
          {sub && <div className="panel-sub" style={{ marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding: '12px 16px 16px', flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function V1Nav() {
  const items = [
    { icon: 'grid', label: 'Dashboard', on: true },
    { icon: 'table', label: 'Trades' },
    { icon: 'tax', label: 'Tax Exposure' },
    { icon: 'upload', label: 'Import CSV' },
  ];
  return (
    <aside style={{ width: 212, flex: '0 0 auto', background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '18px 14px' }}>
      <div style={{ padding: '0 6px 22px' }}><Logo /></div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((it) => (
          <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
            fontSize: 13, fontWeight: it.on ? 600 : 500,
            color: it.on ? 'var(--text-1)' : 'var(--text-2)',
            background: it.on ? 'var(--inset)' : 'transparent' }}>
            <span style={{ color: it.on ? 'var(--accent)' : 'var(--text-3)' }}><Icon name={it.icon} size={17} /></span>
            {it.label}
          </div>
        ))}
      </nav>
      <div style={{ marginTop: 14, padding: '12px', borderRadius: 10, background: 'var(--inset)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Account Equity</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-1)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>$158,420</div>
        <div style={{ marginTop: 3 }}><Delta value={18.6} /> <span style={{ fontSize: 11, color: 'var(--text-3)' }}>YTD</span></div>
      </div>
      <div style={{ flex: 1 }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, fontWeight: 500 }}>
        <Icon name="gear" size={17} /> Settings
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px 2px', marginTop: 4, borderTop: '1px solid var(--border)' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-wash)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>JM</div>
        <div style={{ lineHeight: 1.2, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>J. Morgan</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Schwab ··4821</div>
        </div>
      </div>
    </aside>
  );
}

function V1Topbar() {
  return (
    <header style={{ height: 58, flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px' }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.2px' }}>Dashboard</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Last import · Jun 7, 2026 · 2:14 PM</div>
      </div>
      <div style={{ flex: 1 }}></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', minWidth: 210 }}>
        <Icon name="search" size={15} />
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Search symbol…</span>
      </div>
      <div className="seg">
        <button>1M</button><button>3M</button><button className="on">YTD</button><button>1Y</button><button>All</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}><Icon name="bell" size={16} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 8, background: 'var(--text-1)', color: 'var(--surface)', fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="upload" size={14} /> Import
        </div>
      </div>
    </header>
  );
}

function Variation1() {
  const k = D1.kpis;
  return (
    <div className="dash" style={{ display: 'flex' }}>
      <V1Nav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <V1Topbar />
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', gap: 12 }}>
            <KpiCard label="Net Realized P&L" value={D1.fmtSigned(k.netPL)} tone="pos" big
              sub={`Gross +$41,960 · −$17,112`} spark={D1.cumulative} sparkColor="var(--pos-soft)" />
            <KpiCard label="Win Rate" value={k.winRate + '%'} sub="96 of 142 closed" icon="spark" />
            <KpiCard label="Profit Factor" value={k.profitFactor.toFixed(2)} sub="Gross win / loss" icon="shield" />
            <KpiCard label="Open Positions" value={k.openTrades} sub="$38.2k at risk" icon="dot" />
            <KpiCard label="Commissions" value={D1.fmtUSD(k.commissions)} tone="neg" sub="142 fills · $9.04 avg" icon="tax" />
          </div>
          {/* chart row A */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, flex: '0 0 auto' }}>
            <V1Panel title="Monthly Realized P&L" sub="Trailing 12 months"
              right={<span className="chip"><Icon name="calendar" size={12} /> Monthly</span>} style={{ height: 244 }}>
              <MonthlyBars width={620} height={186} />
            </V1Panel>
            <V1Panel title="Strategy Breakdown" sub="Share of realized P&L" style={{ height: 244 }}
              bodyStyle={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <StrategyDonut size={150} thickness={24} />
              <div style={{ flex: 1 }}><DonutLegend /></div>
            </V1Panel>
          </div>
          {/* chart row B */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, flex: '0 0 auto' }}>
            <V1Panel title="Cumulative P&L" sub="YTD equity curve"
              right={<Delta value={18.6} />} style={{ height: 244 }}>
              <CumulativeLine width={620} height={188} />
            </V1Panel>
            <V1Panel title="Win Rate by Symbol" sub="Top 6 by volume" style={{ height: 244 }}>
              <WinRateBars width={400} height={186} />
            </V1Panel>
          </div>
          {/* trades strip */}
          <V1Panel title="Recent Trades" sub="142 closed · 11 open"
            right={<span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>View all <Icon name="chevRight" size={13} /></span>}
            style={{ flex: 1, minHeight: 0 }} bodyStyle={{ padding: '2px 4px 4px' }}>
            <TradesTable rows={D1.trades.slice(0, 5)} dense />
          </V1Panel>
        </div>
      </div>
    </div>
  );
}

window.Variation1 = Variation1;
