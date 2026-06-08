/* views.jsx — Trades, Tax Exposure, and CSV Import views.
   Loaded before tracker-app.jsx; exports views to window. */

const { OTT: V } = window;
const VR = React;

// ── shared helpers ──────────────────────────────────────────
const S1256_SYMS = ['SPX', 'NDX', 'RUT', 'SPXW', 'XSP', 'VIX'];
const commOf = (t) => (t.comm != null ? t.comm : -(Math.round((t.qty * 0.66) * 100) / 100));
const isS1256 = (t) => S1256_SYMS.includes(t.sym);

function StatCard({ label, value, tone, hint }) {
  const c = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-1)';
  return (
    <div className="panel" style={{ borderRadius: 9, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: c, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{hint}</span>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  TRADES
// ════════════════════════════════════════════════════════════
function TradesView({ trades }) {
  const { useState, useMemo } = VR;
  const [status, setStatus] = useState('All');
  const [strat, setStrat] = useState('All');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'pl', dir: -1 });

  const strategies = useMemo(() => ['All', ...Array.from(new Set(trades.map((t) => t.strat)))], [trades]);

  const rows = useMemo(() => {
    let r = trades.filter((t) =>
      (status === 'All' || t.status === status) &&
      (strat === 'All' || t.strat === strat) &&
      (q.trim() === '' || t.sym.toLowerCase().includes(q.trim().toLowerCase())));
    const k = sort.key;
    r = [...r].sort((a, b) => {
      let av = a[k], bv = b[k];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); return av < bv ? -sort.dir : av > bv ? sort.dir : 0; }
      return (av - bv) * sort.dir;
    });
    return r;
  }, [trades, status, strat, q, sort]);

  const totalPL = rows.reduce((s, t) => s + t.pl, 0);
  const wins = rows.filter((t) => t.pl >= 0).length;
  const winRate = rows.length ? Math.round((wins / rows.length) * 100) : 0;
  const openCt = rows.filter((t) => t.status === 'Open').length;

  const setSortKey = (key) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'sym' || key === 'strat' ? 1 : -1 });
  const arrow = (key) => sort.key === key ? <span style={{ marginLeft: 3, color: 'var(--accent)' }}>{sort.dir === 1 ? '\u2191' : '\u2193'}</span> : null;

  const th = (key, label, align = 'left') => (
    <th onClick={() => setSortKey(key)} style={{ textAlign: align, padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: sort.key === key ? 'var(--text-1)' : 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.4px', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      {label}{arrow(key)}
    </th>
  );
  const td = { padding: '11px 14px', fontSize: 12.5, whiteSpace: 'nowrap' };
  const numTd = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'hidden' }}>
      {/* summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flex: '0 0 auto' }}>
        <StatCard label="Filtered P&L" value={V.fmtSigned(totalPL)} tone={totalPL >= 0 ? 'pos' : 'neg'} hint={`${rows.length} of ${trades.length} trades`} />
        <StatCard label="Win Rate" value={winRate + '%'} hint={`${wins} winners`} />
        <StatCard label="Open Positions" value={openCt} hint="in current filter" />
        <StatCard label="Avg / Trade" value={rows.length ? V.fmtSigned(Math.round(totalPL / rows.length)) : '—'} tone={totalPL >= 0 ? 'pos' : 'neg'} hint="realized" />
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <div className="seg">
          {['All', 'Open', 'Closed', 'Expired', 'Assigned'].map((o) => <button key={o} className={status === o ? 'on' : ''} onClick={() => setStatus(o)}>{o}</button>)}
        </div>
        <div style={{ position: 'relative' }}>
          <select value={strat} onChange={(e) => setStrat(e.target.value)} style={{ font: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', appearance: 'none',
            padding: '7px 28px 7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
            {strategies.map((s) => <option key={s} value={s}>{s === 'All' ? 'All strategies' : s}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}><Icon name="chevDown" size={14} /></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', width: 180 }}>
          <Icon name="search" size={14} style={{ color: 'var(--text-3)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol…" style={{ border: 0, outline: 'none', background: 'transparent', font: 'inherit', fontSize: 12, color: 'var(--text-1)', width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}></div>
        <button className="chip" style={{ cursor: 'pointer', gap: 6 }}><Icon name="download" size={13} /> Export CSV</button>
      </div>

      {/* table */}
      <div className="panel" style={{ borderRadius: 9, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{th('sym', 'Symbol')}{th('strat', 'Strategy')}{th('side', 'Side')}{th('qty', 'Qty', 'right')}<th style={{ ...thStatic }}>Strike</th>{th('exp', 'Exp')}{th('fill', 'Fill', 'right')}<th style={{ ...thStatic, textAlign: 'right' }}>Comm</th>{th('pl', 'P&L', 'right')}<th style={{ ...thStatic, textAlign: 'right' }}>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }} className="trow">
                  <td style={{ ...td, fontWeight: 700, color: 'var(--text-1)' }}>{t.sym} {isS1256(t) && <span title="§1256 contract" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-wash)', padding: '1px 4px', borderRadius: 4, marginLeft: 2 }}>§1256</span>}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.strat}</td>
                  <td style={td}><span style={{ fontSize: 11.5, fontWeight: 600, color: t.side === 'Buy' ? 'var(--accent)' : 'var(--text-2)' }}>{t.side}</span></td>
                  <td style={{ ...numTd, color: 'var(--text-2)' }}>{t.qty}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.strike}</td>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{t.exp}</td>
                  <td style={{ ...numTd, color: 'var(--text-2)' }}>{V.fmtNum(t.fill)}</td>
                  <td style={{ ...numTd, color: 'var(--text-3)' }}>{V.fmtNum(commOf(t))}</td>
                  <td style={{ ...numTd, fontWeight: 700, color: t.pl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{V.fmtSigned(t.pl)}</td>
                  <td style={{ ...td, textAlign: 'right' }}><StatusPill status={t.status} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No trades match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
const thStatic = { textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' };

// ════════════════════════════════════════════════════════════
//  TAX EXPOSURE
// ════════════════════════════════════════════════════════════
function TaxView({ trades }) {
  const t = V.tax;
  const s1256 = trades.filter(isS1256);
  const s1256PL = s1256.reduce((s, x) => s + x.pl, 0);
  const washCandidates = trades.filter((x) => x.pl < 0).slice(0, t.washFlags);
  const washTotal = washCandidates.reduce((s, x) => s + x.pl, 0);

  const ltOf = (pl) => pl * 0.6, stOf = (pl) => pl * 0.4;

  const brackets = [
    { rate: '10%', upto: '$11,925' }, { rate: '12%', upto: '$48,475' },
    { rate: '22%', upto: '$103,350' }, { rate: '24%', upto: '$197,300' },
    { rate: '32%', upto: '$250,525' }, { rate: '35%', upto: '$626,350' }, { rate: '37%', upto: '—' },
  ];
  const marginalIdx = 3; // 24% assumed

  const labelTh = { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const cell = { padding: '9px 12px', fontSize: 12.5, whiteSpace: 'nowrap' };
  const numCell = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>Tax Exposure</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Estimated · tax year 2025 · single filer assumption</div>
        </div>
        <span className="chip" style={{ gap: 6 }}><Icon name="shield" size={13} style={{ color: 'var(--accent)' }} /> Estimates only — not tax advice</span>
      </div>

      {/* headline cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, flex: '0 0 auto' }}>
        <StatCard label="Short-Term Gains" value={V.fmtUSD(t.shortTerm)} tone="pos" hint="taxed as ordinary income" />
        <StatCard label="Long-Term Gains" value={V.fmtUSD(t.longTerm)} tone="pos" hint="held > 1 year" />
        <StatCard label="§1256 (60/40)" value={V.fmtUSD(t.s1256)} hint="SPX · NDX · RUT" />
        <StatCard label="Wash-Sale Adj." value={V.fmtUSD(Math.abs(washTotal))} tone="neg" hint={`${t.washFlags} disallowed losses`} />
        <StatCard label="Est. Tax Owed" value={V.fmtUSD(t.estTax)} hint="≈ 24% marginal" />
      </div>

      {/* two-column detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 13, flex: '0 0 auto' }}>
        {/* §1256 detection */}
        <div className="panel" style={{ borderRadius: 9 }}>
          <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Section 1256 Contracts</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Broad-based index options — 60% long-term / 40% short-term, marked to market</div>
            </div>
            <span className="pill pill-open">{s1256.length} detected</span>
          </div>
          <div style={{ padding: '10px 6px 6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={labelTh}>Symbol</th><th style={labelTh}>Strategy</th><th style={{ ...labelTh, textAlign: 'right' }}>Realized</th><th style={{ ...labelTh, textAlign: 'right' }}>60% LT</th><th style={{ ...labelTh, textAlign: 'right' }}>40% ST</th></tr></thead>
              <tbody>
                {s1256.map((x, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...cell, fontWeight: 700 }}>{x.sym}</td>
                    <td style={{ ...cell, color: 'var(--text-2)' }}>{x.strat}</td>
                    <td style={{ ...numCell, fontWeight: 600, color: x.pl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{V.fmtSigned(x.pl)}</td>
                    <td style={{ ...numCell, color: 'var(--text-2)' }}>{V.fmtSigned(Math.round(ltOf(x.pl)))}</td>
                    <td style={{ ...numCell, color: 'var(--text-2)' }}>{V.fmtSigned(Math.round(stOf(x.pl)))}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1.5px solid var(--border-2)' }}>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Total §1256</td>
                  <td style={{ ...numCell, fontWeight: 700, color: 'var(--pos)' }}>{V.fmtSigned(s1256PL)}</td>
                  <td style={{ ...numCell, fontWeight: 700 }}>{V.fmtSigned(Math.round(ltOf(s1256PL)))}</td>
                  <td style={{ ...numCell, fontWeight: 700 }}>{V.fmtSigned(Math.round(stOf(s1256PL)))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* wash sales */}
        <div className="panel" style={{ borderRadius: 9 }}>
          <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Wash-Sale Flags</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Losses disallowed when repurchased within 30 days</div>
            </div>
            <span className="pill pill-expired"><Icon name="flag" size={11} /> {t.washFlags}</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {washCandidates.map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 8, background: 'var(--neg-wash)' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface)', color: 'var(--neg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 auto' }}>{x.sym}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{x.strat} · {x.exp}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Repurchased within 30 days — loss deferred</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--neg)', fontVariantNumeric: 'tabular-nums' }}>{V.fmtSigned(x.pl)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* brackets */}
      <div className="panel" style={{ borderRadius: 9, flex: '0 0 auto' }}>
        <div style={{ padding: '13px 14px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Estimated Ordinary-Income Brackets</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Short-term gains stack on top of your ordinary income. Marginal bracket assumed at 24% — adjust in Settings.</div>
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
          {brackets.map((b, i) => (
            <div key={i} style={{ flex: 1, padding: '11px 12px', borderRadius: 8, textAlign: 'center',
              background: i === marginalIdx ? 'var(--accent-wash)' : 'var(--inset)',
              border: i === marginalIdx ? '1px solid var(--accent-soft)' : '1px solid transparent' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: i === marginalIdx ? 'var(--accent)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{b.rate}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>≤ {b.upto}</div>
              {i === marginalIdx && <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>You</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  CSV IMPORT
// ════════════════════════════════════════════════════════════
function parseCSV(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const FIELD_SYNS = {
  Symbol: ['symbol', 'underlying', 'ticker', 'instrument'],
  Strategy: ['strategy', 'type', 'spread', 'description', 'strat'],
  Side: ['side', 'action', 'buy/sell', 'b/s'],
  Qty: ['qty', 'quantity', 'contracts', 'amount'],
  Strike: ['strike', 'strikes'],
  Exp: ['exp', 'expiration', 'expiry', 'exp date', 'expdate'],
  Fill: ['fill', 'fill price', 'price', 'net price', 'trade price', 'avg price'],
  'P&L': ['p/l', 'pnl', 'p&l', 'realized p/l', 'realized', 'gain/loss', 'profit', 'net p/l'],
  Comm: ['commission', 'comm', 'fees', 'commissions & fees', 'fees & comm'],
  Status: ['status', 'state'],
};
const FIELD_KEY = { Symbol: 'sym', Strategy: 'strat', Side: 'side', Qty: 'qty', Strike: 'strike', Exp: 'exp', Fill: 'fill', 'P&L': 'pl', Comm: 'comm', Status: 'status' };

function mapHeaders(headers) {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map = {};
  Object.keys(FIELD_SYNS).forEach((field) => {
    let idx = -1;
    for (const syn of FIELD_SYNS[field]) {
      idx = norm.findIndex((h) => h === syn);
      if (idx === -1) idx = norm.findIndex((h) => h.includes(syn));
      if (idx !== -1) break;
    }
    map[field] = idx;
  });
  return map;
}

function rowsToTrades(dataRows, map) {
  const num = (v) => { const n = parseFloat(String(v).replace(/[$,+\s]/g, '')); return isNaN(n) ? 0 : n; };
  return dataRows.map((r) => {
    const get = (f) => (map[f] != null && map[f] !== -1 ? r[map[f]] : '');
    return {
      sym: (get('Symbol') || '').trim().toUpperCase(),
      strat: (get('Strategy') || '').trim() || '—',
      side: (get('Side') || 'Sell').trim(),
      qty: num(get('Qty')) || 1,
      strike: (get('Strike') || '').trim(),
      exp: (get('Exp') || '').trim(),
      fill: num(get('Fill')),
      comm: map['Comm'] !== -1 ? num(get('Comm')) : null,
      pl: num(get('P&L')),
      status: (get('Status') || 'Closed').trim(),
    };
  }).filter((t) => t.sym);
}

function buildSampleCSV() {
  const head = 'Symbol,Strategy,Side,Qty,Strike,Exp,Fill Price,Commission,Realized P/L,Status';
  const lines = V.trades.map((t) => [t.sym, t.strat, t.side, t.qty, t.strike, t.exp, t.fill.toFixed(2), commOf(t).toFixed(2), t.pl, t.status].join(','));
  return head + '\n' + lines.join('\n');
}

function ImportView({ onImport, lastImport }) {
  const { useState, useRef } = VR;
  const [stage, setStage] = useState('drop'); // drop | review
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const inputRef = useRef(null);

  const ingest = (text, name) => {
    const rows = parseCSV(text);
    if (rows.length < 2) return;
    const headers = rows[0];
    const map = mapHeaders(headers);
    const trades = rowsToTrades(rows.slice(1), map);
    setFileName(name);
    setParsed({ headers, map, trades });
    setStage('review');
  };
  const onFile = (file) => { if (!file) return; const fr = new FileReader(); fr.onload = () => ingest(String(fr.result), file.name); fr.readAsText(file); };
  const loadSample = () => ingest(buildSampleCSV(), 'ToS_AccountStatement_2026.csv');

  if (stage === 'drop') {
    return (
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, overflow: 'auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px' }}>Import your account statement</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>Drop a ThinkOrSwim or Schwab CSV export. We auto-detect the columns — no manual entry, no mapping headaches.</div>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current && inputRef.current.click()}
          style={{ width: 'min(620px, 90%)', borderRadius: 14, cursor: 'pointer',
            border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border-2)'}`,
            background: drag ? 'var(--accent-wash)' : 'var(--surface)', transition: 'all .15s',
            padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--inset)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="upload" size={26} /></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Drag &amp; drop your CSV here</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>or click to browse — .csv up to 10MB</div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files[0])} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={loadSample} style={{ font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: 9, background: 'var(--text-1)', color: 'var(--surface)', border: 0, fontSize: 13, fontWeight: 600 }}>
            <Icon name="spark" size={15} /> Load sample ThinkOrSwim statement
          </button>
          {lastImport && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Last import · {lastImport}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
          <Icon name="shield" size={13} /> Processed locally in your browser — your data never leaves this device.
        </div>
      </div>
    );
  }

  // review stage
  const map = parsed.map;
  const matched = Object.keys(FIELD_SYNS).filter((f) => map[f] !== -1).length;
  const openCt = parsed.trades.filter((t) => t.status === 'Open').length;
  const step = (n, label, on, done) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
        background: done ? 'var(--pos)' : on ? 'var(--accent)' : 'var(--inset)', color: done || on ? '#fff' : 'var(--text-3)' }}>{done ? '\u2713' : n}</span>
      <span style={{ fontSize: 12.5, fontWeight: on || done ? 600 : 500, color: on || done ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, overflow: 'auto' }}>
      {/* stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {step(1, 'Upload', false, true)}
        <div style={{ width: 28, height: 1, background: 'var(--border-2)' }}></div>
        {step(2, 'Map columns', true, false)}
        <div style={{ width: 28, height: 1, background: 'var(--border)' }}></div>
        {step(3, 'Review & import', false, false)}
        <div style={{ flex: 1 }}></div>
        <span className="chip" style={{ gap: 6, color: 'var(--pos)', borderColor: 'var(--pos-soft)' }}><Icon name="spark" size={12} /> ThinkOrSwim Account Statement detected</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: 13, flex: 1, minHeight: 0 }}>
        {/* column mapping */}
        <div className="panel" style={{ borderRadius: 9, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '13px 14px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Column mapping</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{matched} of {Object.keys(FIELD_SYNS).length} fields matched · {fileName}</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto' }}>
            {Object.keys(FIELD_SYNS).map((field) => {
              const ok = map[field] !== -1;
              return (
                <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--inset)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ok ? parsed.headers[map[field]] : 'not found'}</span>
                  <Icon name="chevRight" size={13} style={{ color: 'var(--text-faint)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, width: 78, textAlign: 'right' }}>{field}</span>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: ok ? 'var(--pos-wash)' : 'var(--inset)', color: ok ? 'var(--pos)' : 'var(--text-faint)' }}>
                    {ok ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* preview */}
        <div className="panel" style={{ borderRadius: 9, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '13px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Preview</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>First {Math.min(7, parsed.trades.length)} of {parsed.trades.length} rows</div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <span className="chip" style={{ fontSize: 11 }}>{parsed.trades.length} trades</span>
              <span className="chip" style={{ fontSize: 11 }}>{openCt} open</span>
            </div>
          </div>
          <div style={{ padding: '8px 6px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <TradesTable rows={parsed.trades.slice(0, 7)} dense />
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-3)' }}>
          <Icon name="shield" size={13} /> Processed locally — nothing uploaded.
        </div>
        <div style={{ flex: 1 }}></div>
        <button onClick={() => { setStage('drop'); setParsed(null); }} style={{ font: 'inherit', cursor: 'pointer', height: 40, padding: '0 18px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, fontWeight: 600 }}>Back</button>
        <button onClick={() => onImport(parsed.trades)} style={{ font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 22px', borderRadius: 9, border: 0, background: 'var(--pos)', color: '#fff', fontSize: 13.5, fontWeight: 700 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          Import {parsed.trades.length} trades
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { TradesView, TaxView, ImportView });
