# Progress
_Updated 2026-06-27_

## Current status
**Phase: Schwab Developer API integration complete — CSV import replaced**

Live Charles Schwab API integration replaces manual CSV import. Trades sync
directly via OAuth; topbar shows live SPX/NDX/VIX quotes. Earlier phases (design
reconciliation, P&L engine, Turso migration) remain as built below.

## Schwab API Integration (2026-06-27)

Design spec: `docs/superpowers/specs/2026-06-27-schwab-api-integration-design.md`

### What was built
**Thin adapter approach** — Schwab transaction JSON is converted to the existing
`Trade` leg shape and fed through the unchanged `importTrades` pipeline. No
business logic (dedup, FIFO, pnlEngine, taxEngine, analytics) was modified.

| File | Role |
|------|------|
| `lib/schwab/tokenManager.ts` | Token storage/refresh, account #, last_sync_at, `isConnected()` |
| `lib/schwab/client.ts` | `schwabFetch()` Bearer-auth wrapper |
| `lib/schwab/adapter.ts` | `adaptTransactions()` — Schwab JSON → `Trade[]` |
| `lib/schwab/quotes.ts` | `fetchQuotes()` — live quote normalizer |
| `app/api/auth/schwab/route.ts` | OAuth initiate (redirect to Schwab) |
| `app/api/auth/callback/route.ts` | OAuth callback / token exchange + account cache |
| `actions/syncSchwab.ts` | Orchestrates a sync through `importTrades` |
| `actions/fetchQuotes.ts` | Live quotes server action |
| `actions/disconnectSchwab.ts` | `clearTokens()` |

**Modified:** `components/import/ImportView.tsx` (CSV dropzone → connection hub
with Connect / Sync Now / Disconnect), `components/layout/Topbar.tsx` (live
quotes + connection dot, removed hardcoded tickers), `components/TrackerApp.tsx`
(sync/disconnect handlers, 60s quote polling), `app/page.tsx` (passes
`isConnected` + `lastSyncAt` from settings), `.env.local` (Schwab env vars),
`.claude/launch.json` (`autoPort: false` — port 3001 fixed for OAuth callback).

### Verification status
- `next build` / `tsc --noEmit` pass clean.
- **OAuth + sync exercised end-to-end against the live Schwab API (2026-06-27).**
  Connection, account-hash resolution, and full-history sync confirmed working;
  adapter verified producing correct legs (51 tx → 51 legs) from real responses.

### Live-data corrections (2026-06-27, after first real sync)
Real Schwab responses differed from the documented shapes the adapter was first
written against. Fixed in `lib/schwab/adapter.ts`:
- **Instrument discriminator is `assetType`, not `type`** (`type` is e.g.
  "VANILLA"). The old `instrument.type !== 'OPTION'` check skipped every leg →
  "0 transactions". This was the core "no data" bug.
- **Commissions/fees are separate `CURRENCY` transferItems** (`feeType`:
  COMMISSION / SEC_FEE / OPT_REG_FEE / TAF_FEE, negative `cost`), not embedded in
  the option price. Adapter now sums them per order and allocates to each leg by
  contract share; `comm` is the leg **total** (matches the app convention), not
  per-contract as before.
- **Historical sync**: `syncSchwab` now pages backwards in <1-year windows
  (Schwab caps each request to <1yr) up to 6 years, instead of a single 365-day
  window since last sync. Pulls full available history; dedup keeps it idempotent.
- **Chart NaN guards**: MiniSpark/MonthlyBars/CumulativeLine divided by zero on
  sparse/flat real data (single point, or all-equal values). Guarded.

### UI additions (2026-06-27)
- **Trades view**: sortable **"Closed"** column showing each finished trade's
  realization date (`Trade.date` already holds the close date for non-Open
  trades; `—` while open). `components/trades/TradesView.tsx`.
- **Dashboard "Recent Trades"**: now lists trades **closed in the last 30 days**
  (most recent first) instead of the first 6 rows. `DashboardView.tsx`.

### Open Positions tab + unrealized P&L (2026-06-27, updated)
Promoted to its own top-level **"Open Positions"** tab (after Dashboard) so it can
grow independently; the **Analytics** tab is realized-only again. Adds live
**P&L Since Open** per leg.
- `components/positions/OpenPositionsView.tsx` — the full view (was a section in
  AnalyticsView). Fetches underlying quotes (`getQuotes`) **and** option marks
  (`getOpenPositionMarks`) on mount.
- `lib/schwab/positions.ts` — `fetchOpenOptionMarks()` reads the Schwab
  **account-positions endpoint** (`/trader/v1/accounts/{hash}?fields=positions`),
  derives each held option's per-contract **mark** = `|marketValue| / (qty×100)`
  (no OCC-symbol reconstruction), keyed by `positionKey` for leg matching.
