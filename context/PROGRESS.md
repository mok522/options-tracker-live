# Progress
_Updated 2026-06-09_

## Current status
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

## Backlog (post-reconciliation)
- [ ] Notes/tags field per trade ("earnings play", "hedge", etc.)
- [ ] Position sizing column (% of account per trade)
- [ ] Average days held metric
- [x] Profit factor display (gross wins ÷ gross losses) — live in Dashboard
- [ ] Export filtered trades to CSV (button wired up but handler not implemented)
- [ ] Unrealized P&L for open positions (requires manual price entry or market data)
- [ ] User-selectable marginal tax bracket (currently hardcoded at 24%)
- [ ] Max drawdown metric
- [ ] Live ticker quotes in Topbar (currently static sample data)

## Known gaps / issues
- Open position P&L shows as flat number (no market data feed)
- `daysHeld` field not tracked in flat Trade type — no holding-period-based LT gains
- Tax estimates are illustrative only — no CPA review
- Wash sale detection is approximate (loss trades, not verifying re-purchase timing)
- Strategy detection relies on CSV data having a Strategy/Spread column populated
- Topbar ticker quotes are hardcoded (SPX 5431.20, NDX 19284.6, VIX 13.84)
