# Stock P&L Tracking — Design

**Date:** 2026-07-13
**Status:** Approved

## Goal

Track realized (and open) stock positions from Schwab sync so share sales —
including covered-call assignment sales — show their P&L alongside options.
Motivating case: a HOOD covered call assigned on 2026-07-10 booked the option
premium ($216) but the $11,000 share sale (+$1,300 vs the $97 assignment
cost basis) was invisible to the app.

## Decisions (from brainstorming)

- **Track ALL stock trades**, not only assignment-linked ones. Schwab's
  transaction history carries every equity TRADE (verified live: 21 equity
  transactions across the full lookback), so cost basis comes from sync — no
  manual entry. (Rejected: assignment-linked-only — fragile linking, misses
  wheel-strategy context.)
- **Roll stock P&L into all headline aggregates** (Dashboard Net Realized,
  win rate, monthly bars, Trades table) with a Type filter to split when
  wanted. (Rejected: separate stock section.)
- **Tax: full holding-period split** — stock round trips bucket into
  short-term (≤1yr) vs long-term (>1yr) from their FIFO-matched open/close
  dates; the Tax Exposure "Long-term" line (currently hardcoded $0) becomes
  real. Options keep existing ST/§1256 treatment.
- **Open Positions tab stays options-only** (user preference). Open share
  lots appear only as Open rows in the Trades table.

## Data model

`trades` table (and the `Trade` type) gain two columns:

| column      | type | notes                                                       |
|-------------|------|-------------------------------------------------------------|
| `asset_type`| text | `'OPTION'` (default — backfills existing rows) or `'EQUITY'`|
| `open_date` | text | `YYYY-MM-DD` of the FIFO-matched opening leg; null/'' when unknown (orphan closes, P&L-column CSV rows) |

Stock rows: `strike: ''`, `exp: ''`, `optType: ''`, `strat: 'Stock'`;
`qty` = share count, `fill` = per-share price.

## Sync adapter (`lib/schwab/adapter.ts`)

- TRADE transactions: also emit legs for `assetType === 'EQUITY'` transfer
  items — side from amount sign (neg = Sell), qty = |amount| shares, fill =
  per-share price, status from `positionEffect` (OPENING → Open, CLOSING →
  Closed), order fees allocated pro-rata as today (options + shares share the
  fee pool by |amount| — acceptable at this scale).
- Assignment share sales arrive as ordinary CLOSING equity TRADEs, so they
  flow through with zero assignment-specific logic.
- RECEIVE_AND_DELIVER handling (option assignment removals) is unchanged.

## FIFO matching (`lib/csvParser.ts` buildPositions)

- Multiplier-aware P&L: **×100 for options, ×1 for equity**
  (stock P&L = (sell − buy) × shares).
- FIFO key for stock degenerates to `SYM|||` — correct: all lots of a symbol
  match against each other.
- Expiration fallback skips equity (no expiry): unmatched share lots stay
  Open with pl 0.
- Matched round trips record `openDate` from the opening lot (options too).
- Partial lots already handled by the existing fan-in loop (e.g. AMD
  10 + 10 buys closed by one 20-share sell → two round trips).

## UI

- **TradesView**: Type filter (All / Options / Stocks) alongside the existing
  Status/Strategy filters; stock rows render '—' for Strike/Exp; aggregates
  unchanged (they sum whatever the filters admit).
- **OpenPositionsView**: filter input trades to `assetType === 'OPTION'` so
  share lots never enter the option analytics.
- **DashboardView**: "Open Positions" tile counts option positions only
  (matches the tab); all other aggregates include stock naturally. Strategy
  donut gains a "Stock" slice (it keys off `strat`).
- Design tokens: no new colors; P&L stays `--pos`/`--neg`.

## Tax (`components/tax/TaxView.tsx` + wherever the calcs live)

- Stock closed rows: holding period = close `date` − `openDate`; > 365 days →
  long-term bucket, else short-term. Missing `openDate` → short-term
  (conservative).
- Options: unchanged (short-term + §1256 60/40 for index symbols).
- Dashboard tax sidebar mirrors the same split.

## Untouched

- Position snapshot cron: stock legs produce no option `positionKey`; the
  Open Positions filter also excludes them explicitly. No snapshot changes.
- CSV import stays options-only (TOS CSV stock rows are filtered out by the
  existing exp-required rule; sync is the stock source of record).

## Acceptance case (real data)

HOOD: buy 100 @ $97.00 (2026-02-12, put assignment) → sell 100 @ $110.00
(2026-07-10, call assignment) ⇒ one stock round trip, pl **+$1,300**,
status Closed, short-term (150 days), shown in Trades and rolled into
Dashboard Net Realized P&L; the $216 Assigned option row is separate and
unchanged.

## Testing

- Adapter: equity TRADE fixture (mirrors live HOOD sale) → correct leg;
  mixed option+equity order fee allocation.
- FIFO: stock multiplier (×1), partial-lot fan-in, equity skips expiration
  fallback, openDate recorded.
- Tax: holding-period bucketing incl. the 365-day boundary and missing
  openDate fallback.
- End-to-end: re-sync against live account → HOOD stock round trip appears
  with +$1,300; Open Positions tab shows no share lots.

## Migration note

`asset_type` default `'OPTION'` backfills every existing row correctly.
`open_date` starts empty; the next recompute/sync fills it for FIFO-matched
rows (persisted raw legs are re-matched on every import, so historical round
trips gain openDate without manual backfill).