- `actions/fetchPositions.ts` — `getOpenPositionMarks()` (isConnected guard, →{}).
- `lib/openAnalytics.ts` — `positionKey()` (shared leg↔position match key) +
  `computeOpenAnalytics(trades, quotes, marks)` adds `unrealizedPl` (gross
  mark-to-market: shorts `(entry−mark)×qty×100`, longs `(mark−entry)×qty×100`),
  `pctCaptured` (shorts), and `totalUnrealizedPl`. New **Unrealized P&L** tile +
  **P&L Since Open** / **% Cap.** columns (pos/neg correct here — real P&L).
- Marks are **live only during market hours** (else last close); any missing field
  or unmatched leg degrades to `—`, never a wrong number.
- Tab wired in both `Topbar.tsx` and `TrackerApp.tsx` (the `Tab` union is duplicated).

### Open-position analytics — "When to Close" (2026-06-27, original)
Decision-support analytics for when to close open option positions.
- `lib/openAnalytics.ts` — pure `computeOpenAnalytics(trades, quotes)`. Per open
  leg derives **DTE** (parses `exp` "D MON YY" / ISO), **days held**, **premium**
  (credit for shorts / debit for longs), and — when a live underlying quote is
  available — **moneyness** (ITM/OTM) and **signed distance-to-strike %**.
- **Close signal** heuristic per leg, sorted by urgency: `assignment` (short ITM),
  `expiring`/`decay` (≤7 DTE), `profit` (long ITM), `manage` (≤21 DTE), `hold`.
  Falls back to DTE-only when no underlying quote (e.g. index symbols).
- `components/analytics/AnalyticsView.tsx` — added `OpenPositionsSection` (6 KPI
  tiles + per-leg "When to Close" table). Fetches live underlying quotes client-
  side via `getQuotes()` for distinct open symbols (bare ticker + `$SYM.X`).
  Restructured so the view renders with **open trades only** (realized section now
  shows an inline note instead of gating the whole page on `closedCount`).
- **Design compliance**: signal badges use accent/status tokens, never `--pos`/
  `--neg` (reserved for realized P&L). Premium shown neutral with a Cr/Db tag.
- **Not included**: true unrealized P&L from live *option* marks — needs OCC-symbol
  reconstruction (unreliable for index roots, e.g. SPXW vs SPX) and live quote-shape
  verification. Moneyness/DTE/premium are deterministic and were the actionable core.
  Verified deterministically against representative positions (assignment/decay/
  manage/hold + unquoted-index fallback all correct).

### Activation steps
1. Add real `SCHWAB_CLIENT_ID` / `SCHWAB_CLIENT_SECRET` to `.env.local`.
2. `npm run dev` (port 3001) → Import tab → "Connect to Charles Schwab".
3. Authorize → redirected back → "Connected" → "Sync Now".

## Current status (prior)
**Phase: Design reconciliation complete — full UI rebuild done**

The Claude Code implementation has been fully regenerated from the Claude Design files. All UI components, layouts, charts, and the application shell now faithfully implement the design spec.

## What was built (2026-06-08)

### ✅ Foundation
- `app/globals.css` — replaced with full `design/theme.css` content (all CSS variables, `.dash` scope, pill/chip/seg classes, trow hover, scrollbar hiding)
- `app/layout.tsx` — simplified: IBM Plex Sans via `next/font`, no sidebar, no ThemeProvider
- `app/page.tsx` — single-page entry point rendering `<TrackerApp />`
- `lib/formatters.ts` — updated to match design spec: `fmtUSD(n, dp=0)`, `fmtSigned(n, dp=0)`, `fmtNum(n, dp=2)` with Unicode minus `−`
- `lib/sampleData.ts` — sample KPIs, monthly/strategy/cumulative/trade data from `design/data.js`
- `lib/csvParser.ts` — CSV import utilities: delimiter auto-detection (tab vs comma), FIELD_SYNS fuzzy matching, deduplication via `btoa(exp|sym|fill|qty)`
- `types/trade.ts` — flat `Trade` interface matching design's data shape

### ✅ Shared atoms
- `components/shared/Icon.tsx` — 17 inline SVG icons (grid, table, tax, upload, search, bell, gear, arrowUp, chevDown, chevRight, calendar, filter, download, flag, shield, spark, dot)
- `components/shared/Logo.tsx` — Tradesheet wordmark with trend-line icon; compact variant (icon only)
- `components/shared/StatusPill.tsx` — rounded pill with leading dot; pill-open/closed/expired/assigned variants
- `components/shared/Delta.tsx` — up/down arrow badge with pos/neg color
- `components/shared/TradesTable.tsx` — flexible column table using CSS variables, dense mode

