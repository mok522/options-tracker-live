# Decisions
_Created 2026-06-08_

## Data source: Charles Schwab Developer API (supersedes CSV-only, 2026-06-27)
**Decision**: Trade data syncs directly from the Schwab Trader API via OAuth 2.0.
The CSV import UI was fully removed. A manual "Sync Now" button pulls the
`/transactions` endpoint; trades flow through the existing import pipeline.
**Rationale**: Removes the export/re-import friction of the CSV flow. Enables live
market data (quotes) the CSV never could. The thin-adapter approach (Schwab JSON →
existing `Trade` shape) preserves all verified business logic.
**Tradeoff**: Requires Schwab Developer credentials and OAuth setup. Adds a live
dependency on Schwab API availability and the 30-min/7-day token lifecycle. Earlier
CSV-only rationale (below) is retained for historical context but no longer applies.

### Superseded: CSV import only (no manual entry)
_Original 2026-06-08 — replaced by Schwab API above._
All trade data entered through ThinkOrSwim account statement CSV export, no manual
entry. Chosen to eliminate data-entry errors and match broker records, at the cost
of manual re-import and no real-time data.

## Schwab integration: thin adapter, not parallel data model
**Decision**: Convert Schwab transaction JSON into the existing `Trade` leg shape
in `lib/schwab/adapter.ts`, then feed the unchanged `importTrades` pipeline.
Schwab legs take the `hasPnl=false` FIFO-matching path (no realized-P&L column).
**Rationale**: Keeps every piece of verified logic (dedup, FIFO, pnlEngine,
taxEngine, analytics) untouched — lowest-risk path. New code is isolated to
`lib/schwab/` and a few route handlers/actions.
**Tradeoff**: Adapter must carefully map Schwab's format (commission signs, OCC
symbols, position effects) to the TOS-derived `Trade` shape; mappings need
verification against live API responses.

## Schwab tokens stored in Turso `settings` table
**Decision**: Persist `schwab_tokens` (access + refresh + expiry) as JSON in the
existing key-value `settings` table. `getValidToken()` refreshes proactively when
<5 min remain.
**Rationale**: No schema change needed; single-user app; server actions already
read/write `settings`. Proactive refresh avoids mid-request 401s.
**Tradeoff**: Tokens stored in plaintext. Acceptable for a single-user personal
app; would need encryption / per-user isolation before any multi-user deployment.

## OAuth callback on fixed port 3001
**Decision**: `.claude/launch.json` sets `autoPort: false`; the dev server must
run on 3001 to match the registered `SCHWAB_REDIRECT_URI`.
**Rationale**: Schwab validates the redirect URI exactly against the app
registration; a dynamic port would break the callback.
**Tradeoff**: Port 3001 must be free; preview tooling cannot reassign it.

## Storage: browser key-value persistence (no server)
**Decision**: Use `window.storage` (artifact storage API) with key `tos-trades`. Personal data, not shared.
**Rationale**: Zero infrastructure, zero cost, works offline, no login required, data stays private on the user's device.
**Tradeoff**: Data tied to the browser/session. No cross-device sync. Clearing browser data loses trades. Mitigated by: re-import is always possible from the original CSV.

## No Chart.js — custom SVG charts
**Decision**: All charts are hand-built SVG components in `charts.jsx`, not Chart.js or any chart library.
**Rationale**: Design requires precise visual control — specific colors from CSS tokens, baked tooltips, smooth Catmull-Rom curves, exact bar sizing. Chart.js cannot consume CSS variables natively and adds ~200KB for modest gain.
**Tradeoff**: More code to maintain. SVG charts are static (no hover tooltips at runtime — tooltips are "baked" into the last data point).

## Design system: IBM Plex Sans + custom tokens
**Decision**: IBM Plex Sans as the sole typeface. Full token set in `theme.css` scoped under `.dash`.
**Rationale**: IBM Plex Sans has excellent tabular figure support, reads well at small sizes (critical for data tables), has a terminal/trading aesthetic without being retro. Tokens scoped to `.dash` prevent bleed into surrounding UI chrome.
**Tradeoff**: Google Fonts dependency (one import). Must be loaded before render to avoid FOUT.

## P&L colors reserved exclusively for gains/losses
**Decision**: `--pos` and `--neg` are never used for anything other than P&L values. Accent (`--accent`) is used for interactive elements, Buy side, open status.
**Rationale**: In trading UIs, color-coding of gains/losses is a hard convention. Using green for anything else (success states, buttons, etc.) creates ambiguity about whether the user is looking at a monetary value.

## Strategy detection: heuristic, not user-defined
**Decision**: Strategy is inferred from the CSV `Spread` field and option type/side, not entered by the user.
**Rationale**: Reduces friction at import. ThinkOrSwim's spread descriptions are consistent enough for reliable detection of the most common strategies.
**Tradeoff**: Complex custom spreads or unusual naming may be classified as "Other". User cannot correct a misclassification. Future enhancement: allow user to override strategy on individual trades.

## Deduplication: hash of execTime + symbol + price + qty
**Decision**: Each trade gets an ID = `btoa(execTime|symbol|price|qty)`. Re-importing the same CSV skips existing IDs.
**Rationale**: Makes import idempotent — users can safely re-import overlapping date ranges without double-counting.
**Tradeoff**: Two different fills at the exact same time/symbol/price/qty (very rare) would be treated as one. Acceptable edge case.

## Tax calculations: estimates only, two fixed brackets
**Decision**: Show estimated tax at 22% and 32% brackets. No user-configurable rate. Disclaim as estimates.
**Rationale**: Providing a false sense of precision in tax calculations is worse than clearly communicating they are rough estimates. Most retail traders fall in these brackets.
**Tradeoff**: Users at other brackets see less relevant numbers. Future enhancement: bracket selector dropdown.

## Layout: Variation 3 "Dense Bento" chosen over Variations 1 and 2
**Decision**: Implement the Dense Bento layout (Bloomberg-style panelized grid) as the primary layout.
**Rationale**: The target user is an active trader comfortable with data-dense UIs. Variation 1 (sidebar) wastes horizontal space on a single-user app. Variation 2 (hero chart) de-emphasizes the KPI tiles. Variation 3 surfaces the most information at a glance.
**Tradeoff**: Higher visual complexity — less appropriate for a first-time options trader. Acceptable given the target user profile.

## Section 1256 detection: symbol-based whitelist
**Decision**: Trades are flagged as §1256 contracts if their symbol is in `['SPX', 'NDX', 'RUT', 'SPXW', 'XSP', 'VIX']`.
**Rationale**: These are the most common broad-based index options that qualify for §1256 60/40 treatment. Symbol matching is simple and reliable.
**Tradeoff**: Does not cover all §1256-eligible contracts (e.g., some futures). User should confirm eligibility with a tax professional.

## Wash sale detection: 30-day same-symbol window
**Decision**: Flag a trade as a potential wash sale if it is a loss AND another trade on the same symbol appears within 30 days after the close.
**Rationale**: Simple first-pass detection catches the most obvious wash sale risks.
**Tradeoff**: Does not check for substantially identical securities (e.g., SPY vs. SPYG). False positives possible. Framed as "flags" not "violations" — user must consult a CPA.
