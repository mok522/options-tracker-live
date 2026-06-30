# Decisions
_Created 2026-06-08_

## App-level login: single password gate (2026-06-29)
**Decision**: Gate the whole app behind one shared password, enforced by a signed
httpOnly session cookie verified in `middleware.ts`. No per-user accounts, no auth
provider. Spec: `docs/superpowers/specs/2026-06-29-app-password-gate-design.md`.
**Rationale**: It's a single-user personal app (one Turso DB, one Schwab account).
A password gate is proportionate, adds zero dependencies, and keeps the session
stateless (HMAC of an expiry — no session table, no DB read in middleware).
**Tradeoff**: One shared secret rather than real identity; no rate-limiting/lockout
(acceptable for one user — flagged as a future add). Rejected: Auth.js/OAuth provider
(overkill for one user) and stored username+password (password-gate with extra steps).

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

## Full-history sync, not incremental since last_sync_at
**Decision**: Every sync pages backwards through all available history (up to 6 years, in <364-day windows) and relies on `legKey` dedup to skip already-persisted legs.
**Rationale**: `last_sync_at` incremental sync was the original approach but caused data gaps: the very first sync set `last_sync_at`, so the second sync only pulled new trades and missed historical data. Full-history paging is idempotent (same legKey = skipped), so there's no cost to re-pulling old windows.
**Tradeoff**: Slightly more API calls per sync. Schwab's actual history retention (~2 years for this account) bounds the practical cost.

## Schwab adapter: `assetType` field, not `type`
**Decision**: Discriminate option vs. non-option transferItems using `instrument.assetType === 'OPTION'`, not `instrument.type`.
**Rationale**: Live Schwab responses use `assetType` to identify the instrument category. `type` on the instrument is a different field (e.g. `"VANILLA"`). The original adapter used `type !== 'OPTION'`, which caused every option leg to be skipped (0 transactions synced).
**Tradeoff**: None — this is the correct field per live API verification.

## Open-position marks: parse strike/expiry from the OCC `symbol`, not discrete fields (2026-06-29)
**Decision**: `fetchOpenOptionMarks` (`lib/schwab/positions.ts`) derives each held
option's strike, expiration, and call/put from the OCC `instrument.symbol`
(e.g. `"AAP   270319C00060000"`), falling back to `strikePrice`/`expirationDate`
only when present.
**Rationale**: Verified against the live account — the `/accounts/{hash}?fields=positions`
endpoint returns `strikePrice` and `expirationDate` as `undefined`; they exist only
encoded in the OCC symbol. The original code required those discrete fields, so it
skipped every option (0 marks) and "P&L Since Open" showed `—` for all legs. After
parsing the symbol, all 14 open legs matched and computed P&L cross-checked within
~$1 of Schwab's own `openProfitLoss`.
**Tradeoff**: Relies on the fixed 21-char OCC format (6-char root + YYMMDD + C/P +
8-digit strike×1000). A non-standard symbol fails the regex and degrades to "no mark"
rather than throwing. Note: marks come from `marketValue`, which Schwab holds at the
last mark — so P&L populates outside market hours too (it just stops updating).

## Schwab adapter: commissions as separate CURRENCY transferItems
**Decision**: Sum all non-OPTION transferItems' `cost` field as the order's total fees, then allocate proportionally to each option leg by contract count.
**Rationale**: Schwab doesn't embed commissions in the option leg price. Fees arrive as separate `CURRENCY` transferItems with `feeType` values (COMMISSION, SEC_FEE, OPT_REG_FEE, TAF_FEE) and a negative `cost`. This matches the `Trade.comm` convention (leg-total, not per-contract).
**Tradeoff**: Allocation is proportional (not per-contract-type weighted), which is accurate for single-leg orders and approximate for multi-leg orders with mixed contract counts.

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

## OAuth callback on fixed port 3001 via HTTPS proxy
**Decision**: Next.js runs HTTP on port 3000; a local Node HTTPS proxy (`scripts/https-proxy.mjs`) listens on 3001 and forwards traffic. The Schwab redirect URI is registered as `https://localhost:3001/api/auth/callback`.
**Rationale**: Schwab requires HTTPS for the OAuth redirect. `next dev --experimental-https` was tried first but hangs on this machine (TLS handshakes complete but no response bytes are ever returned — confirmed a local Turbopack bug). The proxy workaround adds no new dependencies (Node built-in `https`/`net` modules) and is transparent to the app.
**Tradeoff**: Two terminal processes required in dev. Port 3001 must be free. `next.config.ts` needs `allowedDevOrigins` to prevent cross-origin HMR blocks across the proxy.

## Schwab API: encrypted account hash required
**Decision**: Store and use `hashValue` (from `/trader/v1/accounts/accountNumbers`) for all `/trader/v1/accounts/{id}/transactions` API calls, not the plain account number.
**Rationale**: Schwab's Trader API requires the encrypted hash in URL paths — using the plain account number returns a 400/404. `resolveAccount()` in `lib/schwab/accounts.ts` fetches the hash on first connect and caches it in `settings['schwab_account_hash']`.
**Tradeoff**: Extra API call on first sync (amortized by caching). `clearTokens()` must also clear the cached hash.

## Storage: Turso (libSQL) + Drizzle ORM
**Decision**: Persist all data (trades, raw legs, settings) in a Turso cloud database via Drizzle ORM server actions.
**Rationale**: Replaced earlier browser-only `localStorage` approach (see superseded note). Turso is serverless, cheap, and allows the same data to survive browser clears and be accessed from Next.js server actions — required once the Schwab token and account hash needed secure server-side storage.
**Tradeoff**: Requires TURSO_DATABASE_URL + TURSO_AUTH_TOKEN env vars. Data lives on a third-party service.

_Superseded (2026-06-08 original): `window.storage` / `localStorage` with key `tos-trades`. Replaced because server actions cannot access browser storage._

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