### ✅ Charts (custom SVG — no Recharts)
- `components/charts/MiniSpark.tsx` — Catmull-Rom sparkline for KPI tiles
- `components/charts/MonthlyBars.tsx` — bar chart with pos/neg coloring, baked tooltip on last bar
- `components/charts/StrategyDonut.tsx` — donut chart with gap segments, center label; `DonutLegend`
- `components/charts/WinRateBars.tsx` — horizontal bar chart with 50% reference line
- `components/charts/CumulativeLine.tsx` — smooth area+line with gradient fill, end-point callout

### ✅ Layout atoms
- `components/layout/Panel.tsx` — white card with title/sub/right-slot, configurable padding
- `components/layout/Tile.tsx` — KPI stat tile with optional sparkline or delta badge
- `components/layout/Topbar.tsx` — 50px header with Logo, tab nav, ticker quotes, theme toggle, Import CTA, avatar

### ✅ Views
- `components/dashboard/DashboardView.tsx` — 3-column grid (208px stat rail | center charts | 312px right rail) + recent trades strip
- `components/trades/TradesView.tsx` — 4 stat cards + segmented status filter + strategy dropdown + symbol search + sortable table with §1256 badges
- `components/tax/TaxView.tsx` — 5 headline cards + §1256 detection table + wash-sale flags + bracket grid (24% marginal highlighted)
- `components/import/ImportView.tsx` — drag-and-drop zone + stepper + column mapping preview + import confirmation

### ✅ App shell
- `components/TrackerApp.tsx` — theme hook (html.dark, ott-theme key), tab state, localStorage persistence (ott-trades, ott-last-import), onImport handler

### ✅ Old sub-pages redirected
- `app/dashboard/page.tsx`, `app/trades/page.tsx`, `app/tax/page.tsx`, `app/import/page.tsx` — all redirect to `/`

## Design fidelity notes
- All colors use CSS variables from `theme.css` — no hardcoded hex anywhere in components
- P&L states use `--pos` / `--neg` exclusively
- All numbers go through `fmtUSD`, `fmtSigned`, or `fmtNum`
- Unicode minus (`−`) used for negatives, not hyphen
- `font-variant-numeric: tabular-nums` on all numeric displays
- Dark mode via `html.dark` class toggle, `ott-theme` localStorage key
- Dashboard layout: `208px | minmax(0,1fr) | 312px` 3-column grid

## Business logic preserved
- CSV auto-delimiter detection (tab vs comma)
- FIELD_SYNS fuzzy header matching covering all ThinkOrSwim column variants
- Deduplication: `id = btoa(exp|sym|fill|qty)`
- Section 1256 detection: SPX, NDX, RUT, SPXW, XSP, VIX
- Wash-sale flagging: loss trades (approximate — loss PL + same symbol, 30-day window)
- Tax estimation: 24% marginal on short-term, 60/40 split on §1256
- localStorage persistence: `ott-trades` (trade array), `ott-last-import` (timestamp)

## P&L Calculation Fix (2026-06-09)

### Root causes identified and fixed

**Bug 1 — All trades showing pl=0 (primary)**
- TOS Account Trade History has no P&L column per row; `buildPositions` matches buy/sell legs and computes P&L from fills.
- Old `upsertTrades` used `onConflictDoNothing()` — trades imported before `buildPositions` existed stayed in Turso with pl=0; re-importing never updated them.
- Fix: `actions/upsertTrades.ts` now deletes all existing trades before inserting the new set. The TOS statement is always a full-period export, so replace-all is the correct strategy.

**Bug 2 — Expired options showing pl=0 instead of premium outcome**
- `buildPositions` was assigning pl=0 to all unmatched opening legs, including positions that expired within the statement period.
- Short positions that expired worthless should show the premium collected as profit (seller keeps the premium). Long positions that expired worthless should show the premium paid as a full loss.
- Fix: `lib/csvParser.ts` `buildPositions` now computes `pl = ±fill × qty × 100` for expired positions based on side.

**Bug 3 — Dashboard KPI tiles hardcoded to sample data**
- `DashboardView.tsx` was reading `sampleKpis` and `sampleTax` regardless of what trades were imported.
- Fix: All stat tiles (Net P&L, Win Rate, Profit Factor, Avg/Trade, Open Positions, Commissions, Tax panel) now derive from the live `trades` prop.
- Charts (CumulativeLine, MonthlyBars, StrategyDonut, WinRateBars) still use sample data — they require a `date` field on `Trade` for correct time-series ordering (see backlog).

### Re-import required
Users with existing pl=0 data must re-import their TOS account statement CSV to get correct P&L values.

## Test Suite Integration (2026-06-09)

### What was integrated

