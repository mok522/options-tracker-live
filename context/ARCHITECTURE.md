# Architecture
_Created from Claude Design output analysis — 2026-06-08_

## Overview
Single-page React application. No backend. All persistence via browser storage (key: `tos-trades`). Data enters through CSV import only.

## File structure
```
/
├── CLAUDE.md                  # project index (read first)
├── context/
│   ├── ARCHITECTURE.md        # this file
│   ├── DESIGN.md
│   ├── PROGRESS.md
│   └── DECISIONS.md
├── design/                    # Claude Design output (source of truth for UI)
│   ├── theme.css              # design tokens — do not modify
│   ├── shared.jsx             # Icon, Logo, StatusPill, KpiCard, Delta, TradesTable atoms
│   ├── charts.jsx             # SVG chart components (MonthlyBars, StrategyDonut, etc.)
│   ├── views.jsx              # TradesView, TaxView, ImportView
│   ├── tracker-app.jsx        # App shell: theme, tab routing, DashboardView
│   ├── data.js                # Sample data + formatters (fmtUSD, fmtSigned, fmtNum)
│   └── screenshots/           # Reference screenshots per screen
└── src/                       # Implementation (to be built/refactored to match design)
```

## Component hierarchy
```
App (tracker-app.jsx)
├── Topbar                     # Logo, tabs, ticker quotes, theme toggle, Import CTA
├── DashboardView              # KPI tiles + chart grid
│   ├── Tile[]                 # 5 summary metric tiles
│   ├── Panel > MonthlyBars    # Monthly P&L bar chart (SVG)
│   ├── Panel > StrategyDonut  # Strategy breakdown donut (SVG)
│   ├── Panel > WinRateChart   # Win rate by symbol (SVG)
│   ├── Panel > CumulativeLine # Cumulative P&L line (SVG)
│   └── Panel > TradesTable    # Recent trades strip (last 5)
├── TradesView (views.jsx)     # Full filterable trades table
├── TaxView (views.jsx)        # Tax exposure breakdown
└── ImportView (views.jsx)     # CSV drop zone + column map + import log
```

## Data flow
```
ThinkOrSwim CSV export
  → ImportView (parseTradeCSV)
    → rowsToTrades()           # one Trade per raw execution leg
    → ParseResult { legs[], hasPnl, trades(preview) }
      → onImport(legs, hasPnl)
        → importTrades() server action
          → merge legs into settings['raw_legs'] (deduped by legKey)
          → recomputePositions(unionOfAllLegs)   # FIFO-match across ALL files
          → rebuild `trades` table from recomputed set
          → return recomputed Trade[] → setTrades()
            → DashboardView, TradesView, TaxView
```

### Multi-file import (raw legs are the source of truth)
A trade can open in one statement file and close in a later one, so import does
NOT store only computed round-trips. Every raw execution leg is persisted (JSON
in `settings['raw_legs']`, deduped by `legKey`), and the full position set is
recomputed from the union after each import:
- **P&L-column files** (CSV has Realized P/L): rows trusted as-is, deduped by id.
- **Trade-history files** (no P&L): legs FIFO-matched oldest-first (opens before
  closes on the same day) so cross-file open/close pairs realize correctly.
`importTrades` rebuilds the `trades` table each import; re-import is idempotent.
**Migration note:** legacy `trades` rows are not back-filled into `raw_legs` —
re-import statements once to seed the leg store.

## Storage schema
```js
// Key: 'tos-trades'   Shared: false (personal data)
// Value: JSON.stringify(Trade[])

Trade {
  id: string           // btoa hash for dedup
  symbol: string       // e.g. 'NVDA'
  fullSymbol: string   // raw from CSV
  execTime: string     // raw date string from CSV
  strategy: string     // detected: 'Covered Call' | 'Cash-Secured Put' | 'Vertical Spread' | 'Iron Condor' | 'Butterfly' | 'Calendar' | 'Straddle' | 'Long Call' | 'Long Put' | 'Other'
  side: string         // 'BUY' | 'SELL'
  qty: number
  price: number        // fill price
  cost: number         // total cost/credit
  commissions: number
  netLiq: number
  strike: number|null
  exp: string          // expiration
  optType: string      // 'C' | 'P'
  spread: string       // raw spread/description field
  status: 'Open'|'Closed'|'Expired'|'Assigned'
  pnl: number|null     // null for open positions
  daysHeld: number|null
}
```

## CSV parsing
- Auto-detects delimiter (tab vs comma)
- Column matching via alias map — handles ThinkOrSwim naming variations
- Key column aliases mapped: Exec Time, Spread, Side, Qty, Pos Effect, Symbol, Exp, Strike, Type, Price, Net Liq, Cost, Commissions
- Deduplication on every import — safe to re-import the same file
- Strategy naming is structural per-position: `Trade.strat` is derived in
  `rowsToTrades` from the option `Type` column + the position's OPENING side
  (`classifySingle` → Long/Short Call/Put). Closing legs invert their side to
  recover the opening direction. The TOS `Spread` column (SINGLE/DIAGONAL/…) is
  only a fallback when the option type is absent (e.g. the sample CSV, which
  already carries explicit strategy names). Each leg is tracked as its own
  single-option position, so labels are directional rather than multi-leg.

## ThinkOrSwim export path
Monitor → Activity & Positions → Account Statement → set date range → Export to CSV

## Key constants
```js
S1256_SYMS = ['SPX', 'NDX', 'RUT', 'SPXW', 'XSP', 'VIX']  // Section 1256 detection
```

## Formatters (from data.js)
```js
fmtUSD(n, dp=0)      // '$1,234' or '−$1,234'
fmtSigned(n, dp=0)   // '+$1,234' or '−$1,234'
fmtNum(n, dp=2)      // '12.40'
```

## Charts
All charts are custom SVG — no Chart.js dependency. Built in `charts.jsx`:
- `MonthlyBars` — bar chart, pos/neg colored, baked tooltip on last bar
- `StrategyDonut` — donut with center label
- `WinRateBySymbol` — horizontal bars
- `CumulativeLine` — smooth Catmull-Rom curve with area fill
- `MiniSpark` — inline sparkline for KPI tiles

## Tax calculation logic
- Short-term gains: closed trades with pnl > 0
- Short-term losses: closed trades with pnl < 0
- Section 1256: trades where symbol in S1256_SYMS → 60% LT / 40% ST treatment
- Wash sale flag: loss trade followed by same-symbol trade within 30 days
- Estimated tax: shown at 22% and 32% brackets (user selects marginal rate)
- Commissions treated as deductible expense
