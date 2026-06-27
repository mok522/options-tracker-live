# Architecture
_Created from Claude Design output analysis — 2026-06-08_

## Overview
Single-page React application on Next.js with Turso (libSQL) persistence via server actions. Data enters through a live **Charles Schwab Developer API** integration (OAuth 2.0). CSV import was removed in favor of direct sync (2026-06-27).

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
├── AnalyticsView              # Open-position "When to Close" + realized perf analytics
│   ├── OpenPositionsSection   # DTE / premium / live moneyness / close-signal per open leg
│   └── (realized)             # drawdown, expectancy, long-vs-short, streaks, per-strategy
├── TradesView (views.jsx)     # Full filterable trades table
├── TaxView (views.jsx)        # Tax exposure breakdown
└── ImportView (views.jsx)     # Schwab connection hub (Connect / Sync / Disconnect)
```

## Data flow
```
User clicks "Sync Now" (ImportView, connected state)
  → syncSchwab() server action
    → getValidToken()                      # auto-refresh if <5 min to expiry
    → resolveAccount()                     # gets hashValue from /accounts/accountNumbers (cached)
    → fetchAllTradeTransactions(hashValue) # pages backwards in <364-day windows up to 6 years
        → schwabFetch(/trader/v1/accounts/{hashValue}/transactions?types=TRADE&startDate=...&endDate=...)
        → repeats until windowEnd < floor (full history, no duplicates)
    → adaptTransactions(json)              # Schwab JSON → Trade[] legs (one per option transferItem)
      → importTrades(legs, hasPnl=false)  # existing pipeline, unchanged
        → merge legs into settings['raw_legs'] (deduped by legKey)
        → recomputePositions(unionOfAllLegs)   # FIFO-match across ALL syncs
        → rebuild `trades` table from recomputed set
        → return recomputed Trade[] → setTrades()
          → DashboardView, TradesView, TaxView
```

**legKey dedup:** `date|sym|exp|strike|optType|side|qty|fill|status` — stable per execution,
making backwards-paged re-syncs fully idempotent (no duplicates across overlapping windows).

**Full-history paging:** each request capped to <364 days (Schwab limit). Sync walks
backwards in non-overlapping 364-day windows from now up to 6 years. No `last_sync_at`
date range — every sync pulls full history and relies on `legKey` for dedup.

### Schwab API integration (2026-06-27)
The Schwab layer is a **thin adapter**: it converts Schwab transaction JSON into
the existing `Trade` leg shape, then feeds the unchanged `importTrades` pipeline.
All downstream business logic (dedup, FIFO matching, pnlEngine, taxEngine,
analytics) is untouched. Schwab transactions carry no realized-P&L column, so
they take the `hasPnl=false` FIFO-matching path (same as TOS Trade History CSV).

**OAuth 2.0 (Authorization Code flow):**
```
GET /api/auth/schwab        → redirect to Schwab authorize page (scope=readonly)
GET /api/auth/callback?code → POST /v1/oauth/token (Basic auth client:secret)
                            → saveTokens() + cache account number
                            → redirect /?connected=true
```
Access tokens expire in 30 min, refresh tokens in 7 days. `getValidToken()`
refreshes proactively when <5 min remain.

**Schwab files:**
```
lib/schwab/
├── tokenManager.ts   # token storage/refresh, account hash cache, last_sync_at, isConnected
├── client.ts         # schwabFetch() — Bearer-auth wrapper over api.schwabapi.com
├── adapter.ts        # adaptTransactions() — Schwab JSON → Trade[]
├── accounts.ts       # resolveAccount() — fetches + caches accountNumber + hashValue
├── http.ts           # fetchWithTimeout() — 20s AbortController timeout wrapper
└── quotes.ts         # fetchQuotes() — /marketdata/v1/quotes → { last, change, changePct }
app/api/auth/schwab/route.ts     # OAuth initiate
app/api/auth/callback/route.ts   # OAuth callback / token exchange + account hash cache
actions/syncSchwab.ts            # orchestrates full-history paged sync
actions/fetchQuotes.ts           # live quotes (returns {} if disconnected)
actions/disconnectSchwab.ts      # clearTokens()
actions/testConnection.ts        # lightweight live API check (/accounts/accountNumbers)
scripts/https-proxy.mjs          # local HTTPS→HTTP proxy (Node built-ins, port 3001→3000)
```

### Live quotes
Topbar SPX/NDX/VIX are fetched via `getQuotes()` on mount and every 60s while
connected (interval lives in `TrackerApp`, cleared on unmount). Symbol lookups
try Schwab index notation (`$SPX.X`) and the bare ticker. Disconnected → tiles
render `—`.

**Known gap:** `$SPX.X` / `$NDX.X` / `$VIX.X` quote key mapping is unverified against
live `/marketdata/v1/quotes` responses — topbar indices may still show `—` until confirmed.

### Local HTTPS proxy (dev only)
`next dev --experimental-https` is broken on this machine (accepts TLS but never
responds). Workaround: Next.js runs plain HTTP on port 3000; `scripts/https-proxy.mjs`
(Node built-in TLS) listens on port 3001 and proxies to it. Schwab OAuth callback
is registered as `https://localhost:3001/api/auth/callback`. WebSocket (HMR) upgrades
are also proxied. `next.config.ts` includes `allowedDevOrigins: ['127.0.0.1', 'localhost']`
to prevent cross-origin HMR blocks.

**Dev startup:**
```
npm run dev       # Next on :3000
npm run dev:tls   # HTTPS proxy on :3001 (separate terminal)
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

## Settings table keys (key-value store, no schema change needed)
| Key | Value |
|-----|-------|
| `raw_legs` | JSON `PersistedLeg[]` — union of all synced/imported execution legs |
| `schwab_tokens` | JSON `{ access_token, refresh_token, expires_at }` |
| `schwab_account_number` | Cached Schwab display account number (last 4 digits for UI) |
| `schwab_account_hash` | Cached Schwab encrypted `hashValue` — required for all `/transactions` API paths |
| `last_sync_at` | ISO timestamp of last successful sync |

`isConnected` is derived from the presence of `schwab_tokens`. `clearTokens()`
(Disconnect) removes `schwab_tokens`, `schwab_account_number`, `schwab_account_hash`, and `last_sync_at`.

**Why `hashValue`?** Schwab's `/trader/v1/accounts/{hashValue}/transactions` endpoint requires
the encrypted account hash, not the plain account number. The hash is fetched once from
`/trader/v1/accounts/accountNumbers` and cached; `resolveAccount()` serves it from cache on
subsequent calls.

## Environment variables
```
TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET
SCHWAB_REDIRECT_URI=http://localhost:3001/api/auth/callback   # must match Schwab app registration
```

## Storage schema (legacy Trade shape reference)
```js
// Computed positions live in the Turso `trades` table; raw legs in settings['raw_legs'].

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