`tests/test_options_pnl.py` — 18 real trades from the Schwab/TOS statement (acct ...82SCHW, 6/8/25–6/7/26) used as ground-truth fixtures for the P&L and strategy-detection algorithms.

**Files added (test file itself not modified):**

| File | Role |
|------|------|
| `lib/pnlEngine.ts` | Canonical TypeScript P&L engine: `computePnl()`, `detectStrategy()` |
| `tests/portal_adapter.ts` | stdin→stdout bridge; tsx reads all 18 cases as JSON, returns `[{pnl, strategy}, ...]` |
| `tests/conftest.py` | pytest session fixture; patches `compute_pnl`/`detect_strategy` in the test module with TypeScript results via one subprocess call |

**Architecture:** `pytest → conftest.py → node_modules/.bin/tsx tests/portal_adapter.ts → lib/pnlEngine.ts`

### What pnlEngine implements (vs old buildPositions)

| Rule | pnlEngine | buildPositions (unchanged) |
|------|-----------|---------------------------|
| Commission | $0.65/contract; waived BUY ≤ $0.05 | Not deducted from `pl` |
| Net P&L | gross − commission − misc fee | Gross only |
| Expiration | premium ± fee (net) | premium (gross) |
| Assignment | treated as single-execution like expiration | routes as close leg → `pl: 0` (bug) |
| Strategy | algorithmic from option_type/strike/exp | TOS "Spread" column value |

`buildPositions` has known gaps (see above) that should be addressed in a follow-up by replacing its P&L math with calls to `computePnl`. For now the two coexist: `pnlEngine` is the verified algorithm; `buildPositions` powers the live import flow.

### Run
```
python3 -m pytest tests/test_options_pnl.py -v
# 54 passed, 0 failed
```

## Position P&L history (2026-07-08)
- **Position P&L history**: daily cron snapshots per-position
  unrealized P&L into `position_snapshots`; Open Positions rows open a
  slide-out with a history chart and percentile-of-range metric.
  Spec: `docs/superpowers/specs/2026-07-08-position-pl-history-design.md`

## Assignment sync fix (2026-07-13)
- Schwab books assignments as RECEIVE_AND_DELIVER ("Removed due to Assignment
  ..."), not TRADE — sync now fetches both types; the adapter emits a $0
  closing leg with status `Assigned`, and FIFO matching keeps that status on
  the round trip (previously fell back to `Expired`). Premium P&L unchanged.
  The assignment's separate stock-sale TRADE (equity leg) now flows through
  stock P&L tracking (see below) instead of being ignored.

## Stock P&L tracking (2026-07-13)
- Schwab equity trades sync through the FIFO pipeline: stock round trips
  (incl. assignment share sales) show realized P&L in Trades and roll into
  Dashboard aggregates; Tax Exposure splits short/long-term by holding
  period. Open Positions stays options-only.
  Spec: docs/superpowers/specs/2026-07-13-stock-pl-tracking-design.md

## Backlog (post-reconciliation)
- [ ] Notes/tags field per trade ("earnings play", "hedge", etc.)
- [ ] Position sizing column (% of account per trade)
- [ ] Average days held metric
- [x] Profit factor display (gross wins ÷ gross losses) — live in Dashboard
- [ ] Export filtered trades to CSV (button wired up but handler not implemented)
- [x] Unrealized P&L for open positions — live in the **Open Positions** tab
      (2026-06-27): gross mark-to-market P&L Since Open per leg + total, sourced
      from the Schwab account-positions endpoint, plus moneyness/DTE/premium.
      (Marks are live during market hours only; commissions excluded.)
- [ ] User-selectable marginal tax bracket (currently hardcoded at 24%)
- [ ] Max drawdown metric
- [x] Live ticker quotes in Topbar — live via Schwab `/marketdata/v1/quotes` (2026-06-27)

## Known gaps / issues
- `quotes.ts` `$SPX.X` quote keys still unverified against live `/marketdata` responses
- Schwab API only retains ~limited transaction history; data older than its
  retention window is unavailable via API (would need CSV statement import, removed)
- Same-day identical fills (same sym/strike/exp/side/qty/fill) merge under `legKey`
  (date-based, no time) → rare under-count; could fold in Schwab `activityId` for precision
- Open position unrealized P&L not yet wired to live quotes (quotes feed exists; per-position display TODO)
- Background/auto sync not implemented — manual "Sync Now" only (token refresh is proactive but per-request)
- `daysHeld` field not tracked in flat Trade type — no holding-period-based LT gains
- Tax estimates are illustrative only — no CPA review
- Wash sale detection is approximate (loss trades, not verifying re-purchase timing)
- Schwab token/secret stored in Turso `settings` (plaintext) — acceptable for single-user; revisit if multi-user
