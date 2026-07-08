# Position P&L History — Design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Track each open position's unrealized P&L over time so the trader can see where the
position sits relative to its own history. Accessed from the Open Positions tab:
clicking a position slides out a panel with a history chart and a percentile-of-range
metric.

## Requirements

- Persist a daily point-in-time mark and unrealized P&L for every open position.
- Capture happens automatically once per trading day via a scheduled job hitting the
  Schwab API (reusing the existing positions-endpoint pipeline).
- Clicking a row in Open Positions opens a slide-out panel with:
  - a line chart of daily P&L over time (high/low marked),
  - a headline "percentile of range" metric,
  - best day / worst day / days-tracked stats.
- Snapshot history is kept forever, including after the position closes.

## Data storage

New Turso table `position_snapshots`:

| column         | type    | notes                                                        |
|----------------|---------|--------------------------------------------------------------|
| `position_key` | text    | same key as `positionKey()` in `lib/openAnalytics.ts`        |
| `date`         | text    | `YYYY-MM-DD`; composite primary key with `position_key`      |
| `mark`         | real    | per-contract mark price                                      |
| `unrealized_pl`| real    | dollar P&L across the position's open legs                   |
| `qty`          | integer | contracts open at capture time                               |
| `captured_at`  | text    | full ISO timestamp                                           |

Upsert on `(position_key, date)` — re-running the job on the same day overwrites that
day's row, so the job is idempotent. No retention/cleanup logic.

## Daily snapshot job

- New route: `GET /api/cron/snapshot`.
- Auth: `CRON_SECRET` env var, checked against the `Authorization: Bearer <secret>`
  header that Vercel Cron sends. Fail-closed: missing env var or wrong header → 401.
- The app-login middleware exempts this path; the secret check replaces the session
  gate for this route only.
- Schedule (in `vercel.json` crons): `30 21 * * 1-5` UTC — roughly 4:30pm ET after
  market close. Hobby-plan timing drift is acceptable because the Schwab positions
  endpoint holds the last mark after hours.
- Job flow: refresh Schwab token → `fetchOpenOptionMarks()` → load open legs from the
  `trades` table → aggregate per `positionKey` (same matching as
  `computeOpenAnalytics`) → upsert one row per open position.
- Errors: 401 unauthorized, 503 if the Schwab token refresh fails. Failures surface in
  Vercel logs. A missed day is simply a gap in the chart — no backfill.

## UI — slide-out panel

- Open Positions table rows become clickable.
- Panel slides in from the right; on mobile (≤1000px) it covers the full viewport
  width. Dismiss via close button, backdrop click, or Escape.
- Contents:
  - Header: symbol, strike / expiration / type / side, current mark, current P&L.
  - Headline metric: **percentile of range** — where today's P&L sits between the
    historical min and max (`(current − min) / (max − min)`), e.g. "74th percentile
    of tracked history". Colored with `--pos` / `--neg` only.
  - Line chart of daily unrealized P&L, styled consistently with existing chart
    components, with high and low points marked.
  - Stats row: best day, worst day, days tracked.
- Fewer than 2 snapshots → panel opens with an empty-state message: "History builds
  up as daily snapshots accumulate."
- Data access: server action `fetchPositionHistory(positionKey)` returning the
  position's snapshot rows ordered by date.

## Decisions

- **Store both P&L and mark** — P&L stays correct if cost-basis logic changes; mark
  keeps points recomputable.
- **Percentile of range** as the single headline relative metric (rejected: drawdown
  from high-water mark as headline; can be added later).
- **Keep history forever** (rejected: delete on close, 90-day retention) — rows are
  tiny and post-trade analysis stays possible.
- **Vercel Cron only** (rejected: snapshot-on-visit fallback) — acceptable to miss a
  day; keeps the code path single.

## Testing

- Unit tests: percentile calculation (including flat-range and single-point edge
  cases) and the snapshot aggregation from open legs + marks.
- Manual: hit the cron route locally with the secret, confirm rows in Turso, open the
  panel and verify chart/metric.

## Ops note

`CRON_SECRET` must be added to Vercel env vars by the user (never by Claude). A local
value goes in `.env.local` for dev testing.
